// src/core/class_modules/monk/actions/tiger_palm.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import type { ActionResult } from '../../../engine/action';
import type { SimEventQueue } from '../../../engine/eventQueue';
import { EventType } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { rollChance } from '../../../engine/rng';
import type { GameState } from '../../../engine/gameState';
import { COMBAT_WISDOM_EXPEL_HARM_SPELL, calculateCombatWisdomExpelHarmDamage } from '../monk_proc_spells';
import {
  COMBO_BREAKER_MAX_STACKS,
  COMBO_BREAKER_DURATION_SECONDS,
  TEACHINGS_OF_THE_MONASTERY_BASE_MAX_STACKS,
  TEACHINGS_OF_THE_MONASTERY_DURATION_SECONDS,
} from '../monk_derived_values';

const COMBO_BREAKER_SPELL = requireMonkSpellData(137384);
const MEMORY_OF_THE_MONASTERY_SPELL = requireMonkSpellData(454969);
const TOUCH_OF_THE_TIGER_SPELL = requireMonkSpellData(388856);
const EFFICIENT_TRAINING_SPELL = requireMonkSpellData(450989);
const KNOWLEDGE_OF_THE_BROKEN_TEMPLE_SPELL = requireMonkSpellData(451529);

export class TigerPalmAction extends MonkMeleeAction {
  readonly name = 'tiger_palm';
  readonly spellData = requireMonkSpellData(100780);

  /**
   * Tiger Palm da_multiplier chain:
   * - WW base 0.9× (from MonkMeleeAction)
   * - Memory of the Monastery (spell 454969 effect 1250509): +30%
   * - Touch of the Tiger (spell 388856 effect #1): +50%
   * - Efficient Training (spell 450989 effect #1): base +20%,
   *   further modified by Windwalker Monk (1258122) effect #16: +20% flat →
   *   total +40% for WW.
   */
  override composite_da_multiplier(): number {
    let m = super.composite_da_multiplier();
    if (this.p.hasTalent('memory_of_the_monastery')) m *= 1 + MEMORY_OF_THE_MONASTERY_SPELL.effectN(2).percent();
    if (this.p.hasTalent('touch_of_the_tiger')) m *= 1 + TOUCH_OF_THE_TIGER_SPELL.effectN(1).percent();
    if (this.p.hasTalent('efficient_training')) m *= 1 + EFFICIENT_TRAINING_SPELL.effectN(1).percent() * 2;
    return m;
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const result = super.execute(queue, rng, isComboStrike);

    // --- Combo Breaker: proc chance (spell 454969 effect 1157993: 8% → 14% with memory_of_the_monastery) ---
    const baseBkProcChance = COMBO_BREAKER_SPELL.effectN(1).base_value();
    const bkProcChance = this.p.hasTalent('memory_of_the_monastery')
      ? baseBkProcChance * (1 + MEMORY_OF_THE_MONASTERY_SPELL.effectN(1).percent())
      : baseBkProcChance;
    if (this.p.hasTalent('combo_breaker') && rollChance(rng, bkProcChance)) {
      const stacksBefore = this.p.getBuffStacks('combo_breaker');
      const stacksAfter = Math.min(COMBO_BREAKER_MAX_STACKS, Math.max(1, stacksBefore + 1));
      this.p.applyBuff('combo_breaker', COMBO_BREAKER_DURATION_SECONDS, stacksAfter);
      result.newEvents.push(
        stacksBefore > 0
          ? {
              type: EventType.BUFF_STACK_CHANGE,
              time: this.p.currentTime,
              buffId: 'combo_breaker',
              stacks: stacksAfter,
              prevStacks: stacksBefore,
            }
          : {
              type: EventType.BUFF_APPLY,
              time: this.p.currentTime,
              buffId: 'combo_breaker',
              stacks: stacksAfter,
            },
      );
    }

    // --- Teachings of the Monastery: +1 stack (silent — no event emitted) ---
    if (this.p.hasTalent('teachings_of_the_monastery')) {
      const bonusMaxStacks = this.p.hasTalent('knowledge_of_the_broken_temple')
        ? KNOWLEDGE_OF_THE_BROKEN_TEMPLE_SPELL.effectN(1).base_value()
        : 0;
      const maxStacks = TEACHINGS_OF_THE_MONASTERY_BASE_MAX_STACKS + bonusMaxStacks;
      const stacks = Math.min(
        maxStacks,
        this.p.getBuffStacks('teachings_of_the_monastery') + 1,
      );
      this.p.applyBuff('teachings_of_the_monastery', TEACHINGS_OF_THE_MONASTERY_DURATION_SECONDS, stacks);
    }

    // --- Combat Wisdom: Tiger Palm consumes the ready buff and fires Expel Harm ---
    if (this.p.hasTalent('combat_wisdom') && this.p.isBuffActive('combat_wisdom')) {
      const cwDamage = calculateCombatWisdomExpelHarmDamage(this.p as GameState, rng);
      this.p.addDamage(cwDamage);
      this.p.recordPendingSpellStat(COMBAT_WISDOM_EXPEL_HARM_SPELL.name, cwDamage, 1);
      this.p.expireBuff('combat_wisdom');
      result.newEvents.push({
        type: EventType.BUFF_EXPIRE,
        time: this.p.currentTime,
        buffId: 'combat_wisdom',
      });
    }

    return result;
  }
}
