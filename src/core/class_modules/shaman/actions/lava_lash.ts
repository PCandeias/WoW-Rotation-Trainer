import type { ActionResult } from '../../../engine/action';
import type { IGameState } from '../../../engine/i_game_state';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { triggerRideTheLightning } from './chain_lightning';
import { FlameShockAction } from './flame_shock';
import { triggerCrashLightningProc } from './crash_lightning';
import { triggerStormsurgeProc } from './stormsurge';
import { triggerFlametongueWeapon, triggerWindfuryWeapon } from './windfury_weapon';
import { applyShamanBuffStacks, ShamanAction, triggerMaelstromWeaponProc } from '../shaman_action';
import { triggerWhirlingFire } from './surging_totem';

const MOLTEN_ASSAULT_TALENT = requireShamanSpellData(334033);
const ASHEN_CATALYST_TALENT = requireShamanSpellData(390370);
const LASHING_FLAMES_DEBUFF = requireShamanSpellData(334168);
const WINNING_STREAK = requireShamanSpellData(1218616);
const HOT_HAND_DAMAGE_BONUS_BY_RANK = [0, 20, 40] as const;
const HOT_HAND_COOLDOWN_RATE_BONUS_BY_RANK = [0, 34, 100] as const;

function hotHandTalentValueByRank(values: readonly number[], rank: number): number {
  if (rank <= 0) {
    return 0;
  }

  return values[Math.min(rank, values.length - 1)] ?? 0;
}

export function applyTemporaryCooldownRate(baseDuration: number, rateBonusPct: number, activeWindowSeconds: number): number {
  if (baseDuration <= 0 || rateBonusPct <= 0 || activeWindowSeconds <= 0) {
    return baseDuration;
  }

  const rateMultiplier = 1 + rateBonusPct / 100;
  const acceleratedWindow = activeWindowSeconds * rateMultiplier;
  if (baseDuration <= acceleratedWindow) {
    return baseDuration / rateMultiplier;
  }

  return baseDuration - activeWindowSeconds * (rateMultiplier - 1);
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

  constructor(state: IGameState) {
    super(state);
    this.flameShockAction = new FlameShockAction(state);
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

    const hotHandRank = this.p.getTalentRank('hot_hand');
    if (hotHandRank > 0 && this.p.isBuffActive('hot_hand')) {
      multiplier *= 1 + hotHandTalentValueByRank(HOT_HAND_DAMAGE_BONUS_BY_RANK, hotHandRank) / 100;
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      multiplier *= 1 + WINNING_STREAK.effectN(1).percent() * this.p.getBuffStacks('winning_streak');
    }

    return multiplier;
  }

  override cooldownDuration(baseDuration: number, hasteScalesCooldown: boolean): number {
    const duration = super.cooldownDuration(baseDuration, hasteScalesCooldown);
    const hotHandRank = this.p.getTalentRank('hot_hand');
    if (hotHandRank <= 0 || !this.p.isBuffActive('hot_hand')) {
      return duration;
    }

    const remains = this.p.getBuffRemains?.('hot_hand') ?? 0;
    return applyTemporaryCooldownRate(
      duration,
      hotHandTalentValueByRank(HOT_HAND_COOLDOWN_RATE_BONUS_BY_RANK, hotHandRank),
      remains,
    );
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const result = super.execute(queue, rng, isComboStrike);
    if (result.damage > 0) {
      triggerStormsurgeProc(this.p, rng, result.newEvents);
      triggerMaelstromWeaponProc(this.p, rng, result.newEvents);
      const flametongue = triggerFlametongueWeapon(this.p, rng, isComboStrike);
      result.newEvents.push(...flametongue.newEvents);
      result.isCrit = result.isCrit || flametongue.isCrit;
      const windfury = triggerWindfuryWeapon(this.p, queue, rng, isComboStrike);
      result.newEvents.push(...windfury.newEvents);
      result.isCrit = result.isCrit || windfury.isCrit;
    }
    this.p.applyTargetDebuff?.('lashing_flames', LASHING_FLAMES_DEBUFF.duration_ms() / 1000, 0, 1);
    const crashLightningProc = triggerCrashLightningProc(this.p, queue, rng, isComboStrike);
    result.newEvents.push(...crashLightningProc.newEvents);
    const rideTheLightning = triggerRideTheLightning(this.p, queue, rng, isComboStrike, 'chain_lightning_ll_rtl');
    result.isCrit = result.isCrit || rideTheLightning.isCrit;
    this.triggerMoltenAssault(queue, rng, isComboStrike, result);
    triggerWhirlingFire(this.p, result.newEvents);

    if (this.p.hasTalent('ashen_catalyst') && this.p.isTargetDebuffActive?.('flame_shock', 0)) {
      result.cooldownAdjustments.push({
        spellId: 'lava_lash',
        delta: ASHEN_CATALYST_TALENT.effectN(1).time_value() / 1000,
      });
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      applyShamanBuffStacks(this.p, 'winning_streak', this.p.getBuffStacks('winning_streak') + 1, result.newEvents);
    }

    this.p.recordPendingSpellStat(this.name, result.damage, 1, result.isCrit);
    return result;
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
