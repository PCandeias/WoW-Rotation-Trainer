// src/core/class_modules/monk/actions/blackout_kick.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import type { ActionResult } from '../../../engine/action';
import { EventType } from '../../../engine/eventQueue';
import type { SimEventQueue } from '../../../engine/eventQueue';
import { rollChance } from '../../../engine/rng';
import type { RngInstance } from '../../../engine/rng';
import { calculateDamage } from '../../../engine/damage';

import { BOK_WW_SPEC_MULTIPLIER } from '../monk_derived_values';

import { TEACHINGS_OF_THE_MONASTERY_SPELL } from '../monk_proc_spells';

const ENERGY_BURST_SPELL = requireMonkSpellData(451498);
const TEACHINGS_OF_THE_MONASTERY_TALENT = requireMonkSpellData(116645);
const RWK_TALENT_SPELL = requireMonkSpellData(1250566);

export class BlackoutKickAction extends MonkMeleeAction {
  readonly name = 'blackout_kick';
  readonly spellData = requireMonkSpellData(100784);

  private calculateTeachingsHitDamage(rng: RngInstance): { damage: number; isCrit: boolean } {
    const result = calculateDamage(TEACHINGS_OF_THE_MONASTERY_SPELL, this.p, rng, false);
    return {
      damage: result.finalDamage,
      isCrit: result.isCrit,
    };
  }

  /**
   * SimC: base_blackout_kick_t sets ap_type = attack_power_type::WEAPON_BOTH (sc_monk.cpp:1171).
   * For DW with equal-DPS weapons this is identical to WEAPON_MAINHAND; for unequal weapons
   * the formula is: base_ap + floor((MH_dps + OH_dps/2) * 2/3 * 6).
   */
  protected override effectiveAttackPower(): number {
    return this.p.getWeaponBothAttackPower?.() ?? this.p.getAttackPower();
  }

  /** BOK_WW_SPEC_MULTIPLIER (×4.29) spec bonus on top of WW 0.9× base. */
  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * BOK_WW_SPEC_MULTIPLIER;
  }

  /**
   * Chi cost is 0 when combo_breaker is active — SimC
   * applies the buff's -100% chi cost reduction at cost-check time, so BK is
   * free and castable even at chi=0.  Otherwise the base cost is 1.
   *
   * Executor applies the Zenith global -1 on top of this value (clamped to 0).
   */
  override chiCost(): number {
    return this.p.isBuffActive('combo_breaker') ? 0 : 1;
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    // combo_breaker active before cast → this is a free BoK (cost=0).
    // Executor consumes the proc stack AFTER the dispatch shim returns, so the
    // buff is still present here. Free casts must NOT trigger dance_of_chi_ji.
    const isFree = this.p.isBuffActive('combo_breaker');

    const result = super.execute(queue, rng, isComboStrike);

    // -------------------------------------------------------------------------
    // Shadowboxing Treads cleave (single-target Teachings hits are unaffected)
    // -------------------------------------------------------------------------
    if (this.p.hasTalent('shadowboxing_treads') && result.damage > 0) {
      const maxAdditionalTargets = 2;
      const secondaryEffectiveness = 0.80;
      const additionalTargets = Math.min(maxAdditionalTargets, this.p.activeEnemies - 1);

      for (let t = 0; t < additionalTargets; t++) {
        const secondaryResult = this.calculateDamage(rng, isComboStrike, t + 1);
        const secondaryDamage = secondaryResult.damage * secondaryEffectiveness;
        this.p.addDamage(secondaryDamage, t + 1);
        this.p.recordPendingSpellStat('blackout_kick', secondaryDamage, 0, secondaryResult.isCrit);
      }
    }

    // -------------------------------------------------------------------------
    // Combo Breaker stack consume
    // chiCost() already returns 0 when the buff is active, so the executor
    // spent 0 chi. We just need to consume the BR stack and emit the event.
    // -------------------------------------------------------------------------
    if (isFree) {
      const stacksBefore = this.p.getBuffStacks('combo_breaker');
      this.p.removeBuffStack('combo_breaker');
      if (stacksBefore <= 1) {
        // Last stack consumed — buff fully expired
        result.newEvents.push({
          type: EventType.BUFF_EXPIRE,
          time: this.p.currentTime,
          buffId: 'combo_breaker',
        });
      } else {
        // Still stacks remaining — emit stack change
        result.newEvents.push({
          type: EventType.BUFF_STACK_CHANGE,
          time: this.p.currentTime,
          buffId: 'combo_breaker',
          stacks: stacksBefore - 1,
          prevStacks: stacksBefore,
        });
      }
    }

    // -------------------------------------------------------------------------
    // Sharp Reflexes CD reduction (always on BoK cast, talent required)
    // -------------------------------------------------------------------------
    if (this.p.hasTalent('sharp_reflexes')) {
      const isZenith =
        this.p.isBuffActive('zenith') || this.p.isBuffActive('celestial_conduit_active');
      const reduction = isZenith ? 2 : 1;
      result.cooldownAdjustments.push({ spellId: 'rising_sun_kick', delta: reduction });
      result.cooldownAdjustments.push({ spellId: 'fists_of_fury', delta: reduction });
    }

    // -------------------------------------------------------------------------
    // Rushing Wind Kick buff proc (60% when free + talent)
    // -------------------------------------------------------------------------
    if (isFree && this.p.hasTalent('rushing_wind_kick') && rollChance(rng, RWK_TALENT_SPELL.effectN(1).base_value())) {
      result.buffsApplied.push({ id: 'rushing_wind_kick', duration: 15 });
    }

    // -------------------------------------------------------------------------
    // Energy Burst chi gain (DBC 451498: effectN(1) = proc%, effectN(2) = chi)
    // -------------------------------------------------------------------------
    if (isFree && this.p.hasTalent('energy_burst') && rollChance(rng, ENERGY_BURST_SPELL.effectN(1).base_value())) {
      this.p.gainChi(ENERGY_BURST_SPELL.effectN(2).base_value());
    }

    // -------------------------------------------------------------------------
    // Obsidian Spiral chi gain (when Zenith active + talent)
    // -------------------------------------------------------------------------
    if (
      (this.p.isBuffActive('zenith') || this.p.isBuffActive('celestial_conduit_active')) &&
      this.p.hasTalent('obsidian_spiral')
    ) {
      this.p.gainChi(1);
    }

    // -------------------------------------------------------------------------
    // Teachings of the Monastery flush (on BoK cast)
    // -------------------------------------------------------------------------
    if (this.p.hasTalent('teachings_of_the_monastery')) {
      const stacks = this.p.getBuffStacks('teachings_of_the_monastery');
      if (stacks > 0) {
        this.p.expireBuff('teachings_of_the_monastery');
        result.newEvents.push({
          type: EventType.BUFF_EXPIRE,
          time: this.p.currentTime,
          buffId: 'teachings_of_the_monastery',
        });

        for (let i = 0; i < stacks; i++) {
          const dmgResult = this.calculateTeachingsHitDamage(rng);
          this.p.addDamage(dmgResult.damage);
          this.p.recordPendingSpellStat(
            TEACHINGS_OF_THE_MONASTERY_SPELL.name,
            dmgResult.damage,
            1,
            dmgResult.isCrit,
          );

          if (rollChance(rng, TEACHINGS_OF_THE_MONASTERY_TALENT.effectN(1).base_value())) {
            // DBC 116645 effectN(1): % chance to reset RSK cooldown per stack
            result.cooldownAdjustments.push({ spellId: 'rising_sun_kick', delta: 999 });
          }
        }
      }
    }

    return result;
  }
}
