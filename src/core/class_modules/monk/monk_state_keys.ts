// src/core/class_modules/monk/monk_state_keys.ts
/**
 * Monk-owned numeric state keys and typed helper accessors.
 *
 * All monk-specific counters, timestamps, and boolean flags are stored in
 * `IGameState.numericState` under these keys.  Callers use the helpers below
 * instead of manipulating raw string keys.
 *
 * Boolean flags are stored as 0 | 1.
 * `nextCombatWisdomAt` defaults to +Infinity (uses `getOptionalNumericState`
 * so that 0 is not confused with "not yet scheduled").
 */

import type { IGameState } from '../../engine/i_game_state';

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

export const MONK_KEY_FLURRY_CHARGES = 'monk_flurry_charges';
export const MONK_KEY_HIT_COMBO_STACKS = 'monk_hit_combo_stacks';
export const MONK_KEY_NEXT_COMBAT_WISDOM_AT = 'monk_next_combat_wisdom_at';
export const MONK_KEY_DUAL_THREAT_MH = 'monk_dual_threat_mh_allowed';
export const MONK_KEY_DUAL_THREAT_OH = 'monk_dual_threat_oh_allowed';

// ---------------------------------------------------------------------------
// Flurry charges
// ---------------------------------------------------------------------------

/** Read the current flurry charge count. */
export function getMonkFlurryCharges(state: IGameState): number {
  return state.getNumericState?.(MONK_KEY_FLURRY_CHARGES) ?? 0;
}

// ---------------------------------------------------------------------------
// Hit Combo stacks
// ---------------------------------------------------------------------------

/** Read the current Hit Combo stack count. */
export function getMonkHitComboStacks(state: IGameState): number {
  return state.getNumericState?.(MONK_KEY_HIT_COMBO_STACKS) ?? 0;
}

/** Write the current Hit Combo stack count. */
export function setMonkHitComboStacks(state: IGameState, value: number): void {
  state.setNumericState?.(MONK_KEY_HIT_COMBO_STACKS, value);
}

// ---------------------------------------------------------------------------
// Combat Wisdom next-tick timestamp
// ---------------------------------------------------------------------------

/**
 * Returns the sim time at which the next Combat Wisdom tick fires.
 * Defaults to `+Infinity` when no tick is scheduled.
 *
 * Uses `getOptionalNumericState` so that a stored `0` (though never expected)
 * would not be confused with "unset".  `setMonkNextCombatWisdomAt` uses the
 * regular `setNumericState`, which deletes the key for value `0`; call sites
 * always write `currentTime + 15`, so `0` is never passed in practice.
 */
export function getMonkNextCombatWisdomAt(state: IGameState): number {
  const val = state.getOptionalNumericState?.(MONK_KEY_NEXT_COMBAT_WISDOM_AT);
  return val ?? Number.POSITIVE_INFINITY;
}

/** Write the next Combat Wisdom tick time. */
export function setMonkNextCombatWisdomAt(state: IGameState, value: number): void {
  state.setNumericState?.(MONK_KEY_NEXT_COMBAT_WISDOM_AT, value);
}

// ---------------------------------------------------------------------------
// Dual Threat armed flags
// ---------------------------------------------------------------------------

/** Returns true when the main-hand Dual Threat proc is armed. */
export function getMonkDualThreatMhAllowed(state: IGameState): boolean {
  return (state.getNumericState?.(MONK_KEY_DUAL_THREAT_MH) ?? 0) !== 0;
}

/** Set the main-hand Dual Threat armed state. */
export function setMonkDualThreatMhAllowed(state: IGameState, value: boolean): void {
  state.setNumericState?.(MONK_KEY_DUAL_THREAT_MH, value ? 1 : 0);
}

/** Returns true when the off-hand Dual Threat proc is armed. */
export function getMonkDualThreatOhAllowed(state: IGameState): boolean {
  return (state.getNumericState?.(MONK_KEY_DUAL_THREAT_OH) ?? 0) !== 0;
}

/** Set the off-hand Dual Threat armed state. */
export function setMonkDualThreatOhAllowed(state: IGameState, value: boolean): void {
  state.setNumericState?.(MONK_KEY_DUAL_THREAT_OH, value ? 1 : 0);
}
