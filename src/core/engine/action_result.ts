// src/core/engine/action_result.ts
import { EventType } from './eventQueue';
import type { SimEvent, SimEventQueue } from './eventQueue';
import type { GameState } from './gameState';
import type { ActionResult } from './action';

export function applyActionResult(
  state: GameState,
  queue: SimEventQueue,
  collected: SimEvent[],
  result: ActionResult,
): void {
  for (const adj of result.cooldownAdjustments) {
    state.adjustCooldown(adj.spellId, adj.delta);
  }
  for (const buff of result.buffsApplied) {
    state.applyBuff(buff.id, buff.duration, buff.stacks);
    collected.push({ type: EventType.BUFF_APPLY, time: state.currentTime, buffId: buff.id });
    queue.push({ type: EventType.BUFF_APPLY, time: state.currentTime, buffId: buff.id });
  }
  for (const event of result.newEvents) {
    collected.push(event);
    queue.push(event);
  }
}
