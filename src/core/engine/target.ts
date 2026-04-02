import type { BuffState } from '../apl/evaluator';

/**
 * Represents an individual enemy target in the simulation.
 * Each target has independent health tracking.
 * Mirrors SimC's `enemy_t` in a simplified form.
 */
export interface Target {
  /** 0-indexed target ID. 0 = primary target. */
  readonly id: number;
  /** Maximum health of this target. */
  readonly maxHealth: number;
  /** Current health (decreases as damage is dealt, minimum 1 for training dummies). */
  currentHealth: number;
  /** Health as a percentage (0–100). Derived from currentHealth/maxHealth. */
  healthPct: number;
  /** Target-side debuffs / DoT auras tracked independently per enemy. */
  debuffs: Map<string, BuffState>;
}

export const TARGET_KILL_RANGE_PCT = 15;

/**
 * Derive a patchwerk-style target health pool large enough that execute abilities
 * can still enter true kill range near the end of the fight.
 */
export function deriveTargetMaxHealthForKillRange(playerMaxHealth: number): number {
  const maxHealth = Math.max(0, playerMaxHealth);
  if (maxHealth <= 0) {
    return 0;
  }

  return Math.max(
    maxHealth / (TARGET_KILL_RANGE_PCT / 100),
    maxHealth,
  );
}

/**
 * Create a new target with full health.
 */
export function createTarget(id: number, maxHealth: number): Target {
  return {
    id,
    maxHealth,
    currentHealth: maxHealth,
    healthPct: maxHealth > 0 ? 100 : 100,
    debuffs: new Map(),
  };
}
