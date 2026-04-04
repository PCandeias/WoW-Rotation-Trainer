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

export class BloodFuryAction extends SharedPlayerAction {
  readonly name = 'blood_fury';
  readonly spellData = new SpellData(33697, 'Blood Fury');

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    this.p.settleEnergy();
    const newEvents = this.applyTimedBuff('blood_fury', 15);
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

export class BloodlustAction extends SharedPlayerAction {
  readonly name = 'bloodlust';
  readonly spellData = new SpellData(2825, 'Bloodlust');

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    this.p.settleEnergy();
    const newEvents = this.applyTimedBuff('bloodlust', 40);
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
  readonly spellData: SpellData;

  constructor(
    state: IGameState,
    private readonly potionKind: 'recklessness' | 'lights_potential' = 'recklessness',
  ) {
    super(state);
    this.spellData = potionKind === 'lights_potential'
      ? new SpellData(1236616, "Light's Potential")
      : new SpellData(1236994, 'Potion of Recklessness');
  }

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    this.p.settleEnergy();
    const newEvents = this.potionKind === 'lights_potential'
      ? this.applyTimedBuff('lights_potential', 30)
      : [
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

const RACIAL_ACTIONS_BY_RACE: ReadonlyMap<string, readonly string[]> = new Map([
  ['troll', ['berserking']],
  ['orc', ['blood_fury']],
]);

export function getAvailableSharedRacialActionNames(race?: string): readonly string[] {
  const normalizedRace = race?.trim().toLowerCase();
  return normalizedRace == null ? [] : (RACIAL_ACTIONS_BY_RACE.get(normalizedRace) ?? []);
}

export function getAllSharedRacialActionNames(): readonly string[] {
  return [...new Set([...RACIAL_ACTIONS_BY_RACE.values()].flat())];
}

export function createSharedPlayerActions(
  state: IGameState,
  race?: string,
  potionName?: string | null,
): Map<string, Action> {
  const potionKind = potionName?.startsWith('lights_potential') ? 'lights_potential' : 'recklessness';
  const actions = new Map<string, Action>([
    ['bloodlust', new BloodlustAction(state)],
    ['potion', new PotionOfRecklessnessAction(state, potionKind)],
    ['algethar_puzzle_box', new AlgetharPuzzleBoxAction(state)],
  ]);

  const racialActions = getAvailableSharedRacialActionNames(race);
  for (const actionName of racialActions) {
    if (actionName === 'berserking') {
      actions.set(actionName, new BerserkingAction(state));
    } else if (actionName === 'blood_fury') {
      actions.set(actionName, new BloodFuryAction(state));
    }
  }

  return actions;
}
