// src/core/class_modules/monk/actions/celestial_conduit.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import type { ActionResult } from '../../../engine/action';
import type { SimEventQueue } from '../../../engine/eventQueue';
import { EventType } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import { calculateDamage } from '../../../engine/damage';
import { ZENITH_STOMP_SPELL } from '../monk_proc_spells';
import type { SpellDef } from '../../../data/spells';

const WEAPONS_OF_THE_WALL_SPELL = requireMonkSpellData(1262610);

export class CelestialConduitAction extends MonkMeleeAction {
  readonly name = 'zenith';
  readonly spellData = requireMonkSpellData(322101);

  override canBeInterruptedByCastAttempt(nextSpell: SpellDef): boolean {
    return nextSpell.name !== this.name;
  }

  /**
   * SimC: celestial_conduit_t::tick_action_t has may_combo_strike = true
   * (sc_monk.cpp:3582).
   */
  override mayComboStrike(): boolean {
    return true;
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    const result = super.execute(queue, rng, isComboStrike);

    // Zenith Stomp: bonus direct damage on cast.
    // SimC execution order (zenith_t::execute):
    //   1. monk_spell_t::execute()
    //   2. zenith_stomp->execute_on_target(target)
    //   3. p()->buff.zenith->trigger()  ← zenith buff AFTER stomp
    //   4. p()->buff.stand_ready->trigger()
    //
    // The stomp fires BEFORE the new zenith buff is applied, so it only
    // benefits from PREVIOUS zenith stacks (weapon_of_wind +10%/stack).
    // The TEB crit bonus is consumed inside buff.zenith->trigger(), so the
    // stomp does NOT get TEB crit from the current cast.
    // Zenith Stomp: aoe = -1, reduced_aoe_targets = 5 (SimC: zenith_stomp_t)
    const ZENITH_STOMP_REDUCED_AOE_TARGETS = 5;
    const n = this.p.activeEnemies;
    for (let t = 0; t < n; t++) {
      const stompResult = calculateDamage(ZENITH_STOMP_SPELL, this.p, rng, false);
      let stompDamage = stompResult.finalDamage;
      if (this.p.hasTalent('weapons_of_the_wall')) {
        stompDamage *= 1 + WEAPONS_OF_THE_WALL_SPELL.effectN(1).percent();
      }
      // AOE reduction for secondary targets
      if (t > 0 && n > ZENITH_STOMP_REDUCED_AOE_TARGETS) {
        stompDamage *= Math.sqrt(ZENITH_STOMP_REDUCED_AOE_TARGETS / Math.min(20, n));
      }
      this.p.addDamage(stompDamage, t);
      this.p.recordPendingSpellStat(ZENITH_STOMP_SPELL.name, stompDamage, t === 0 ? 1 : 0, stompResult.isCrit);
    }

    // Zenith buff: 15s base, extended to 20s by Drinking Horn Cover (spell 391370).
    // Applied AFTER zenith_stomp to match SimC execution order.
    const zenithDuration = this.p.hasTalent('drinking_horn_cover') ? 20 : 15;
    this.p.applyBuff('zenith', zenithDuration);

    // Rank 1: consume all tigereye_brew_1 stacks → +2% crit per stack during this Zenith.
    // (SimC: zenith_t::trigger consumes stack_value and passes it as the crit pct bonus.)
    if (this.p.hasTalent('tigereye_brew')) {
      const tebStacks = this.p.getBuffStacks('tigereye_brew_1');
      if (tebStacks > 0) {
        this.p.expireBuff('tigereye_brew_1');
        this.p.applyBuff('zenith_teb_crit', zenithDuration, tebStacks);
      }
    }

    // Stand Ready: 10 stacks for 30s
    if (this.p.hasTalent('stand_ready')) {
      this.p.applyBuff('stand_ready', 30, 10);
      result.buffsApplied.push({ id: 'stand_ready', duration: 30, stacks: 10 });
    }

    // Dance of Chi-Ji is NOT triggered by Zenith in SimC.
    // DoCJ procs from chi spending (via RPPM in onChiSpent) and from
    // revolving_whirl in WDP/SotWL (via increment, bypassing RPPM).

    result.newEvents.push({ type: EventType.BUFF_APPLY, time: this.p.currentTime, buffId: 'zenith' });
    result.newEvents.push({ type: EventType.BUFF_EXPIRE, time: this.p.currentTime + zenithDuration, buffId: 'zenith' });

    return result;
  }
}
