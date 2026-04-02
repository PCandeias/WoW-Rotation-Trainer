import type { ActionResult } from '../../../engine/action';
import { EventType, type SimEvent, type SimEventQueue } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { applyShamanBuffStacks, ShamanAction, ShamanMeleeAction } from '../shaman_action';

const ASCENDANCE = requireShamanSpellData(114051);
const ASCENDANCE_DAMAGE = requireShamanSpellData(344548);
const WINDLASH_MH = requireShamanSpellData(114089);
const WINDLASH_OH = requireShamanSpellData(114093);
const STATIC_ACCUMULATION_BUFF = requireShamanSpellData(384437);

export const ASCENDANCE_DOOM_WINDS_DELAY_SECONDS = 0.01;
export const STATIC_ACCUMULATION_TICK_INTERVAL_SECONDS = 1;

export function createStaticAccumulationEvents(
  currentTime: number,
  durationSeconds: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  const pulses = Math.max(0, Math.floor(durationSeconds / STATIC_ACCUMULATION_TICK_INTERVAL_SECONDS));
  for (let pulse = 0; pulse < pulses; pulse += 1) {
    events.push({
      type: EventType.DELAYED_SPELL_IMPACT,
      time: currentTime + STATIC_ACCUMULATION_TICK_INTERVAL_SECONDS * (pulse + 1),
      spellId: 'static_accumulation_tick',
    });
  }
  return events;
}

export class AscendanceDamageAction extends ShamanAction {
  readonly name = 'ascendance_damage';
  readonly spellData = ASCENDANCE_DAMAGE;
  readonly aoe = -1;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }
}

export class AscendanceAction extends ShamanMeleeAction {
  readonly name = 'ascendance';
  readonly spellData = ASCENDANCE;
  private readonly damageAction: AscendanceDamageAction;

  constructor(state: IGameState) {
    super(state);
    this.damageAction = new AscendanceDamageAction(state);
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    let totalDamage = 0;
    let anyCrit = false;

    for (let targetId = 0; targetId < this.damageAction.nTargets(); targetId += 1) {
      const impact = this.damageAction.calculateDamage(rng, isComboStrike);
      this.p.addDamage(impact.damage, targetId);
      totalDamage += impact.damage;
      anyCrit = anyCrit || impact.isCrit;
    }

    const newEvents: SimEvent[] = [{
      type: EventType.DELAYED_SPELL_IMPACT,
      time: this.p.currentTime + ASCENDANCE_DOOM_WINDS_DELAY_SECONDS,
      spellId: 'ascendance_doom_winds',
    }];

    if (this.p.hasTalent('static_accumulation')) {
      applyShamanBuffStacks(this.p, 'static_accumulation', 1, newEvents);
      newEvents.push(...createStaticAccumulationEvents(this.p.currentTime, STATIC_ACCUMULATION_BUFF.duration_ms() / 1000));
    }

    this.p.recordPendingSpellStat('ascendance_damage', totalDamage, 1, anyCrit);
    return {
      damage: 0,
      isCrit: anyCrit,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}

export class WindlashAttackAction extends ShamanMeleeAction {
  readonly name = 'windlash';
  readonly spellData: typeof WINDLASH_MH;

  constructor(state: IGameState, useOffHand = false) {
    super(state);
    this.spellData = useOffHand ? WINDLASH_OH : WINDLASH_MH;
  }
}
