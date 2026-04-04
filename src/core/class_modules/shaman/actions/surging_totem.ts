import type { ActionResult } from '../../../engine/action';
import { EventType, type SimEvent, type SimEventQueue } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { adjustLavaLashCooldownForHotHandWindow } from './hot_hand';
import { applyShamanBuffStacks, consumeShamanBuffStacks, ShamanAction } from '../shaman_action';

const SURGING_TOTEM = requireShamanSpellData(444995);
const TREMOR = requireShamanSpellData(455622);
const EARTHSURGE = requireShamanSpellData(455590);
const SURGING_BOLT = requireShamanSpellData(458267);
const TOTEMIC_REBOUND = requireShamanSpellData(458269);
const WHIRLING_AIR = requireShamanSpellData(453409);
const WHIRLING_FIRE = requireShamanSpellData(453405);
const WHIRLING_EARTH = requireShamanSpellData(453406);
const ELEMENTAL_OVERFLOW = requireShamanSpellData(1239170);
// Elemental Tempo (1250364) eff#1: +10% direct damage to Surging Bolt (SimC parse_effect).
const ELEMENTAL_TEMPO_SURGING_BOLT = requireShamanSpellData(1250364);

// SimC logs summon the Surging Totem pet for 25.000s even though the owner-facing
// aura from spell data lasts 24.000s (`SURGING_TOTEM.duration_ms()`).
// The extra second matters for late tremor pulses, so the pulse scheduler
// follows the pet lifetime rather than the shorter aura.
const SURGING_TOTEM_SUMMON_DURATION_SECONDS = 25;
// SimC fires the Surging Totem tremor action every 5s (base), confirmed from debug log
// intervals of 4.66s at ~7.3% base haste (5.0 / 1.073 = 4.66).
const SURGING_TOTEM_PERIOD_SECONDS = 5;
const SURGING_BOLT_BASE_DELAY_SECONDS = 0.3;
const SURGING_BOLT_WHIRL_INTERVAL_SECONDS = 0.5;
const SURGING_TOTEM_TIME_EPSILON_SECONDS = 1e-9;

function nextSurgingTotemPulseDelaySeconds(state: IGameState): number {
  return SURGING_TOTEM_PERIOD_SECONDS / (1 + state.getHastePercent() / 100);
}

export function createSurgingTotemPulseEvent(time: number, expiresAt: number): SimEvent {
  return {
    type: EventType.DELAYED_SPELL_IMPACT,
    time,
    spellId: 'tremor',
    castContext: {
      surgingTotemExpiresAt: expiresAt,
    },
  };
}

export function maybeScheduleNextSurgingTotemPulse(
  state: IGameState,
  queue: SimEventQueue,
  expiresAt: number,
): void {
  // We're already at (or past) the totem's expiry — no more pulses.
  if (state.currentTime >= expiresAt - SURGING_TOTEM_TIME_EPSILON_SECONDS) {
    return;
  }

  const nextTime = state.currentTime + nextSurgingTotemPulseDelaySeconds(state);
  // SimC fires a partial-damage dismiss pulse when the totem expires, but the pulse count
  // from natural intervals already captures the correct number of full tremor hits at the
  // validation profile's haste (28.75%). Do not add a forced final; the natural schedule
  // delivers the same pulse count SimC reports.
  if (nextTime > expiresAt + SURGING_TOTEM_TIME_EPSILON_SECONDS) {
    return;
  }

  queue.push(createSurgingTotemPulseEvent(nextTime, expiresAt));
}

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

type TremorImpact = { amount: number; isCrit: boolean };

abstract class BaseTremorAction extends ShamanAction {
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

  protected executePulseWithMultiplier(
    rng: RngInstance,
    isComboStrike: boolean,
    baseMultiplier = 1,
  ): TremorImpact[] {
    const damages: TremorImpact[] = [];
    for (let targetId = 0; targetId < this.nTargets(); targetId += 1) {
      const snapshot = this.captureSnapshot(isComboStrike);
      const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId, baseMultiplier * this.aoeDamageMultiplier(targetId, this.nTargets()));
      this.p.addDamage(impact.damage, targetId);
      damages.push({ amount: impact.damage, isCrit: impact.isCrit });
    }
    const totalDamage = damages.reduce((sum, damage) => sum + damage.amount, 0);
    const anyCrit = damages.some((damage) => damage.isCrit);
    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    return damages;
  }
}

export class TremorAction extends BaseTremorAction {
  readonly name = 'tremor';
  readonly spellData = TREMOR;

  executePulse(rng: RngInstance, isComboStrike: boolean): TremorImpact[] {
    return this.executePulseWithMultiplier(rng, isComboStrike);
  }
}

export class TremorEarthsurgeAction extends BaseTremorAction {
  readonly name = 'tremor_es';
  readonly spellData = TREMOR;

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * EARTHSURGE.effectN(1).percent();
  }

  executePulse(rng: RngInstance, isComboStrike: boolean, baseMultiplier = 1): TremorImpact[] {
    return this.executePulseWithMultiplier(rng, isComboStrike, baseMultiplier);
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
    let multiplier = super.composite_da_multiplier();
    // Enhancement Shaman (137041) eff#28: +25% direct damage for Surging Bolt (SimC parse_effect).
    multiplier *= 1.25;
    // Elemental Tempo (1250364) eff#1: +10% direct damage (parse_effect not in trainer's global path).
    if (this.p.hasTalent('elemental_tempo')) {
      multiplier *= 1 + ELEMENTAL_TEMPO_SURGING_BOLT.effectN(1).percent();
    }
    multiplier *= 1 + this.p.getBuffStacks('totemic_rebound') * TOTEMIC_REBOUND.effectN(2).percent();
    if (this.p.hasTalent('oversurge') && this.p.isBuffActive('ascendance')) {
      multiplier *= 1.5;
    }
    return multiplier;
  }

  override composite_player_multiplier(isComboStrike: boolean): number {
    return super.composite_player_multiplier(isComboStrike) * this.guardianDamageMultiplier();
  }

  override composite_crit_chance(): number {
    let crit = super.composite_crit_chance();
    // Nature's Fury (381655) eff#2: +4% crit for Surging Bolt (SimC parse_effect).
    if (this.p.hasTalent('natures_fury')) {
      crit += 0.04;
    }
    return crit;
  }

  protected override snapshotPlayerMultiplier(): number {
    return super.snapshotPlayerMultiplier() * this.guardianDamageMultiplier();
  }

  executeOnTarget(targetId: number, rng: RngInstance, isComboStrike: boolean): { amount: number; isCrit: boolean } {
    const snapshot = this.captureSnapshot(isComboStrike);
    const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId);
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
    const expiresAt = this.p.currentTime + SURGING_TOTEM_SUMMON_DURATION_SECONDS;

    if (this.p.hasTalent('amplification_core')) {
      applyShamanBuffStacks(this.p, 'amplification_core', 1, newEvents);
    }
    if (this.p.hasTalent('whirling_elements')) {
      applyShamanBuffStacks(this.p, 'whirling_air', 1, newEvents);
      applyShamanBuffStacks(this.p, 'whirling_fire', 1, newEvents);
      applyShamanBuffStacks(this.p, 'whirling_earth', 1, newEvents);
    }
    if (this.p.hasTalent('primal_catalyst')) {
      applyShamanBuffStacks(this.p, 'elemental_overflow', 1, newEvents);
    }

    newEvents.push(createSurgingTotemPulseEvent(this.p.currentTime, expiresAt));

    return {
      damage: 0,
      isCrit: false,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}

export function canTriggerEarthsurge(state: IGameState): boolean {
  return state.hasTalent('earthsurge') && state.isBuffActive('surging_totem');
}

export function forceTriggerTotemicRebound(state: IGameState, newEvents: SimEvent[]): void {
  if (!state.hasTalent('totemic_rebound') || !state.isBuffActive('surging_totem')) {
    return;
  }

  applyShamanBuffStacks(state, 'totemic_rebound', state.getBuffStacks('totemic_rebound') + 1, newEvents);
}

export function triggerWhirlingAir(state: IGameState, targetId: number, newEvents: SimEvent[]): void {
  if (!state.isBuffActive('whirling_air')) {
    return;
  }
  const boltCount = WHIRLING_AIR.effectN(3).base_value();
  for (let index = 0; index < boltCount; index += 1) {
    forceTriggerTotemicRebound(state, newEvents);
    newEvents.push(createSurgingBoltEvent(state.currentTime, targetId, SURGING_BOLT_BASE_DELAY_SECONDS + index * SURGING_BOLT_WHIRL_INTERVAL_SECONDS));
  }
  consumeShamanBuffStacks(state, 'whirling_air', 1, newEvents);
}

export function triggerWhirlingFire(state: IGameState, newEvents: SimEvent[]): boolean {
  if (!state.isBuffActive('whirling_fire')) {
    return false;
  }

  const hotHandWasActive = state.isBuffActive('hot_hand');
  const existingHotHandWindowSeconds = hotHandWasActive ? (state.getBuffRemains?.('hot_hand') ?? 0) : 0;
  const hotHandDurationSeconds = hotHandWasActive
    ? existingHotHandWindowSeconds + whirlingFireDurationSeconds()
    : whirlingFireDurationSeconds();

  state.applyBuff('hot_hand', hotHandDurationSeconds, 1);
  adjustLavaLashCooldownForHotHandWindow(
    state,
    whirlingFireDurationSeconds(),
    existingHotHandWindowSeconds,
  );
  if (!hotHandWasActive) {
    newEvents.push({
      type: EventType.BUFF_APPLY,
      time: state.currentTime,
      buffId: 'hot_hand',
      stacks: 1,
    });
  }
  consumeShamanBuffStacks(state, 'whirling_fire', 1, newEvents);
  return hotHandWasActive;
}

export function whirlingFireDurationSeconds(): number {
  return WHIRLING_FIRE.effectN(1).time_value() / 1000;
}

export function whirlingEarthMultiplier(state: IGameState): number {
  return state.isBuffActive('whirling_earth') ? 1 + WHIRLING_EARTH.effectN(1).percent() : 1;
}

export function elementalOverflowDurationSeconds(): number {
  return ELEMENTAL_OVERFLOW.duration_ms() / 1000;
}
