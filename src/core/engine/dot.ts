import { SimEventQueue, type EventType } from './eventQueue';
import type { SimEvent } from './eventQueue';
import type { GameState } from './gameState';
import { calculateDamage } from './damage';
import type { RngInstance } from './rng';
import { applyActionResult } from './action_result';

export type DotTickEvent = Extract<SimEvent, { type: EventType.DOT_TICK }>;

export interface DotTickResult {
  damage: number;
  isCrit: boolean;
}

export function processDotTickDetailed(
  event: DotTickEvent,
  state: GameState,
  rng: RngInstance,
  queue?: SimEventQueue,
): DotTickResult {
  if (!state.isTargetDebuffActive?.(event.debuffId, event.targetId)) {
    return { damage: 0, isCrit: false };
  }

  if ((state.getTargetDebuffInstanceId?.(event.debuffId, event.targetId) ?? 0) !== event.dotInstanceId) {
    return { damage: 0, isCrit: false };
  }

  const action = state.action_list?.get(event.spellId);
  if (action) {
    // action.dot_tick() handles damage calculation + state mutations directly.
    const result = action.dot_tick(state, rng, event.snapshot, event.tickNumber, event.targetId);
    applyActionResult(state, queue ?? new SimEventQueue(), [], result);
    return { damage: result.damage, isCrit: result.isCrit };
  }

  const spell = state.executionHooks.resolveSpellDef?.(state, event.spellId);
  if (!spell) {
    return { damage: 0, isCrit: false };
  }

  const result = calculateDamage(spell, state, rng, false, event.snapshot);
  state.addDamage(result.finalDamage, event.targetId);
  return { damage: result.finalDamage, isCrit: result.isCrit };
}
