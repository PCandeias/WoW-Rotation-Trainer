/**
 * Spell Queue Window system (Stage 3.8).
 *
 * Models WoW's input queue mechanic, where a player pressing an ability button
 * slightly before the GCD ends will have it automatically cast when the GCD expires.
 */

import type { GameState } from './gameState';
import { isCastLockedByActiveChannel } from './channel';

function isBlockedByActiveChannel(state: GameState, spellId: string): boolean {
  const spell = state.executionHooks.resolveSpellDef?.(state, spellId);
  if (!spell) {
    return false;
  }

  return isCastLockedByActiveChannel(state, spell);
}

function isBlockedByActiveCast(state: GameState): boolean {
  const activeCast = state.getActiveCast();
  return activeCast !== null && state.currentTime < activeCast.endsAt;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default spell queue window in seconds (400ms). */
export const DEFAULT_QUEUE_WINDOW = 0.4;

function effectiveQueuedWindow(state: GameState): number {
  return state.queuedWindow > 0 ? state.queuedWindow : DEFAULT_QUEUE_WINDOW;
}

export function peekQueuedAbility(state: GameState): string | null {
  return state.queuedAbility;
}

export function clearQueuedAbility(state: GameState): void {
  state.queuedAbility = null;
  state.queuedWindow = 0;
}

export function isQueuedAbilityExpiredAt(state: GameState, fireTime: number): boolean {
  if (state.queuedAbility === null) {
    return false;
  }

  const queueWindow = effectiveQueuedWindow(state);
  return Number.isFinite(queueWindow) && fireTime - state.queuedAt > queueWindow;
}

export function consumeQueuedAbility(state: GameState): string | null {
  const spellId = state.queuedAbility;
  clearQueuedAbility(state);
  return spellId;
}

// ---------------------------------------------------------------------------
// tryQueueAbility
// ---------------------------------------------------------------------------

/**
 * Attempt to queue an ability press by the player.
 * Returns true if queued, false if rejected (too early or GCD already ready).
 *
 * Queuing rules:
 * - If GCD is already ready → return false (ability should fire immediately by caller)
 * - If time remaining on GCD > queueWindow → return false (too early)
 * - If time remaining on GCD <= queueWindow → queue it (overrides any prior queued ability)
 *
 * @param state - The current game state
 * @param spellId - The spell to queue
 * @param queueWindow - How many seconds before GCD expiry to accept queued input (default: 0.4)
 */
export function tryQueueAbility(
  state: GameState,
  spellId: string,
  queueWindow?: number
): boolean {
  const window = queueWindow ?? DEFAULT_QUEUE_WINDOW;
  const blockedByActiveChannel = isBlockedByActiveChannel(state, spellId);
  const blockedByActiveCast = isBlockedByActiveCast(state);
  const gcdRemaining = state.gcdReady - state.currentTime;

  // GCD already ready — ability should be cast directly, not queued
  if (state.isGcdReady() && !blockedByActiveChannel && !blockedByActiveCast) {
    return false;
  }

  // If an active uninterruptible channel blocks this spell, keep the queued
  // input until the channel lock is released.
  if (blockedByActiveChannel || blockedByActiveCast) {
    state.queuedAbility = spellId;
    state.queuedAt = state.currentTime;
    state.queuedWindow = Number.POSITIVE_INFINITY;
    return true;
  }

  // Too early — outside queue window
  if (gcdRemaining > window) {
    return false;
  }

  // Within queue window — queue the ability (overrides any prior queued ability)
  state.queuedAbility = spellId;
  state.queuedAt = state.currentTime;
  state.queuedWindow = window;
  return true;
}

// ---------------------------------------------------------------------------
// drainQueue
// ---------------------------------------------------------------------------

/**
 * Check if a queued ability should fire now (called on GCD_READY).
 * If state.queuedAbility is set AND GCD is ready:
 *   - Expire it if it has become stale
 *   - Retrieve and clear the queued ability
 *   - Return the spellId
 * Otherwise return null.
 *
 * @param state - The current game state
 */
export function drainQueue(state: GameState): string | null {
  const queuedAbility = peekQueuedAbility(state);
  if (queuedAbility === null) {
    return null;
  }

  if (isBlockedByActiveChannel(state, queuedAbility)) {
    return null;
  }

  if (isBlockedByActiveCast(state)) {
    return null;
  }

  if (!state.isGcdReady()) {
    return null;
  }

  if (isQueuedAbilityExpiredAt(state, state.currentTime)) {
    clearQueuedAbility(state);
    return null;
  }

  return consumeQueuedAbility(state);
}
