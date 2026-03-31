// src/core/class_modules/monk/actions/touch_of_death.ts
import type { ActionResult } from '../../../engine/action';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import { MonkAction } from '../monk_action';
import {
  IMPROVED_TOUCH_OF_DEATH_DAMAGE_FRACTION,
  IMPROVED_TOUCH_OF_DEATH_EXECUTE_PCT,
} from '../monk_runtime';

/**
 * Touch of Death — SimC behavior:
 * - Cast ready when target HP < 15% (Improved ToD) OR target current HP <= player max HP.
 * - Damage branch:
 *   - target HP <= player max HP: deal max HP
 *   - otherwise: deal 35% max HP, multiplied by Mastery only (when Combo Strikes is up)
 * - Versatility and other generic multipliers do not apply.
 */
export class TouchOfDeathAction extends MonkAction {
  readonly name = 'touch_of_death';
  readonly spellData = requireMonkSpellData(322109);

  override preCastFailReason(): 'execute_not_ready' | undefined {
    const maxHealth = this.p.getMaxHealth();
    const targetCurrentHealth = this.p.getTargetCurrentHealth?.() ?? 0;
    const killRangeReady = targetCurrentHealth > 0 && targetCurrentHealth <= maxHealth;
    const improvedExecuteReady = this.p.hasTalent('improved_touch_of_death')
      && this.p.targetHealthPct < IMPROVED_TOUCH_OF_DEATH_EXECUTE_PCT;
    return killRangeReady || improvedExecuteReady ? undefined : 'execute_not_ready';
  }

  override execute(
    _queue: SimEventQueue,
    _rng: RngInstance,
    _isComboStrike: boolean,
  ): ActionResult {
    const maxHealth = this.p.getMaxHealth();
    const targetCurrentHealth = this.p.getTargetCurrentHealth?.() ?? 0;
    const inKillRange = targetCurrentHealth > 0 && targetCurrentHealth <= maxHealth;

    let damage = maxHealth;
    if (!inKillRange) {
      damage *= IMPROVED_TOUCH_OF_DEATH_DAMAGE_FRACTION;
      // SimC debug shows da_mul=1, ply_mul=1, versatility=1, target_armor=0
      // for Touch of Death.  The only dynamic multiplier is Combo Strikes
      // mastery, applied manually below.  composite_da_multiplier (Ferocity
      // of Xuen, Weapon of Wind, etc.) is NOT applied.
      if (this.p.isBuffActive('combo_strikes')) {
        damage *= 1 + this.p.getMasteryPercent() / 100;
      }
    }

    // Do NOT call this.p.addDamage() — the executor adds result.damage to
    // state.totalDamage for every action.  Calling it here would double-count.
    if (this.p.hasTalent('improved_touch_of_death')) {
      this.p.gainChi(3);
    }

    return {
      damage,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}
