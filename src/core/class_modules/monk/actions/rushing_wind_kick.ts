// src/core/class_modules/monk/actions/rushing_wind_kick.ts
import { RisingSunKickAction } from './rising_sun_kick';
import type { ActionResult } from '../../../engine/action';
import { EventType } from '../../../engine/eventQueue';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { GLORY_OF_THE_DAWN_RWK_SPELL } from '../monk_proc_spells';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';

const RUSHING_WIND_KICK_SCALING = requireMonkSpellData(467307);

export class RushingWindKickAction extends RisingSunKickAction {
  // RWK is a distinct nature damage spell in SimC:
  // - trigger damage spell 468179 AP coeff = 1.7975
  // - +6% per target hit, capped at 5 targets (spell 467307 effects #1/#2)
  override readonly name = 'rushing_wind_kick';
  override readonly spellData = RUSHING_WIND_KICK_SCALING;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override get gloryOfTheDawnSpell(): typeof GLORY_OF_THE_DAWN_RWK_SPELL { return GLORY_OF_THE_DAWN_RWK_SPELL; }

  /**
   * SimC: composite_aoe_multiplier() applies (1 + n_targets × 6%) where
   * n_targets is capped at effectN(2) (5).  Unlike most AoE effects this
   * counts ALL hit targets including the primary, so at 1 target: ×1.06.
   *
   * Source: sc_monk.cpp rushing_wind_kick_t::damage_t::composite_aoe_multiplier()
   */
  override composite_da_multiplier(): number {
    const base = super.composite_da_multiplier();
    const cappedTargets = Math.min(
      this.p.activeEnemies,
      RUSHING_WIND_KICK_SCALING.effectN(2).base_value(),
    );
    return base * (1 + cappedTargets * RUSHING_WIND_KICK_SCALING.effectN(1).percent());
  }

  /**
   * Sunfire Spiral (+40% DA when combo_strikes is active) applies ONLY to RSK
   * in SimC, not to RWK.  In sc_monk.cpp the `bugs=true` code path adds
   * sunfire_spiral only in `rising_sun_kick_t::damage_t` (line 990) — the
   * `rushing_wind_kick_t::damage_t` constructor does not add it.
   */
  protected override appliesSunfireSpiral(): boolean {
    return false;
  }

  /**
   * Rushing Wind Kick is a free proc — costs 0 chi regardless of talents.
   * Overrides RisingSunKickAction.chiCost() which returns 2.
   */
  override chiCost(): number {
    return 0;
  }

  override preCastFailReason(): 'talent_missing' | undefined {
    return this.p.isBuffActive('rushing_wind_kick') ? undefined : 'talent_missing';
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    // Consume the rushing_wind_kick buff before delegating to RSK logic
    this.p.expireBuff('rushing_wind_kick');
    const result = this.executeKickBase(queue, rng, isComboStrike);
    this.applySharedKickEffects(result, queue, rng, isComboStrike);

    // Prepend the BUFF_EXPIRE event so it appears at cast time
    result.newEvents.unshift({
      type: EventType.BUFF_EXPIRE,
      time: this.p.currentTime,
      buffId: 'rushing_wind_kick',
    });

    return result;
  }
}
