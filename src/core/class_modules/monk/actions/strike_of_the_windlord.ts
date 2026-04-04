// src/core/class_modules/monk/actions/strike_of_the_windlord.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import type { ActionResult } from '../../../engine/action';
import { EventType } from '../../../engine/eventQueue';
import type { SimEventQueue } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import {
  THUNDERFIST_BASE_STACKS,
  THUNDERFIST_MAX_STACKS,
  THUNDERFIST_DURATION_SECONDS,
  TEACHINGS_OF_THE_MONASTERY_BASE_MAX_STACKS,
  TEACHINGS_OF_THE_MONASTERY_DURATION_SECONDS,
  COMBO_BREAKER_MAX_STACKS,
  COMBO_BREAKER_DURATION_SECONDS,
} from '../monk_derived_values';

const MIDNIGHT_SEASON_2PC_SPELL = requireMonkSpellData(1264842);
const KNOWLEDGE_OF_THE_BROKEN_TEMPLE_SPELL = requireMonkSpellData(451529);

export class StrikeOfTheWindlordAction extends MonkMeleeAction {
  readonly name = 'strike_of_the_windlord';
  readonly spellData = requireMonkSpellData(392983);

  // AOE: hits all enemies, no sqrt reduction, damage divided by target count
  override readonly aoe = -1;

  /** SimC: composite_aoe_multiplier divides damage by n_targets for secondary targets. */
  override compositeAoeMultiplier(_chainTarget: number, nTargets: number): number {
    return 1.0 / nTargets;
  }

  override cooldownDuration(baseDuration: number, hasteScalesCooldown: boolean): number {
    let adjusted = baseDuration;
    if (this.p.hasTalent('communion_with_wind')) {
      adjusted = Math.max(0, adjusted - 5);
    }
    if (this.p.hasTalent('midnight_season_1_4pc')) {
      adjusted = Math.max(0, adjusted - 5);
    }
    return super.cooldownDuration(adjusted, hasteScalesCooldown);
  }

  override composite_da_multiplier(): number {
    let m = super.composite_da_multiplier();
    if (this.p.hasTalent('midnight_season_1_2pc')) m *= 1 + MIDNIGHT_SEASON_2PC_SPELL.effectN(1).percent();
    return m;
  }

  /**
   * Chi cost: 2, reduced to 1 by Knowledge of the Broken Temple.
   * Executor applies Zenith -1 on top.
   */
  override chiCost(): number {
    return this.p.hasTalent('knowledge_of_the_broken_temple') ? 1 : 2;
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const n = this.nTargets();

    // Single-target fast path: keep original behavior
    if (n <= 1) {
      return this.executeSingleTarget(queue, rng, isComboStrike);
    }

    // Multi-target: handle all damage internally, return damage: 0
    // to prevent the executor from double-counting.
    if (this.mayComboStrike()) {
      this.comboStrikesTrigger(isComboStrike);
    }

    // Primary target
    const primary = this.calculateDamage(rng, isComboStrike);
    this.p.addDamage(primary.damage, 0);
    this.p.recordPendingSpellStat(this.name, primary.damage, 1, primary.isCrit);

    // Secondary targets — independent crit, AOE multiplier applied
    for (let t = 1; t < n; t++) {
      const secondary = this.calculateDamage(rng, isComboStrike, t);
      const damage = secondary.damage * this.aoeDamageMultiplier(t, n);
      this.p.addDamage(damage, t);
      this.p.recordPendingSpellStat(this.name, damage, 0, secondary.isCrit);
    }

    const result: ActionResult = {
      damage: 0,
      isCrit: primary.isCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    this.applyTalentEffects(result);
    return result;
  }

  /** Original single-target path: executor handles addDamage via result.damage. */
  private executeSingleTarget(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const result = super.execute(queue, rng, isComboStrike);
    this.applyTalentEffects(result);
    return result;
  }

  private applyTalentEffects(result: ActionResult): void {

    // knowledge_of_the_broken_temple: +effectN(1) teachings_of_the_monastery stacks
    if (this.p.hasTalent('knowledge_of_the_broken_temple')) {
      const stacksAdded = KNOWLEDGE_OF_THE_BROKEN_TEMPLE_SPELL.effectN(1).base_value();
      const maxStacks = TEACHINGS_OF_THE_MONASTERY_BASE_MAX_STACKS + stacksAdded;
      const nextStacks = Math.min(maxStacks, this.p.getBuffStacks('teachings_of_the_monastery') + stacksAdded);
      this.p.applyBuff('teachings_of_the_monastery', TEACHINGS_OF_THE_MONASTERY_DURATION_SECONDS, nextStacks);
      result.buffsApplied.push({
        id: 'teachings_of_the_monastery',
        duration: TEACHINGS_OF_THE_MONASTERY_DURATION_SECONDS,
        stacks: nextStacks,
      });
    }

    // echo_technique: +1 combo_breaker stack (cap at 2)
    if (this.p.hasTalent('echo_technique')) {
      const stacksBefore = this.p.getBuffStacks('combo_breaker');
      const stacksAfter = Math.min(COMBO_BREAKER_MAX_STACKS, Math.max(1, stacksBefore + 1));
      this.p.applyBuff('combo_breaker', COMBO_BREAKER_DURATION_SECONDS, stacksAfter);
      if (stacksBefore > 0) {
        result.newEvents.push({
          type: EventType.BUFF_STACK_CHANGE,
          time: this.p.currentTime,
          buffId: 'combo_breaker',
          stacks: stacksAfter,
          prevStacks: stacksBefore,
        });
      } else {
        result.newEvents.push({
          type: EventType.BUFF_APPLY,
          time: this.p.currentTime,
          buffId: 'combo_breaker',
        });
      }
    }

    // thunderfist: effectN(1) stacks on primary target + 1 per additional enemy (capped by buff max stacks).
    // SimC: SotW off-hand impact grants base_value stacks for first target, +1 per extra.
    if (this.p.hasTalent('thunderfist')) {
      const stacksGranted = THUNDERFIST_BASE_STACKS + Math.max(0, this.p.activeEnemies - 1);
      const currentStacks = this.p.getBuffStacks('thunderfist');
      const newTotal = Math.min(THUNDERFIST_MAX_STACKS, currentStacks + stacksGranted);
      const stacksBefore = currentStacks;
      this.p.applyBuff('thunderfist', THUNDERFIST_DURATION_SECONDS, newTotal);
      if (stacksBefore > 0) {
        result.newEvents.push({
          type: EventType.BUFF_STACK_CHANGE,
          time: this.p.currentTime,
          buffId: 'thunderfist',
          stacks: newTotal,
          prevStacks: stacksBefore,
        });
      } else {
        result.newEvents.push({ type: EventType.BUFF_APPLY, time: this.p.currentTime, buffId: 'thunderfist' });
      }
    }
  }
}
