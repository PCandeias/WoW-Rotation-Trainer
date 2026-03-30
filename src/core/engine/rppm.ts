/**
 * RPPM (Real Procs Per Minute) system.
 *
 * Models WoW's RPPM mechanic where trinkets/enchants have a proc rate expressed
 * in procs per minute. The proc chance for any given attempt depends on the
 * elapsed time since last trigger attempt (capped), and can include the
 * SimC bad-luck protection (BLP) multiplier.
 */

import type { RngInstance } from './rng';

const MAX_INTERVAL_SECONDS = 3.5;
const MAX_BAD_LUCK_PROTECTION_SECONDS = 1000;

// ---------------------------------------------------------------------------
// RppmTracker interface
// ---------------------------------------------------------------------------

export interface RppmTracker {
  procRate: number;        // procs per minute
  hastenScales: boolean;   // whether haste increases effective rate
  badLuckProtectionEnabled: boolean; // SimC real_ppm_t BLP flag
  lastAttemptTime: number; // sim time of last attempt (defaults to 0, matching SimC reset)
  lastProcTime: number;    // sim time of last successful proc (-1 = never procced)
  accumulatedBadLuckTime: number; // total BLP accumulation in seconds since last proc
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new RPPM tracker.
 * @param procRate - Procs per minute (e.g. 2.0 for 2 procs/min)
 * @param hastenScales - Whether haste increases the effective proc rate (default: false)
 * @param badLuckProtectionEnabled - Whether SimC BLP multiplier is enabled (default: true)
 */
export function createRppmTracker(
  procRate: number,
  hastenScales = false,
  badLuckProtectionEnabled = true
): RppmTracker {
  return {
    procRate,
    hastenScales,
    badLuckProtectionEnabled,
    lastAttemptTime: 0,
    lastProcTime: -1,
    accumulatedBadLuckTime: 0,
  };
}

// ---------------------------------------------------------------------------
// attemptProc
// ---------------------------------------------------------------------------

/**
 * Attempt a proc roll for this tracker at the given simTime.
 * Returns true if proc occurs, false otherwise. Mirrors SimC real_ppm_t::trigger:
 * - if procRate <= 0, never procs
 * - if an attempt already happened at this exact simTime, do nothing and fail
 * - elapsed time contribution per attempt is capped to 3.5s
 * - BLP uses accumulated capped elapsed time, with SimC multiplier formula
 * - on success, accumulated BLP resets to 0
 *
 * Formula:
 *   elapsed = min(simTime - lastAttemptTime, 3.5)
 *   coeff = hastenScales ? (1 + hastePercent / 100) : 1.0
 *   realRppm = procRate × coeff
 *   baseChance = realRppm × (elapsed / 60)
 *   blpMult = max(1, 1 + ((min(accumulatedBadLuckTime, 1000) / (60 / realRppm) - 1.5) * 3))
 *   finalChance = baseChance × (BLP enabled ? blpMult : 1)
 */
export function attemptProc(
  tracker: RppmTracker,
  simTime: number,
  hastePercent: number,
  rng: RngInstance
): boolean {
  if (tracker.procRate <= 0) {
    return false;
  }

  if (tracker.lastAttemptTime === simTime) {
    return false;
  }

  const elapsed = Math.max(0, Math.min(simTime - tracker.lastAttemptTime, MAX_INTERVAL_SECONDS));
  tracker.accumulatedBadLuckTime += elapsed;

  const hasteMod = tracker.hastenScales ? 1 + hastePercent / 100 : 1.0;
  const realRppm = tracker.procRate * hasteMod;
  const baseChance = realRppm * (elapsed / 60);

  let procChance = baseChance;
  if (tracker.badLuckProtectionEnabled && realRppm > 0) {
    const lastSuccess = Math.min(tracker.accumulatedBadLuckTime, MAX_BAD_LUCK_PROTECTION_SECONDS);
    const expectedAverageProcInterval = 60 / realRppm;
    const blpMultiplier = Math.max(1, 1 + ((lastSuccess / expectedAverageProcInterval - 1.5) * 3));
    procChance = baseChance * blpMultiplier;
  }

  // Clamp to [0, 1] and roll directly.
  const clampedChance = Math.max(0, Math.min(procChance, 1));

  tracker.lastAttemptTime = simTime;

  const didProc = rng.next() < clampedChance;
  if (didProc) {
    tracker.lastProcTime = simTime;
    tracker.accumulatedBadLuckTime = 0;
  }
  return didProc;
}
