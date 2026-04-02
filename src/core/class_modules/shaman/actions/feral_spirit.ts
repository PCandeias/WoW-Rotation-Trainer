import type { ActionResult } from '../../../engine/action';
import { EventType, type SimEvent, type SimEventQueue } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { applyShamanBuffStacks, ShamanMeleeAction } from '../shaman_action';

const FERAL_SPIRIT = requireShamanSpellData(51533);
const ALPHA_WOLF = requireShamanSpellData(198455);

const FERAL_SPIRIT_TICK_INTERVAL_SECONDS = 3;
const FERAL_SPIRIT_ALPHA_WOLF_TICK_SECONDS = 2;
const FERAL_SPIRIT_ALPHA_WOLF_DURATION_SECONDS = 8;
const ALPHA_WOLF_INSTANCE_STATE = 'shaman.alpha_wolf_instance';
const FERAL_SPIRIT_WOLF_COUNT = 2;

export class AlphaWolfAction extends ShamanMeleeAction {
  readonly name = 'alpha_wolf';
  readonly spellData = ALPHA_WOLF;
  readonly aoe = -1;

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }
}

export function createAlphaWolfEvents(currentTime: number, state: IGameState): SimEvent[] {
  const nextInstance = (state.getNumericState?.(ALPHA_WOLF_INSTANCE_STATE) ?? 0) + 1;
  state.setNumericState?.(ALPHA_WOLF_INSTANCE_STATE, nextInstance);
  const events: SimEvent[] = [];
  const tickCount = FERAL_SPIRIT_ALPHA_WOLF_DURATION_SECONDS / FERAL_SPIRIT_ALPHA_WOLF_TICK_SECONDS;
  for (let tick = 0; tick < tickCount; tick += 1) {
    events.push({
      type: EventType.DELAYED_SPELL_IMPACT,
      time: currentTime + FERAL_SPIRIT_ALPHA_WOLF_TICK_SECONDS * (tick + 1),
      spellId: 'alpha_wolf',
      castContext: { instanceId: nextInstance },
    });
  }
  return events;
}

export function applyFeralSpiritWolfBuff(
  state: IGameState,
  buffId: 'molten_weapon' | 'crackling_surge',
  newEvents: SimEvent[],
  stacks = FERAL_SPIRIT_WOLF_COUNT,
): void {
  applyShamanBuffStacks(state, buffId, state.getBuffStacks(buffId) + stacks, newEvents);
}

export class FeralSpiritAction extends ShamanMeleeAction {
  readonly name = 'feral_spirit';
  readonly spellData = FERAL_SPIRIT;

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    const newEvents: SimEvent[] = [];

    for (let tick = 0; tick < 5; tick += 1) {
      newEvents.push({
        type: EventType.DELAYED_SPELL_IMPACT,
        time: this.p.currentTime + FERAL_SPIRIT_TICK_INTERVAL_SECONDS * (tick + 1),
        spellId: 'feral_spirit_tick',
      });
    }

    applyFeralSpiritWolfBuff(this.p, 'molten_weapon', newEvents);

    return {
      damage: 0,
      isCrit: false,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}

export function isLatestAlphaWolfInstance(state: IGameState, instanceId: number): boolean {
  return (state.getNumericState?.(ALPHA_WOLF_INSTANCE_STATE) ?? 0) === instanceId;
}
