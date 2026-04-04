// src/core/class_modules/monk/actions/whirling_dragon_punch.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import type { ActionResult } from '../../../engine/action';
import { EventType } from '../../../engine/eventQueue';
import type { SimEventQueue } from '../../../engine/eventQueue';
import { rollChance } from '../../../engine/rng';
import type { RngInstance } from '../../../engine/rng';
import { calculateDamage } from '../../../engine/damage';
import type { SpellDef } from '../../../data/spells';
import {
  THUNDERFIST_BASE_STACKS,
  THUNDERFIST_MAX_STACKS,
  THUNDERFIST_DURATION_SECONDS,
  TEACHINGS_OF_THE_MONASTERY_BASE_MAX_STACKS,
  TEACHINGS_OF_THE_MONASTERY_DURATION_SECONDS,
  COMBO_BREAKER_MAX_STACKS,
  COMBO_BREAKER_DURATION_SECONDS,
} from '../monk_derived_values';

import {
  WHIRLING_DRAGON_PUNCH_AOE_SPELL,
  WHIRLING_DRAGON_PUNCH_SINGLETARGET_SPELL,
} from '../monk_proc_spells';

const KNOWLEDGE_OF_THE_BROKEN_TEMPLE_SPELL = requireMonkSpellData(451529);
const COMMUNION_WITH_WIND_SPELL = requireMonkSpellData(451576);
const MIDNIGHT_SEASON_2PC_SPELL = requireMonkSpellData(1264842);
const REVOLVING_WHIRL_SPELL = requireMonkSpellData(451524);

export class WhirlingDragonPunchAction extends MonkMeleeAction {
  readonly name = 'whirling_dragon_punch';
  readonly spellData = requireMonkSpellData(152175);

  private calculateChildHitDamage(
    spell: SpellDef,
    rng: RngInstance,
    isComboStrike: boolean,
    targetIndex?: number,
  ): { damage: number; isCrit: boolean } {
    const result = calculateDamage(spell, this.p, rng, isComboStrike, undefined, targetIndex);
    // Child spell damage already passes through generic monk hooks in
    // calculateDamage(); apply only WDP-specific bonuses here.
    let spellSpecificMultiplier = 1.0;
    if (this.p.hasTalent('knowledge_of_the_broken_temple')) {
      spellSpecificMultiplier *= 1 + KNOWLEDGE_OF_THE_BROKEN_TEMPLE_SPELL.effectN(2).percent();
    }
    if (this.p.hasTalent('communion_with_wind')) {
      spellSpecificMultiplier *= 1 + COMMUNION_WITH_WIND_SPELL.effectN(2).percent();
    }
    if (this.p.hasTalent('midnight_season_1_2pc')) {
      spellSpecificMultiplier *= 1 + MIDNIGHT_SEASON_2PC_SPELL.effectN(1).percent();
    }
    return {
      damage: result.finalDamage * spellSpecificMultiplier,
      isCrit: result.isCrit,
    };
  }

  override calculateDamage(rng: RngInstance, isComboStrike: boolean, targetIndex?: number): { damage: number; isCrit: boolean } {
    const singletargetHit = this.calculateChildHitDamage(
      WHIRLING_DRAGON_PUNCH_SINGLETARGET_SPELL,
      rng,
      isComboStrike,
      targetIndex,
    );
    const aoeHits = Array.from({ length: 3 }, () => (
      this.calculateChildHitDamage(WHIRLING_DRAGON_PUNCH_AOE_SPELL, rng, isComboStrike, targetIndex)
    ));

    return {
      damage: singletargetHit.damage + aoeHits.reduce((sum, hit) => sum + hit.damage, 0),
      isCrit: singletargetHit.isCrit || aoeHits.some((hit) => hit.isCrit),
    };
  }

  override preCastFailReason(): 'wdp_constraint' | undefined {
    return this.p.isBuffActive('whirling_dragon_punch') ? undefined : 'wdp_constraint';
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

  // WDP does not call super.execute() / Action.calculateDamage().
  // Damage is computed exclusively via calculateChildHitDamage() → free calculateDamage().
  // WDP-specific talent bonuses (KotBT, CWW, midnight_season_1_2pc) are applied there
  // as spellSpecificMultiplier.  composite_da_multiplier() is never reached from this
  // execute path and must NOT be overridden here — doing so would double-apply those
  // bonuses if the execution path ever changes.
  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    this.comboStrikesTrigger(isComboStrike);
    const singletargetHit = this.calculateChildHitDamage(WHIRLING_DRAGON_PUNCH_SINGLETARGET_SPELL, rng, isComboStrike);

    // WDP has no direct damage — all damage comes from child actions (ST + AOE).
    // Children are recorded via addDamage + recordPendingSpellStat under their
    // own names, matching SimC's add_child reporting.  result.damage must be 0
    // to avoid double-counting (the executor calls addDamage(result.damage)).
    this.p.addDamage(singletargetHit.damage, 0);
    this.p.recordPendingSpellStat(
      WHIRLING_DRAGON_PUNCH_SINGLETARGET_SPELL.name,
      singletargetHit.damage,
      1,
      singletargetHit.isCrit,
    );

    // 3 AOE ticks — each hits all enemies with sqrt reduction beyond 5 targets
    const n = this.p.activeEnemies ?? 1;
    const WDP_AOE_REDUCED_TARGETS = 5;
    const WDP_AOE_FULL_AMOUNT_TARGETS = 1;
    for (let tickIdx = 0; tickIdx < 3; tickIdx++) {
      for (let t = 0; t < n; t++) {
        const aoeHit = this.calculateChildHitDamage(WHIRLING_DRAGON_PUNCH_AOE_SPELL, rng, isComboStrike, t);
        let damage = aoeHit.damage;
        if (t > 0) {
          // Apply sqrt reduction for secondary targets (mirrors aoeDamageMultiplier logic)
          if (
            t >= WDP_AOE_FULL_AMOUNT_TARGETS &&
            WDP_AOE_REDUCED_TARGETS > 0 &&
            n > WDP_AOE_REDUCED_TARGETS
          ) {
            damage *= Math.sqrt(WDP_AOE_REDUCED_TARGETS / Math.min(20, n));
          }
        }
        this.p.addDamage(damage, t);
        this.p.recordPendingSpellStat(
          WHIRLING_DRAGON_PUNCH_AOE_SPELL.name,
          damage,
          t === 0 && tickIdx === 0 ? 1 : 0,
          aoeHit.isCrit,
        );
      }
    }

    const result: ActionResult = {
      damage: 0,
      isCrit: singletargetHit.isCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };

    // knowledge_of_the_broken_temple: +effectN(1) teachings_of_the_monastery stacks (cap at maxStacks)
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

    // revolving_whirl: 33% chance to proc dance_of_chi_ji
    if (this.p.hasTalent('revolving_whirl') && rollChance(rng, REVOLVING_WHIRL_SPELL.effectN(1).base_value())) {
      const stacksBefore = this.p.getBuffStacks('dance_of_chi_ji');
      const stacksAfter = Math.min(2, Math.max(1, stacksBefore + 1));
      this.p.applyBuff('dance_of_chi_ji', 15, stacksAfter);
      if (stacksBefore > 0) {
        result.newEvents.push({
          type: EventType.BUFF_STACK_CHANGE,
          time: this.p.currentTime,
          buffId: 'dance_of_chi_ji',
          stacks: stacksAfter,
          prevStacks: stacksBefore,
        });
      } else {
        result.newEvents.push({ type: EventType.BUFF_APPLY, time: this.p.currentTime, buffId: 'dance_of_chi_ji' });
      }
    }

    // thunderfist: effectN(1) stacks on primary target + 1 per additional enemy (capped by buff max stacks).
    // SimC: WDP first-hit grants base_value stacks + extras (execute(bool first) where first==true).
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

    return result;
  }
}
