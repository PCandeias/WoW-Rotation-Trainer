/**
 * Simulation engine module.
 * Provides the core combat simulation logic — no DOM, no React.
 */

export { GameState, createGameState } from './gameState';
export type { GameStateSnapshot, EncounterConfig } from './gameState';

export { SimEventQueue, PriorityQueue, EventType } from './eventQueue';
export type { SimEvent, DamageSnapshot, SpellId as EventQueueSpellId, BuffId } from './eventQueue';

export { calculateDamage, captureSnapshot } from './damage';
export type { DamageResult } from './damage';

export { executeAbility } from './executor';
export type { ExecutionResult } from './executor';

export { initAutoAttacks, processAutoAttack, swingInterval } from './autoAttack';

export { processChannelTick, processChannelEnd } from './channel';
export type { ChannelTickEvent } from './channel';
export { processDotTickDetailed } from './dot';
export type { DotTickEvent } from './dot';

export { createRppmTracker, attemptProc } from './rppm';
export type { RppmTracker } from './rppm';

export { tryQueueAbility, drainQueue, DEFAULT_QUEUE_WINDOW } from './spellQueue';

export { GameLoop } from './gameLoop';
export type { GameLoopConfig } from './gameLoop';

export { runHeadless } from './headless';
export type { HeadlessConfig, SimResult, CastRecord } from './headless';
