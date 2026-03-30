// src/core/class_modules/class_module.ts
import type { IGameState } from '../engine/i_game_state';
import type { Action } from '../engine/action';
import type { GameState } from '../engine/gameState';
import type { SimEventQueue } from '../engine/eventQueue';
import type { RngInstance } from '../engine/rng';

export interface ClassModule {
  readonly className: string;
  /** Called after createGameState() — populates class runtime state and action_list. */
  init(state: GameState): void;
  /** Returns the action registry for this spec. */
  create_actions(state: IGameState): Map<string, Action>;
  /** Push pre-pull events. */
  combat_begin(state: GameState, queue: SimEventQueue): void;
  on_auto_attack?(
    hand: 'mainHand' | 'offHand',
    state: IGameState,
    queue: SimEventQueue,
    rng: RngInstance,
  ): number; // returns damage dealt
}
