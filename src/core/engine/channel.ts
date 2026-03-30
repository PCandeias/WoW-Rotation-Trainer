/**
 * Channel System — Stage 3.6 of the WoW Rotation Trainer.
 *
 * Processes CHANNEL_TICK and CHANNEL_END events for channeled spells
 * (Fists of Fury and Celestial Conduit).
 *
 * - processChannelTick: Deals one tick of channeled damage using the
 *   cast-time snapshot. Each tick has an independent crit roll.
 * - processChannelEnd: Applies end-of-channel FoF effects like Momentum Boost.
 */

import { SimEventQueue, EventType } from './eventQueue';
import type { SimEvent } from './eventQueue';
import type { GameState } from './gameState';
import { calculateDamage } from './damage';
import type { RngInstance } from './rng';
import { applyActionResult } from './action_result';
import type { SpellDef } from '../data/spells';

// ---------------------------------------------------------------------------
// Type alias
// ---------------------------------------------------------------------------

/** Narrowed type for CHANNEL_TICK SimEvent */
export type ChannelTickEvent = Extract<SimEvent, { type: EventType.CHANNEL_TICK }>;
/** Narrowed type for CHANNEL_END SimEvent */
export type ChannelEndEvent = Extract<SimEvent, { type: EventType.CHANNEL_END }>;

export interface ChannelTickResult {
  damage: number;
  isCrit: boolean;
}

export function canInterruptActiveChannelForCast(state: GameState, nextSpell: SpellDef): boolean {
  const activeChannel = state.getActiveChannel();
  if (!activeChannel) {
    return false;
  }

  const activeAction = state.action_list?.get(activeChannel.spellId);
  if (activeAction?.canCastWhileChannelingWithoutInterrupt(nextSpell)) {
    return false;
  }

  const interruptionAllowedByContext = state.executionHooks.allowChannelInterruptByCastAttempt?.(
    state,
    activeChannel.spellId,
    nextSpell,
  ) ?? true;
  if (!interruptionAllowedByContext) {
    return false;
  }

  return activeAction?.canBeInterruptedByCastAttempt(nextSpell) ?? false;
}

export function isCastLockedByActiveChannel(state: GameState, nextSpell: SpellDef): boolean {
  const activeChannel = state.getActiveChannel();
  if (!activeChannel) {
    return false;
  }

  const activeAction = state.action_list?.get(activeChannel.spellId);
  if (activeAction?.canCastWhileChannelingWithoutInterrupt(nextSpell)) {
    return false;
  }

  return !canInterruptActiveChannelForCast(state, nextSpell);
}

export function interruptActiveChannel(
  state: GameState,
  queue: SimEventQueue,
  rng: RngInstance,
): { spellId: string; channelId: number } | null {
  const activeChannel = state.getActiveChannel();
  if (!activeChannel) {
    return null;
  }

  const activeAction = state.action_list?.get(activeChannel.spellId);
  const interruptedChannel = state.interruptChannel();
  if (!interruptedChannel) {
    return null;
  }

  if (activeAction) {
    const interruptResult = activeAction.onCastInterrupted(queue, rng);
    applyActionResult(state, queue, [], interruptResult);
  }

  queue.push({
    type: EventType.CHANNEL_END,
    time: state.currentTime,
    spellId: interruptedChannel.spellId,
    channelId: interruptedChannel.channelId,
    interrupted: true,
  });

  return {
    spellId: interruptedChannel.spellId,
    channelId: interruptedChannel.channelId,
  };
}

/**
 * Process a CHANNEL_TICK event: deal one tick of channeled damage using
 * the cast-time snapshot. Independent crit roll per tick.
 * Returns damage dealt.
 */
export function processChannelTick(
  event: ChannelTickEvent,
  state: GameState,
  rng: RngInstance,
  queue?: SimEventQueue
): number {
  return processChannelTickDetailed(event, state, rng, queue).damage;
}

export function processChannelTickDetailed(
  event: ChannelTickEvent,
  state: GameState,
  rng: RngInstance,
  queue?: SimEventQueue,
): ChannelTickResult {
  if (event.channelId !== undefined && !state.isCurrentChannel(event.spellId, event.channelId)) {
    return { damage: 0, isCrit: false };
  }

  const action = state.action_list?.get(event.spellId);
  if (action) {
    const snapshot = event.snapshot;
    if (!snapshot) {
      return { damage: 0, isCrit: false };
    }
    // action.tick() handles damage calculation + state mutations directly
    const result = action.tick(state, rng, snapshot, event.tickNumber);
    applyActionResult(state, queue ?? new SimEventQueue(), [], result);
    return { damage: result.damage, isCrit: result.isCrit };
  }

  // 1. Look up the spell definition
  const spell = state.executionHooks.resolveSpellDef?.(state, event.spellId);
  if (!spell) {
    // Graceful unknown-spell handling
    return { damage: 0, isCrit: false };
  }

  // 2. Calculate damage using the frozen snapshot (isComboStrike=false for ticks;
  //    combo-strike benefit is captured in snapshot's masteryMultiplier at cast-start)
  const result = calculateDamage(spell, state, rng, false, event.snapshot);
  const damage = result.finalDamage;

  // 3. Record damage in state
  state.addDamage(damage);

  return { damage, isCrit: result.isCrit };
}

/**
 * Process a CHANNEL_END event: apply end-of-channel FoF effects.
 * Returns total end-of-channel bonus damage.
 *
 * - Flurry Charges are released at FoF cast start, matching SimC.
 * - Only Fists of Fury triggers Momentum Boost here.
 * - Celestial Conduit returns 0 bonus damage (effects handled elsewhere in MVP).
 */
export function processChannelEnd(
  eventOrSpellId: ChannelEndEvent | string,
  state: GameState,
  queue: SimEventQueue,
  rng: RngInstance
): number {
  const event: ChannelEndEvent =
    typeof eventOrSpellId === 'string'
      ? {
          type: EventType.CHANNEL_END,
          time: state.currentTime,
          spellId: eventOrSpellId,
        }
      : eventOrSpellId;

  if (event.interrupted) {
    return 0;
  }

  const completedChannel = event.channelId !== undefined
    ? state.completeChannel(event.spellId, event.channelId)
    : null;

  if (event.channelId !== undefined && !completedChannel) {
    return 0;
  }

  if (state.executionHooks.onChannelEnd?.(
    state,
    event,
    queue,
    completedChannel ? { startedAt: completedChannel.startedAt, endsAt: completedChannel.endsAt } : undefined,
  )) {
    return 0;
  }

  const action = state.action_list?.get(event.spellId);
  if (action) {
    const result = action.last_tick(state, queue, rng);
    applyActionResult(state, queue, [], result);
    return result.damage;
  }

  return 0;
}
