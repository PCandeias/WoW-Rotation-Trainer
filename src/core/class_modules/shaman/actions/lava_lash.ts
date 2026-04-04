import type { ActionCastContext, ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import { EventType, type SimEventQueue } from '../../../engine/eventQueue';
import { rollGaussian, type RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { triggerRideTheLightning } from './chain_lightning';
import { FlameShockAction } from './flame_shock';
import { triggerCrashLightningProc } from './crash_lightning';
import { triggerLivelyTotemsProc, triggerLivelyTotemsVolleys } from './lively_totems';
import { triggerFlametongueWeapon, triggerWindfuryWeapon } from './windfury_weapon';
import { applyShamanBuffStacks, consumeShamanBuffStacks, ShamanAction, triggerMaelstromWeaponProc } from '../shaman_action';
import { SunderingSplitstreamAction } from './sundering';
import { triggerWhirlingFire } from './surging_totem';
import { applyTemporaryCooldownRate, scaleCooldownReductionForCurrentRate } from './hot_hand';

const MOLTEN_ASSAULT_TALENT = requireShamanSpellData(334033);
const ASHEN_CATALYST_TALENT = requireShamanSpellData(390370);
const LASHING_FLAMES_DEBUFF = requireShamanSpellData(334168);
const WINNING_STREAK = requireShamanSpellData(1218616);
const ELEMENTAL_OVERFLOW = requireShamanSpellData(1239170);
const LIGHTNING_STRIKES_BUFF = requireShamanSpellData(384451);
const TOTEMIC_MOMENTUM = requireShamanSpellData(1260644);
const HOT_HAND_DAMAGE_BONUS_BY_RANK = [0, 20, 40] as const;
const ELEMENTAL_OVERFLOW_DELAY_MEAN_SECONDS = 0.5;
const ELEMENTAL_OVERFLOW_DELAY_STD_DEV_SECONDS = 0.033;

function createElementalOverflowLavaLashEvent(
  currentTime: number,
  rng: RngInstance,
): ActionResult['newEvents'][number] {
  const delaySeconds = Math.max(
    0,
    rollGaussian(rng, ELEMENTAL_OVERFLOW_DELAY_MEAN_SECONDS, ELEMENTAL_OVERFLOW_DELAY_STD_DEV_SECONDS),
  );
  return {
    type: EventType.DELAYED_SPELL_IMPACT,
    time: currentTime + delaySeconds,
    spellId: 'elemental_overflow_lava_lash',
    castContext: { elementalOverflowTriggered: true },
  };
}

function hotHandTalentValueByRank(values: readonly number[], rank: number): number {
  if (rank <= 0) {
    return 0;
  }

  return values[Math.min(rank, values.length - 1)] ?? 0;
}

/**
 * Enhancement Lava Lash.
 *
 * This first slice mirrors the core SimC-owned pieces the trainer can model
 * cleanly today: off-hand AP scaling, Fire-school damage, Flametongue's damage
 * bonus, Hot Hand's active damage/cooldown modifiers, Lashing Flames
 * application, and Ashen Catalyst's Flame-Shock-gated cooldown reduction.
 */
export class LavaLashAction extends ShamanAction {
  readonly name = 'lava_lash';
  readonly spellData = requireShamanSpellData(60103);
  private readonly flameShockAction: FlameShockAction;
  private readonly splitstreamAction: SunderingSplitstreamAction;
  private elementalOverflowTriggered = false;

  constructor(state: IGameState) {
    super(state);
    this.flameShockAction = new FlameShockAction(state);
    this.splitstreamAction = new SunderingSplitstreamAction(state);
  }

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ('physical' | 'fire')[] {
    return ['physical', 'fire'];
  }

  protected override effectiveAttackPower(): number {
    return this.p.getWeaponOffHandAttackPower?.() ?? 0;
  }

  override composite_da_multiplier(): number {
    let multiplier = super.composite_da_multiplier();

    if (this.p.isBuffActive('flametongue_weapon')) {
      multiplier *= 2;
    }

    if (this.p.hasTalent('totemic_momentum')) {
      multiplier *= 1 + TOTEMIC_MOMENTUM.effectN(2).percent();
    }
    if (this.p.isBuffActive('lightning_strikes')) {
      multiplier *= 1 + LIGHTNING_STRIKES_BUFF.effectN(1).percent();
    }

    const hotHandRank = this.p.getTalentRank('hot_hand');
    if (hotHandRank > 0 && this.p.isBuffActive('hot_hand')) {
      multiplier *= 1 + hotHandTalentValueByRank(HOT_HAND_DAMAGE_BONUS_BY_RANK, hotHandRank) / 100;
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      multiplier *= 1 + WINNING_STREAK.effectN(1).percent() * this.p.getBuffStacks('winning_streak');
    }
    if (this.elementalOverflowTriggered) {
      multiplier *= ELEMENTAL_OVERFLOW.effectN(1).percent();
    }

    return multiplier;
  }

  override cooldownDuration(baseDuration: number, hasteScalesCooldown: boolean): number {
    const duration = this.baseCooldownDurationAfterHaste(baseDuration, hasteScalesCooldown);
    const hotHandRank = this.p.getTalentRank('hot_hand');
    if (hotHandRank <= 0 || !this.p.isBuffActive('hot_hand')) {
      return duration;
    }

    const remains = this.p.getBuffRemains?.('hot_hand') ?? 0;
    return applyTemporaryCooldownRate(
      duration,
      hotHandRank >= 2 ? 100 : 34,
      remains,
    );
  }

  private baseCooldownDurationAfterHaste(baseDuration: number, hasteScalesCooldown: boolean): number {
    const adjustedBaseDuration = this.p.hasTalent('molten_assault')
      ? Math.max(0, baseDuration + MOLTEN_ASSAULT_TALENT.effectN(1).time_value() / 1000)
      : baseDuration;
    return super.cooldownDuration(adjustedBaseDuration, hasteScalesCooldown);
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    castContext?: ActionCastContext,
  ): ActionResult {
    const previousElementalOverflowTriggered = this.elementalOverflowTriggered;
    this.elementalOverflowTriggered = castContext?.elementalOverflowTriggered === true;

    const result = super.execute(queue, rng, isComboStrike);
    if (result.damage > 0) {
      this.grantElementalAssaultMaelstrom(result.newEvents);
      triggerMaelstromWeaponProc(this.p, rng, result.newEvents);
      triggerLivelyTotemsProc(this.p, rng, result.newEvents);
      const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
      result.newEvents.push(...flametongue.newEvents);
      const windfury = triggerWindfuryWeapon(this.p, queue, rng, isComboStrike);
      result.newEvents.push(...windfury.newEvents);
      const livelyTotems = triggerLivelyTotemsVolleys(this.p, queue, rng, isComboStrike);
      result.newEvents.push(...livelyTotems.newEvents);
      this.consumeLightningStrikes(result.newEvents);
    }
    this.p.applyTargetDebuff?.('lashing_flames', LASHING_FLAMES_DEBUFF.duration_ms() / 1000, 0, 1);
    const crashLightningProc = triggerCrashLightningProc(this.p, queue, rng, isComboStrike);
    result.newEvents.push(...crashLightningProc.newEvents);
    const rideTheLightning = triggerRideTheLightning(this.p, queue, rng, isComboStrike, 'chain_lightning_ll_rtl');
    result.newEvents.push(...rideTheLightning.newEvents);
    this.triggerMoltenAssault(queue, rng, isComboStrike, result);
    const consumedWhirlingFireWithHotHandAlreadyActive = triggerWhirlingFire(this.p, result.newEvents);
    if (result.damage > 0 && this.p.hasTalent('splitstream') && this.p.isBuffActive('hot_hand')) {
      if (consumedWhirlingFireWithHotHandAlreadyActive) {
        this.executeSplitstreamProc(rng, isComboStrike);
      }
      this.executeSplitstreamProc(rng, isComboStrike);
    }

    if (this.p.hasTalent('ashen_catalyst') && this.p.isTargetDebuffActive?.('flame_shock', 0)) {
      const ashenCatalystReductionSeconds = ASHEN_CATALYST_TALENT.effectN(1).time_value() / 1000;
      const hotHandRank = this.p.getTalentRank('hot_hand');
      const scaledAshenCatalystReductionSeconds = scaleCooldownReductionForCurrentRate(
        ashenCatalystReductionSeconds,
        this.p.isBuffActive('hot_hand')
          ? (hotHandRank >= 2 ? 100 : hotHandRank === 1 ? 34 : 0)
          : 0,
      );
      result.cooldownAdjustments.push({
        spellId: 'lava_lash',
        delta: scaledAshenCatalystReductionSeconds,
      });
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      applyShamanBuffStacks(this.p, 'winning_streak', this.p.getBuffStacks('winning_streak') + 1, result.newEvents);
    }
    if (!this.elementalOverflowTriggered && this.p.getBuffStacks('elemental_overflow') > 0) {
      consumeShamanBuffStacks(this.p, 'elemental_overflow', 1, result.newEvents);
      result.newEvents.push(createElementalOverflowLavaLashEvent(this.p.currentTime, rng));
    }

    this.p.recordPendingSpellStat(this.name, result.damage, 1, result.isCrit);
    this.elementalOverflowTriggered = previousElementalOverflowTriggered;
    return result;
  }

  private executeSplitstreamProc(rng: RngInstance, isComboStrike: boolean): boolean {
    return this.splitstreamAction.executeProc(rng, isComboStrike).isCrit;
  }

  private randomIndex(rng: RngInstance, length: number): number {
    return Math.min(length - 1, Math.floor(rng.next() * length));
  }

  private moveRandomTarget(source: number[], destination: number[], rng: RngInstance): void {
    const index = this.randomIndex(rng, source.length);
    const targetId = source[index];
    if (targetId === undefined) {
      return;
    }
    destination.push(targetId);
    source.splice(index, 1);
  }

  private triggerMoltenAssault(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    result: ActionResult,
  ): void {
    if (!this.p.hasTalent('molten_assault') || !this.p.isTargetDebuffActive?.('flame_shock', 0)) {
      return;
    }

    const maxSpreadTargets = MOLTEN_ASSAULT_TALENT.effectN(2).base_value();
    const actualSpreadTargets = Math.min(maxSpreadTargets, Math.max(0, (this.p.activeEnemies ?? 1) - 1));
    const maxActiveFlameShocks = 6;

    const selectedTargets: number[] = [];
    const lfNoFsTargets: number[] = [];
    const lfFsTargets: number[] = [];
    const noLfNoFsTargets: number[] = [];
    const noLfFsTargets: number[] = [];
    const mainTargetHasLf = this.p.isTargetDebuffActive?.('lashing_flames', 0) ?? false;

    for (let targetId = 1; targetId < (this.p.activeEnemies ?? 1); targetId += 1) {
      const hasLf = this.p.isTargetDebuffActive?.('lashing_flames', targetId) ?? false;
      const hasFs = this.p.isTargetDebuffActive?.('flame_shock', targetId) ?? false;
      if (hasLf && !hasFs) {
        lfNoFsTargets.push(targetId);
      } else if (hasLf && hasFs) {
        lfFsTargets.push(targetId);
      } else if (!hasLf && !hasFs) {
        noLfNoFsTargets.push(targetId);
      } else {
        noLfFsTargets.push(targetId);
      }
    }

    while (
      lfNoFsTargets.length > 0
      && (lfFsTargets.length + (mainTargetHasLf ? 1 : 0)) < maxActiveFlameShocks
      && selectedTargets.length < actualSpreadTargets
    ) {
      this.moveRandomTarget(lfNoFsTargets, selectedTargets, rng);
    }

    while (
      noLfNoFsTargets.length > 0
      && (lfFsTargets.length + noLfFsTargets.length + 1) < maxActiveFlameShocks
      && selectedTargets.length < actualSpreadTargets
    ) {
      this.moveRandomTarget(noLfNoFsTargets, selectedTargets, rng);
    }

    while (lfFsTargets.length > 0 && selectedTargets.length < actualSpreadTargets) {
      this.moveRandomTarget(lfFsTargets, selectedTargets, rng);
    }

    while (noLfFsTargets.length > 0 && selectedTargets.length < actualSpreadTargets) {
      this.moveRandomTarget(noLfFsTargets, selectedTargets, rng);
    }

    const refreshMainTarget = this.flameShockAction.executeOnTarget(queue, rng, isComboStrike, 0);
    result.newEvents.push(...refreshMainTarget.newEvents);

    for (const targetId of selectedTargets) {
      const spread = this.flameShockAction.executeOnTarget(queue, rng, isComboStrike, targetId);
      result.newEvents.push(...spread.newEvents);
    }
  }
}
