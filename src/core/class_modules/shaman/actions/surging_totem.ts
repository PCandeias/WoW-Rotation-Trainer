import type { ActionResult } from '../../../engine/action';
import { EventType, type SimEvent, type SimEventQueue } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { applyShamanBuffStacks, consumeShamanBuffStacks, ShamanAction } from '../shaman_action';

const SURGING_TOTEM = requireShamanSpellData(444995);
const TREMOR = requireShamanSpellData(455622);
const SURGING_BOLT = requireShamanSpellData(458267);
const TOTEMIC_REBOUND = requireShamanSpellData(458269);
const WHIRLING_AIR = requireShamanSpellData(453409);
const WHIRLING_FIRE = requireShamanSpellData(453405);
const WHIRLING_EARTH = requireShamanSpellData(453406);

const SURGING_TOTEM_PERIOD_SECONDS = 6;
const SURGING_BOLT_BASE_DELAY_SECONDS = 0.3;
const SURGING_BOLT_WHIRL_INTERVAL_SECONDS = 0.5;

export function createSurgingBoltEvent(
  currentTime: number,
  targetId: number,
  delaySeconds = SURGING_BOLT_BASE_DELAY_SECONDS,
): SimEvent {
  return {
    type: EventType.DELAYED_SPELL_IMPACT,
    time: currentTime + delaySeconds,
    spellId: 'surging_bolt',
    castContext: { targetId },
  };
}

export class TremorAction extends ShamanAction {
  readonly name = 'tremor';
  readonly spellData = TREMOR;
  readonly aoe = -1;
  readonly reducedAoeTargets = TREMOR.effectN(2).base_value();

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ('physical' | 'fire')[] {
    return ['physical', 'fire'];
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();
    multiplier *= 1 + this.p.getBuffStacks('totemic_rebound') * TOTEMIC_REBOUND.effectN(1).percent();
    if (this.p.hasTalent('oversurge') && this.p.isBuffActive('ascendance')) {
      multiplier *= 1.5;
    }
    return multiplier;
  }

  executePulse(rng: RngInstance, isComboStrike: boolean): { amount: number; isCrit: boolean }[] {
    const damages: { amount: number; isCrit: boolean }[] = [];
    for (let targetId = 0; targetId < this.nTargets(); targetId += 1) {
      const snapshot = this.captureSnapshot(isComboStrike);
      const impact = this.calculateDamageFromSnapshot({
        ...snapshot,
        targetMultiplier: snapshot.targetMultiplier * this.aoeDamageMultiplier(targetId, this.nTargets()),
      }, rng);
      this.p.addDamage(impact.damage, targetId);
      damages.push({ amount: impact.damage, isCrit: impact.isCrit });
    }
    const totalDamage = damages.reduce((sum, damage) => sum + damage.amount, 0);
    const anyCrit = damages.some((damage) => damage.isCrit);
    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    return damages;
  }
}

export class SurgingBoltAction extends ShamanAction {
  readonly name = 'surging_bolt';
  readonly spellData = SURGING_BOLT;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * (1 + this.p.getBuffStacks('totemic_rebound') * TOTEMIC_REBOUND.effectN(2).percent());
  }

  executeOnTarget(targetId: number, rng: RngInstance, isComboStrike: boolean): { amount: number; isCrit: boolean } {
    const snapshot = this.captureSnapshot(isComboStrike);
    const impact = this.calculateDamageFromSnapshot(snapshot, rng);
    this.p.addDamage(impact.damage, targetId);
    this.p.recordPendingSpellStat(this.name, impact.damage, 1, impact.isCrit);
    return { amount: impact.damage, isCrit: impact.isCrit };
  }
}

export class SurgingTotemAction extends ShamanAction {
  readonly name = 'surging_totem';
  readonly spellData = SURGING_TOTEM;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  override preCastFailReason(): 'not_available' | undefined {
    return this.p.isBuffActive('surging_totem') ? 'not_available' : undefined;
  }

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    const newEvents: SimEvent[] = [];

    if (this.p.hasTalent('amplification_core')) {
      applyShamanBuffStacks(this.p, 'amplification_core', 1, newEvents);
    }
    if (this.p.hasTalent('whirling_elements')) {
      applyShamanBuffStacks(this.p, 'whirling_air', 1, newEvents);
      applyShamanBuffStacks(this.p, 'whirling_fire', 1, newEvents);
      applyShamanBuffStacks(this.p, 'whirling_earth', 1, newEvents);
    }

    for (let pulse = 0; pulse <= 4; pulse += 1) {
      newEvents.push({
        type: EventType.DELAYED_SPELL_IMPACT,
        time: this.p.currentTime + pulse * SURGING_TOTEM_PERIOD_SECONDS,
        spellId: 'tremor',
      });
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

export function triggerWhirlingAir(state: IGameState, targetId: number, newEvents: SimEvent[]): void {
  if (!state.isBuffActive('whirling_air')) {
    return;
  }
  const boltCount = WHIRLING_AIR.effectN(3).base_value();
  for (let index = 0; index < boltCount; index += 1) {
    newEvents.push(createSurgingBoltEvent(state.currentTime, targetId, SURGING_BOLT_BASE_DELAY_SECONDS + index * SURGING_BOLT_WHIRL_INTERVAL_SECONDS));
  }
  consumeShamanBuffStacks(state, 'whirling_air', 1, newEvents);
}

export function triggerWhirlingFire(state: IGameState, newEvents: SimEvent[]): void {
  if (!state.isBuffActive('whirling_fire')) {
    return;
  }
  applyShamanBuffStacks(state, 'hot_hand', 1, newEvents);
  consumeShamanBuffStacks(state, 'whirling_fire', 1, newEvents);
}

export function whirlingFireDurationSeconds(): number {
  return WHIRLING_FIRE.effectN(1).time_value() / 1000;
}

export function whirlingEarthMultiplier(state: IGameState): number {
  return state.isBuffActive('whirling_earth') ? 1 + WHIRLING_EARTH.effectN(1).percent() : 1;
}
