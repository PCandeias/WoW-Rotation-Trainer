import type { ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import { EventType, type SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { applyShamanBuffStacks, ShamanAction, ShamanMeleeAction } from '../shaman_action';
import { applyFeralSpiritWolfBuff } from './feral_spirit';
import { createStaticAccumulationEvents } from './ascendance';

const DOOM_WINDS_ACTIVE = requireShamanSpellData(384352);
const DOOM_WINDS_BUFF = requireShamanSpellData(466772);
const DOOM_WINDS_DAMAGE = requireShamanSpellData(469270);
const THORIMS_INVOCATION = requireShamanSpellData(384444);
const WINNING_STREAK = requireShamanSpellData(1218616);
const ELECTROSTATIC_WAGER_DAMAGE = requireShamanSpellData(1223332);

const DOOM_WINDS_DIRECT_DELAY_SECONDS = 0.1;
const DOOM_WINDS_PERIODIC_START_SECONDS = 0.001;
const DOOM_WINDS_PERIOD_SECONDS = 1;

export function doomWindsDurationSeconds(state: Pick<IGameState, 'hasTalent'>): number {
  return state.hasTalent('thorims_invocation')
    ? THORIMS_INVOCATION.effectN(1).base_value()
    : DOOM_WINDS_BUFF.duration_ms() / 1000;
}

export function createDoomWindsEvents(
  currentTime: number,
  durationSeconds: number,
): { damageEvents: ActionResult['newEvents']; totalPulses: number } {
  const damageEvents = [{
    type: EventType.DELAYED_SPELL_IMPACT as const,
    time: currentTime + DOOM_WINDS_DIRECT_DELAY_SECONDS,
    spellId: 'doom_winds_damage' as const,
  }];
  const pulses = Math.floor(durationSeconds);
  for (let pulse = 0; pulse < pulses; pulse += 1) {
    damageEvents.push({
      type: EventType.DELAYED_SPELL_IMPACT,
      time: currentTime + DOOM_WINDS_PERIODIC_START_SECONDS + pulse * DOOM_WINDS_PERIOD_SECONDS,
      spellId: 'doom_winds_damage',
    });
  }
  return { damageEvents, totalPulses: pulses };
}

export class DoomWindsDamageAction extends ShamanAction {
  readonly name = 'doom_winds_damage';
  readonly spellData = DOOM_WINDS_DAMAGE;
  readonly aoe = -1;
  readonly reducedAoeTargets = 5;

  constructor(state: IGameState) {
    super(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  protected override actionSchools(): readonly ('physical' | 'nature')[] {
    return ['physical', 'nature'];
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      multiplier *= 1 + WINNING_STREAK.effectN(2).percent() * this.p.getBuffStacks('winning_streak');
    }
    return multiplier;
  }

  executePulse(rng: RngInstance, isComboStrike: boolean): { amount: number; isCrit: boolean }[] {
    const damages: { amount: number; isCrit: boolean }[] = [];

    for (let targetId = 0; targetId < this.nTargets(); targetId += 1) {
      const snapshot = this.captureSnapshot(isComboStrike);
      const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId, this.aoeDamageMultiplier(targetId, this.nTargets()));
      this.p.addDamage(impact.damage, targetId);
      damages.push({ amount: impact.damage, isCrit: impact.isCrit });
    }

    const totalDamage = damages.reduce((sum, damage) => sum + damage.amount, 0);
    const anyCrit = damages.some((damage) => damage.isCrit);
    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    if (this.p.hasTalent('midnight_season_1_4pc')) {
      applyShamanBuffStacks(this.p, 'electrostatic_wager', this.p.getBuffStacks('electrostatic_wager') + 1, []);
      applyShamanBuffStacks(
        this.p,
        'electrostatic_wager_damage',
        Math.min(ELECTROSTATIC_WAGER_DAMAGE.max_stacks(), this.p.getBuffStacks('electrostatic_wager_damage') + 1),
        [],
      );
    }
    return damages;
  }
}

export class DoomWindsAction extends ShamanMeleeAction {
  readonly name = 'doom_winds';
  readonly spellData = DOOM_WINDS_ACTIVE;

  constructor(state: IGameState) {
    super(state);
  }

  override preCastFailReason(): 'talent_missing' | 'not_available' | undefined {
    if (this.p.hasTalent('ascendance') || this.p.hasTalent('deeply_rooted_elements')) {
      return 'not_available';
    }
    return undefined;
  }

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    const durationSeconds = doomWindsDurationSeconds(this.p);
    const { damageEvents } = createDoomWindsEvents(this.p.currentTime, durationSeconds);
    const newEvents = [...damageEvents];
    if (this.p.hasTalent('feral_spirit')) {
      applyFeralSpiritWolfBuff(this.p, 'crackling_surge', newEvents);
    }
    if (this.p.hasTalent('static_accumulation')) {
      applyShamanBuffStacks(this.p, 'static_accumulation', 1, newEvents);
      newEvents.push(...createStaticAccumulationEvents(this.p.currentTime, durationSeconds));
    }

    return {
      damage: 0,
      isCrit: false,
      newEvents,
      buffsApplied: [{ id: 'doom_winds', duration: durationSeconds, stacks: 1 }],
      cooldownAdjustments: [],
    };
  }
}
