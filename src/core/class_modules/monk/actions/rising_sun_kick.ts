// src/core/class_modules/monk/actions/rising_sun_kick.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import type { ActionResult } from '../../../engine/action';
import { EventType } from '../../../engine/eventQueue';
import type { SimEventQueue } from '../../../engine/eventQueue';
import { rollChance } from '../../../engine/rng';
import type { RngInstance } from '../../../engine/rng';
import { calculateDamage } from '../../../engine/damage';
import type { GameState } from '../../../engine/gameState';
import { GLORY_OF_THE_DAWN_RSK_SPELL } from '../monk_proc_spells';
import { FlurryStrikeSource, triggerFlurryStrikes } from '../flurry_strikes';
import { getWindwalkerRskFamilyDirectMultiplier } from '../monk_runtime';
import { getHuntersMarkTargetMultiplier } from '../../../shared/player_effects';

const RISING_STAR_SPELL = requireMonkSpellData(388849);
const FAST_FEET_SPELL = requireMonkSpellData(388809);
const SKYFIRE_HEEL_TALENT = requireMonkSpellData(1248704);
const SUNFIRE_SPIRAL_SPELL = requireMonkSpellData(1272415);
const RISING_STAR_DIRECT_MULTIPLIER = 1 + RISING_STAR_SPELL.effectN(1).percent();
const RISING_STAR_CRIT_BONUS_PERCENT = RISING_STAR_SPELL.effectN(2).percent();
const XUENS_BATTLEGEAR_SPELL = requireMonkSpellData(392993);
const XUENS_BATTLEGEAR_FOF_REDUCTION_SECONDS = XUENS_BATTLEGEAR_SPELL.effectN(2).time_value() / 1000;
const SKYFIRE_HEEL_SPLASH_PERCENT = SKYFIRE_HEEL_TALENT.effectN(1).percent(); // 0.10
const SKYFIRE_HEEL_REDUCED_AOE_TARGETS = SKYFIRE_HEEL_TALENT.effectN(2).base_value(); // 5
export class RisingSunKickAction extends MonkMeleeAction {
  readonly name: string = 'rising_sun_kick';
  readonly spellData = requireMonkSpellData(107428);

  /** Override in subclasses to use a different Glory of the Dawn spell. */
  protected get gloryOfTheDawnSpell(): typeof GLORY_OF_THE_DAWN_RSK_SPELL { return GLORY_OF_THE_DAWN_RSK_SPELL; }

  /** RSK-family direct modifier from Windwalker passive data (effect #15) + Fast Feet talent. */
  override composite_da_multiplier(): number {
    let m = super.composite_da_multiplier() * getWindwalkerRskFamilyDirectMultiplier();
    // Fast Feet (388809 effectN(1)): +70% direct damage to RSK/GotD/RWK family.
    // RWK inherits this via subclass, so no separate override needed there.
    if (this.p.hasTalent('fast_feet')) m *= 1 + FAST_FEET_SPELL.effectN(1).percent();
    return m;
  }

  /**
   * Chi cost: 2, reduced to 1 by Knowledge of the Broken Temple.
   * Executor applies Zenith -1 on top.
   */
  override chiCost(): number {
    return this.p.hasTalent('knowledge_of_the_broken_temple') ? 1 : 2;
  }

  override preCastFailReason(): 'not_available' | undefined {
    return this.p.isBuffActive('rushing_wind_kick') ? 'not_available' : undefined;
  }

  protected applyRisingStarModifiers(damage: number, isCrit: boolean): number {
    if (!this.p.hasTalent('rising_star')) {
      return damage;
    }

    let adjusted = damage * RISING_STAR_DIRECT_MULTIPLIER;
    if (isCrit) {
      const critMultiplier = this.critDamageMultiplier();
      if (critMultiplier > 1) {
        const critBonus = critMultiplier - 1;
        const risingStarCritMultiplier = 1 + critBonus * (1 + RISING_STAR_CRIT_BONUS_PERCENT);
        adjusted *= risingStarCritMultiplier / critMultiplier;
      }
    }
    return adjusted;
  }

  /**
   * Whether Sunfire Spiral (+40% mastery effectiveness) applies to this kick.
   * In SimC (bugs=true) sunfire_spiral is only added in rising_sun_kick_t::damage_t,
   * NOT in rushing_wind_kick_t::damage_t.  Subclasses override to return false.
   */
  protected appliesSunfireSpiral(): boolean {
    return true;
  }

  override calculateDamage(rng: RngInstance, isComboStrike: boolean): { damage: number; isCrit: boolean } {
    const result = super.calculateDamage(rng, isComboStrike);
    let damage = this.applyRisingStarModifiers(result.damage, result.isCrit);
    if (this.appliesSunfireSpiral() && isComboStrike && this.p.hasTalent('sunfire_spiral')) {
      damage *= 1 + SUNFIRE_SPIRAL_SPELL.effectN(1).percent();
    }
    return { damage, isCrit: result.isCrit };
  }

  protected executeKickBase(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    return super.execute(queue, rng, isComboStrike);
  }

  protected applySharedKickEffects(
    result: ActionResult,
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): void {
    void queue;

    if (this.p.hasTalent('glory_of_the_dawn')) {
      const hastePercent = this.p.getHastePercent();
      if (rollChance(rng, Math.min(100, hastePercent))) {
        const gotdResult = calculateDamage(this.gloryOfTheDawnSpell, this.p, rng, isComboStrike);
        const gotdDamage = this.applyRisingStarModifiers(gotdResult.finalDamage, gotdResult.isCrit);
        this.p.addDamage(gotdDamage);
        this.p.gainChi(1);
        this.p.recordPendingSpellStat(this.gloryOfTheDawnSpell.name, gotdDamage, 1, gotdResult.isCrit);
        this.maybeApplyXuensBattlegearReduction(result, gotdResult.isCrit);
      }
    }

    // -------------------------------------------------------------------------
    // Skyfire Heel: splash 10% of RSK/RWK damage to secondary targets.
    // DBC 1248712: Can't Crit, Ignore Damage Taken/Caster Modifiers — raw value.
    // AoE targets exclude primary; damage reduced beyond effectN(2) targets.
    // -------------------------------------------------------------------------
    if (this.p.hasTalent('skyfire_heel') && result.damage > 0) {
      const secondaryTargets = this.p.activeEnemies - 1;
      if (secondaryTargets > 0) {
        let splashPerTarget = result.damage * SKYFIRE_HEEL_SPLASH_PERCENT;
        const huntersMarkMult = getHuntersMarkTargetMultiplier(this.p);
        if (huntersMarkMult > 1) {
          // SimC keeps Hunter's Mark on a single target in multi-target. This
          // splash applies to secondary targets, so remove HM from that portion.
          splashPerTarget /= huntersMarkMult;
        }
        // SimC applies uniform sqrt reduction when total secondary > reduced_aoe_targets
        const reduction = secondaryTargets > SKYFIRE_HEEL_REDUCED_AOE_TARGETS
          ? Math.sqrt(SKYFIRE_HEEL_REDUCED_AOE_TARGETS / Math.min(20, secondaryTargets))
          : 1.0;
        let totalSplash = 0;
        for (let i = 0; i < secondaryTargets; i++) {
          const targetDamage = splashPerTarget * reduction;
          this.p.addDamage(targetDamage, i + 1);
          totalSplash += targetDamage;
        }
        this.p.recordPendingSpellStat(`skyfire_heel_${this.name}`, totalSplash, 1);
      }
    }

    // -------------------------------------------------------------------------
    // Xuen's Battlegear: crit reduces FoF cooldown by the talent's DBC value
    // -------------------------------------------------------------------------
    this.maybeApplyXuensBattlegearReduction(result, result.isCrit);
  }

  private maybeApplyXuensBattlegearReduction(result: ActionResult, isCrit: boolean): void {
    if (!isCrit || !this.p.hasTalent('xuens_battlegear')) {
      return;
    }

    result.cooldownAdjustments.push({
      spellId: 'fists_of_fury',
      delta: XUENS_BATTLEGEAR_FOF_REDUCTION_SECONDS,
    });
  }

  protected applyRisingSunKickOnlyEffects(
    result: ActionResult,
    queue: SimEventQueue,
    rng: RngInstance,
  ): void {
    void queue;
    void rng;

    // -------------------------------------------------------------------------
    // WDP buff trigger
    // -------------------------------------------------------------------------
    if (this.p.hasTalent('whirling_dragon_punch')) {
      const hastePercent = this.p.getHastePercent();
      const remains = Math.min(
        this.p.getCooldownRemains('rising_sun_kick'),
        this.p.getCooldownRemains('fists_of_fury'),
      );
      if (remains > 0) {
        const graceWindow = Math.max(0.75, 1.5 / (1 + hastePercent / 100));
        this.p.applyBuff('whirling_dragon_punch', remains + graceWindow);
        result.newEvents.push({
          type: EventType.BUFF_APPLY,
          time: this.p.currentTime,
          buffId: 'whirling_dragon_punch',
        });
      }
    }

    // -------------------------------------------------------------------------
    // Wisdom of the Wall: flurry strikes during Zenith
    // -------------------------------------------------------------------------
    if (
      this.p.hasTalent('wisdom_of_the_wall') &&
      this.p.isBuffActive('zenith')
    ) {
      result.newEvents.push(
        ...triggerFlurryStrikes(this.p as GameState, FlurryStrikeSource.WISDOM_OF_THE_WALL),
      );
    }
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const result = this.executeKickBase(queue, rng, isComboStrike);
    this.applySharedKickEffects(result, queue, rng, isComboStrike);
    this.applyRisingSunKickOnlyEffects(result, queue, rng);

    return result;
  }
}
