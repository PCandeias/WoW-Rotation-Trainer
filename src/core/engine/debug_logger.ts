/**
 * SimC-compatible debug log formatting functions for the headless engine.
 *
 * All functions return a single formatted line (no trailing newline).
 * Timestamps are bare decimal seconds with 3 decimal places, matching SimC's
 * `log=1 debug=1` output format exactly.
 *
 * Spell IDs are resolved via a static lookup — unmapped IDs produce 0.
 */
import { MONK_WW_SPELLS } from '../data/spells/monk_windwalker';

/** Callback invoked for each formatted debug line (without trailing newline). */
export type DebugLine = (line: string) => void;

/** Resolve a spell/buff name to its numeric SimC spell ID, or 0 if unknown. */
export function resolveSpellId(name: string): number {
  return MONK_WW_SPELLS.get(name)?.id ?? 0;
}

const fmt3 = (n: number): string => n.toFixed(3);
const fmt2 = (n: number): string => n.toFixed(2);
const fmt6 = (n: number): string => n.toFixed(6);

/**
 * `{time} Player '{name}' performs Action '{spell}' ({id}) ({energy})`
 *
 * `energy` is the player's current primary resource (energy for WW) at cast time,
 * captured before `executeAbility` is called.
 */
export function fmtPerforms(
  time: number,
  playerName: string,
  spellName: string,
  spellId: number,
  energyAtCast: number,
): string {
  return `${fmt3(time)} Player '${playerName}' performs Action '${spellName}' (${spellId}) (${Math.round(energyAtCast)})`;
}

/**
 * `{time} Player '{name}' Action '{spell}' ({id}) hits Enemy '{target}' for {dmg} {school} damage ({outcome})`
 *
 * `outcome` is `'hit'` for non-crits and `'crit'` for crits.
 */
export function fmtHits(
  time: number,
  playerName: string,
  spellName: string,
  spellId: number,
  target: string,
  damage: number,
  school: string,
  outcome: 'hit' | 'crit',
): string {
  return `${fmt3(time)} Player '${playerName}' Action '${spellName}' (${spellId}) hits Enemy '${target}' for ${fmt6(damage)} ${school} damage (${outcome})`;
}

/**
 * `{time} Target Enemy '{target}' avoids Player '{name}' Action '{spell}' ({id}) ({outcome})`
 *
 * Exported for completeness; not called by any current emit point (spell avoidance
 * is not implemented in the headless engine — see spec Out of Scope).
 */
export function fmtAvoids(
  time: number,
  target: string,
  playerName: string,
  spellName: string,
  spellId: number,
  outcome: string,
): string {
  return `${fmt3(time)} Target Enemy '${target}' avoids Player '${playerName}' Action '${spellName}' (${spellId}) (${outcome})`;
}

/**
 * `{time} Player '{name}' Action '{spell}' ({id}) ticks ({tick} of {total}) on Enemy '{target}' for {dmg} {school} damage ({outcome})`
 */
export function fmtTick(
  time: number,
  playerName: string,
  spellName: string,
  spellId: number,
  tick: number,
  total: number,
  target: string,
  damage: number,
  school: string,
  outcome: 'hit' | 'crit',
): string {
  return `${fmt3(time)} Player '${playerName}' Action '${spellName}' (${spellId}) ticks (${tick} of ${total}) on Enemy '${target}' for ${fmt6(damage)} ${school} damage (${outcome})`;
}

/**
 * Returns two chi-spend lines (SimC emits them separately):
 *
 * Line 1: `{time} Player {name} loses {cost} ({cost}) chi. pct={pct}% ({chiAfter}/{chiMax})`
 * Line 2: `{time} Player '{name}' consumes {cost} chi for Action '{spell}' ({id}) (1)`
 *
 * Note: line 1 intentionally has NO quotes around player name (matching SimC).
 *
 * Only call this when `chiCost > 0`.
 */
export function fmtChiSpend(
  time: number,
  playerName: string,
  cost: number,
  chiAfter: number,
  chiMax: number,
  spellName: string,
  spellId: number,
): [string, string] {
  const pct = ((chiAfter / chiMax) * 100).toFixed(2);
  return [
    `${fmt3(time)} Player ${playerName} loses ${fmt2(cost)} (${fmt2(cost)}) chi. pct=${pct}% (${fmt2(chiAfter)}/${fmt2(chiMax)})`,
    `${fmt3(time)} Player '${playerName}' consumes ${Math.round(cost)} chi for Action '${spellName}' (${spellId}) (1)`,
  ];
}

/**
 * `{time} {name} gains {amount} ({amount}) chi from {source} ({chiAfter}/{chiMax})`
 *
 * Note: no "Player" prefix (matching SimC). Only call when `chiGained > 0`.
 */
export function fmtChiGain(
  time: number,
  playerName: string,
  amount: number,
  chiAfter: number,
  chiMax: number,
  source: string,
): string {
  return `${fmt3(time)} ${playerName} gains ${fmt2(amount)} (${fmt2(amount)}) chi from ${source} (${fmt2(chiAfter)}/${fmt2(chiMax)})`;
}

/**
 * `{time} Player '{name}' gains Buff '{buffId}' ({spellId}) (stacks={stacks}) (value={value}, time_duration_multiplier=1)`
 *
 * `time_duration_multiplier` is always the literal `1` — not sourced from game state.
 * Pass `value=0` when the buff magnitude is not tracked.
 */
export function fmtBuffGain(
  time: number,
  playerName: string,
  buffId: string,
  spellId: number,
  stacks: number,
  value: number,
): string {
  return `${fmt3(time)} Player '${playerName}' gains Buff '${buffId}' (${spellId}) (stacks=${stacks}) (value=${value}, time_duration_multiplier=1)`;
}

/**
 * `{time} Player '{name}' refreshes {buffId} (value={value}, duration={duration}, time_duration_multiplier=1)`
 *
 * `duration` = `buff.expiresAt - state.currentTime` after refresh; use `3600.000` for permanent buffs.
 * Pass `value=0` when the buff magnitude is not tracked.
 */
export function fmtBuffRefresh(
  time: number,
  playerName: string,
  buffId: string,
  value: number,
  duration: number,
): string {
  return `${fmt3(time)} Player '${playerName}' refreshes ${buffId} (value=${value}, duration=${fmt3(duration)}, time_duration_multiplier=1)`;
}

/**
 * `{time} Player '{name}' loses {buffId}`
 */
export function fmtBuffExpire(time: number, playerName: string, buffId: string): string {
  return `${fmt3(time)} Player '${playerName}' loses ${buffId}`;
}

/**
 * `{time} Player '{name}' {spell} schedule_ready(): cast_finishes={castFinishes} cast_delay={castDelay}`
 *
 * `castFinishes` = `state.gcdReady` (for on-GCD spells) or `state.currentTime` (off-GCD).
 * `castDelay` is always `0.000` — the lag sample is not available at this call site.
 */
export function fmtScheduleReady(
  time: number,
  playerName: string,
  spellName: string,
  castFinishes: number,
  castDelay: number,
): string {
  return `${fmt3(time)} Player '${playerName}' ${spellName} schedule_ready(): cast_finishes=${fmt3(castFinishes)} cast_delay=${fmt3(castDelay)}`;
}

/**
 * `{time} {name} traversing APL {listName}, n_actions={nActions} ({mode})`
 *
 * Note: no "Player" prefix (matching SimC).
 */
export function fmtAplTraversal(
  time: number,
  playerName: string,
  listName: string,
  nActions: number,
  mode: string,
): string {
  return `${fmt3(time)} ${playerName} traversing APL ${listName}, n_actions=${nActions} (${mode})`;
}

/**
 * `{time} {name} {spell} ({reason})`
 *
 * Used for APL action skip lines:
 * - `reason = 'condition false'` when the action's condition evaluated to 0
 * - `reason = 'not ready: <failReason>'` when `getAbilityFailReason` returned a value
 *
 * Note: no "Player" prefix (matching SimC).
 */
export function fmtAplSkip(
  time: number,
  playerName: string,
  spellName: string,
  reason: string,
): string {
  return `${fmt3(time)} ${playerName} ${spellName} (${reason})`;
}
