import { SpellData } from '../dbc/spell_data';
import { Action, type ActionResult } from '../engine/action';
import { EventType } from '../engine/eventQueue';
import type { GameState } from '../engine/gameState';
import type { IGameState } from '../engine/i_game_state';
import type { SimEventQueue } from '../engine/eventQueue';
import type { RngInstance } from '../engine/rng';

function timedBuffEvents(
  now: number,
  buffId: string,
  duration: number,
): { type: EventType.BUFF_APPLY | EventType.BUFF_EXPIRE; time: number; buffId: string }[] {
  return [
    { type: EventType.BUFF_APPLY as const, time: now, buffId },
    { type: EventType.BUFF_EXPIRE as const, time: now + duration, buffId },
  ];
}

abstract class SharedPlayerAction extends Action {
  protected applyTimedBuff(
    buffId: string,
    duration: number,
    stacks = 1,
  ): { type: EventType.BUFF_APPLY | EventType.BUFF_EXPIRE; time: number; buffId: string }[] {
    this.p.applyBuff(buffId, duration, stacks);
    return timedBuffEvents(this.p.currentTime, buffId, duration);
  }

  protected refreshEnergyAfterBuffChange(): void {
    this.p.settleEnergy();
    this.p.recomputeEnergyRegenRate();
  }
}

export class BerserkingAction extends SharedPlayerAction {
  readonly name = 'berserking';
  readonly spellData = new SpellData(26297, 'Berserking');

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    this.p.settleEnergy();
    const newEvents = this.applyTimedBuff('berserking', 12);
    this.p.recomputeEnergyRegenRate();

    return {
      damage: 0,
      isCrit: false,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}

export class PotionOfRecklessnessAction extends SharedPlayerAction {
  readonly name = 'potion';
  readonly spellData = new SpellData(1236994, 'Potion of Recklessness');

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    this.p.settleEnergy();
    const newEvents = [
      ...this.applyTimedBuff('potion_of_recklessness_haste', 30),
      ...this.applyTimedBuff('potion_of_recklessness_penalty_vers', 30),
    ];
    this.p.recomputeEnergyRegenRate();

    return {
      damage: 0,
      isCrit: false,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}

export class AlgetharPuzzleBoxAction extends SharedPlayerAction {
  readonly name = 'algethar_puzzle_box';
  readonly spellData = new SpellData(193701, "Algeth'ar Puzzle Box");

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    return {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  override last_tick(
    state: IGameState,
    _queue: SimEventQueue,
    _rng: RngInstance,
  ): ActionResult {
    const gameState = state as GameState;
    const newEvents = this.applyTimedBuff('algethar_puzzle', 20);
    const trinket = gameState.trinkets.find((entry) => entry.itemName === 'algethar_puzzle_box');
    if (trinket) {
      trinket.procActive = true;
      trinket.procExpiresAt = gameState.currentTime + 20;
    }

    return {
      damage: 0,
      isCrit: false,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}

export function createSharedPlayerActions(state: IGameState): Map<string, Action> {
  return new Map<string, Action>([
    ['berserking', new BerserkingAction(state)],
    ['potion', new PotionOfRecklessnessAction(state)],
    ['algethar_puzzle_box', new AlgetharPuzzleBoxAction(state)],
  ]);
}
