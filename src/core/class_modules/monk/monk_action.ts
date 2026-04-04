// src/core/class_modules/monk/monk_action.ts
import { Action } from '../../engine/action';
import { attemptProc } from '../../engine/rppm';
import type { GameState } from '../../engine/gameState';
import type { SimEventQueue, DamageSnapshot } from '../../engine/eventQueue';
import type { RngInstance } from '../../engine/rng';
import { rollRange, rollChance } from '../../engine/rng';
import { EventType } from '../../engine/eventQueue';
import type { ActionResult } from '../../engine/action';
import { FlurryStrikeSource, triggerFlurryStrikes } from './flurry_strikes';
import {
  getChiProficiencyMagicDamageMultiplier,
  getDanceOfChiJiRppm,
  getMartialInstinctsPhysicalDamageMultiplier,
  getWindwalkerBaselineDirectMultiplier,
} from './monk_runtime';
import { requireMonkSpellData } from '../../dbc/monk_spell_data';
import { getMonkHitComboStacks, setMonkHitComboStacks } from './monk_state_keys';

const WEAPON_OF_WIND_SPELL = requireMonkSpellData(1272678);
const FEROCITY_OF_XUEN_SPELL = requireMonkSpellData(388674);
const HIT_COMBO_BUFF_SPELL = requireMonkSpellData(196741);

const COMBO_STRIKES_AURA_SECONDS = 3600;

function normalizeComboSpellId(spellId: string): string {
  return spellId === 'blackout_kick_free' ? 'blackout_kick' : spellId;
}

// ---------------------------------------------------------------------------
// DUAL-PATH INVARIANT — weapon_of_wind and ferocity_of_xuen
//
// These two bonuses appear in TWO places:
//   A) MonkAction.composite_da_multiplier() — used by actions that call
//      super.execute() → Action.calculateDamage() (most melee actions).
//   B) initializeMonkRuntimeState getActionMultiplier hook — used by
//      the free calculateDamage() function (damage.ts), which handles
//      proc spells (GotD, thunderfist, jadefire_stomp, WDP children) and
//      channel-tick snapshots (FoF, SCK).
//
// These paths are MUTUALLY EXCLUSIVE.  An action that computes damage
// through the Action method chain (path A) never calls the free function
// for its primary hit, so path B is not reached.  Proc/channel spells
// call the free function exclusively and never reach composite_da_multiplier().
//
// INVARIANT: any new action must use exactly one path for its primary hit.
// Mixing them would double-apply weapon_of_wind and ferocity_of_xuen.
// ---------------------------------------------------------------------------
export abstract class MonkAction extends Action {
  override composite_da_multiplier(): number {
    let mult = super.composite_da_multiplier();
    if (this.p.hasTalent('weapon_of_wind') && this.p.isBuffActive('zenith')) {
      mult *= 1 + WEAPON_OF_WIND_SPELL.effectN(1).percent();
    }
    // Ferocity of Xuen (rank 2): +4% all damage done (DBC 388674 effectN(1) = 2 per rank).
    if (this.p.hasTalent('ferocity_of_xuen')) {
      const rank = this.p.getTalentRank?.('ferocity_of_xuen') ?? 2;
      mult *= 1 + FEROCITY_OF_XUEN_SPELL.effectN(1).percent() * rank;
    }
    return mult;
  }

  protected shouldTriggerStandReady(): boolean {
    return this.name !== 'zenith';
  }

  override afterExecute(queue: SimEventQueue, rng: RngInstance): void {
    void rng;

    if (!this.shouldTriggerStandReady() || !this.p.isBuffActive('stand_ready')) {
      return;
    }

    for (const event of triggerFlurryStrikes(this.p as GameState, FlurryStrikeSource.STAND_READY)) {
      queue.push(event);
    }
  }
}

export abstract class MonkMeleeAction extends MonkAction {
  protected actionIsPhysical(): boolean {
    return true;
  }

  /**
   * Whether this action participates in combo-strike tracking.
   * Mirrors SimC's may_combo_strike flag.  Subclasses that do NOT participate
   * (e.g. auto-attack, expel_harm heal) override to return false.
   */
  override mayComboStrike(): boolean {
    return true;
  }

  /** WW baseline direct-damage modifier from Windwalker passive spell data. */
  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * getWindwalkerBaselineDirectMultiplier()
      * (this.actionIsPhysical()
        ? getMartialInstinctsPhysicalDamageMultiplier(this.p)
        : getChiProficiencyMagicDamageMultiplier(this.p));
  }

  /**
   * Compute tick damage from a channel snapshot, rolling crit against the
   * **live** state rather than the snapshot's captured critChance.
   *
   * SimC channel ticks call composite_crit_chance() dynamically per tick
   * (action.cpp: impact() always re-reads crit from the current stats object).
   * Using snapshot crit would diverge for effects that update crit mid-channel
   * (e.g. Tigereye Brew stacks on FoF).
   */
  protected computeTickDamageFromSnapshot(
    snapshot: DamageSnapshot,
    rng: RngInstance,
    targetIndex?: number,
  ): { damage: number; isCrit: boolean } {
    const base = snapshot.baseDmgMin === snapshot.baseDmgMax
      ? snapshot.baseDmgMin
      : rollRange(rng, snapshot.baseDmgMin, snapshot.baseDmgMax);
    const baseDamage = base + snapshot.apCoefficient * snapshot.attackPower;
    // When targetIndex is supplied, recompute the target multiplier live so that
    // target-specific debuffs (e.g. Hunter's Mark on target 0) are not incorrectly
    // applied to secondary targets.
    const targetMult = targetIndex !== undefined
      ? this.composite_target_multiplier(targetIndex)
      : snapshot.targetMultiplier;
    const combined = snapshot.actionMultiplier
      * snapshot.playerMultiplier
      * snapshot.masteryMultiplier
      * snapshot.hitComboMultiplier
      * snapshot.versatilityMultiplier
      * targetMult;
    const isCrit = rollChance(rng, this.composite_crit_chance() * 100);
    return { damage: baseDamage * combined * (isCrit ? this.critDamageMultiplier() : 1.0), isCrit };
  }

  /**
   * Player multiplier: mastery (Combo Strikes) + hit_combo, stacked on top of
   * the base versatility from `super.composite_player_multiplier()`.
   * Mastery applies only on combo strikes (isComboStrike = true).
   * Hit Combo: +1% per stack while the talent is selected.
   */
  override composite_player_multiplier(isComboStrike: boolean): number {
    const mastery = isComboStrike ? this.p.getMasteryPercent() / 100 : 0;

    const hitComboBonus = this.p.hasTalent('hit_combo')
      ? getMonkHitComboStacks(this.p) * HIT_COMBO_BUFF_SPELL.effectN(1).percent()
      : 0;

    const masteryMultiplier = 1 + mastery;
    const hitComboMultiplier = 1 + hitComboBonus;

    // super() returns (1 + vers); mastery and hit combo are multiplicative layers.
    return super.composite_player_multiplier(isComboStrike) * masteryMultiplier * hitComboMultiplier;
  }

  protected override snapshotMasteryMultiplier(isComboStrike: boolean): number {
    return isComboStrike ? 1 + this.p.getMasteryPercent() / 100 : 1.0;
  }

  protected override snapshotHitComboMultiplier(): number {
    if (!this.p.hasTalent('hit_combo')) {
      return 1.0;
    }

    return 1 + getMonkHitComboStacks(this.p) * HIT_COMBO_BUFF_SPELL.effectN(1).percent();
  }

  protected comboStrikesTrigger(isComboStrike: boolean): void {
    if (isComboStrike) {
      this.p.applyBuff('combo_strikes', COMBO_STRIKES_AURA_SECONDS, 1);
      this.p.lastComboStrikeAbility = normalizeComboSpellId(this.name);
      if (this.p.hasTalent('hit_combo')) {
        const newStacks = Math.min(5, getMonkHitComboStacks(this.p) + 1);
        setMonkHitComboStacks(this.p, newStacks);
        this.p.applyBuff('hit_combo', 30, newStacks);
      }
      return;
    }

    this.p.expireBuff('combo_strikes');
    this.p.lastComboStrikeAbility = null;
    if (this.p.hasTalent('hit_combo')) {
      setMonkHitComboStacks(this.p, 0);
      this.p.expireBuff('hit_combo');
    }
  }

  override execute(
    queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    if (this.mayComboStrike()) {
      this.comboStrikesTrigger(isComboStrike);
    }
    return super.execute(queue, rng, isComboStrike);
  }

  override onChiSpent(_chiCost: number, rng: RngInstance, queue: SimEventQueue): void {
    if (!this.p.hasTalent('dance_of_chi_ji')) return;
    const gs = this.p as unknown as GameState;
    const tracker = getDanceOfChiJiRppm(gs);
    if (attemptProc(tracker, gs.currentTime, gs.getHastePercent(), rng)) {
      const stacksBefore = gs.getBuffStacks('dance_of_chi_ji');
      const stacksAfter = Math.min(2, Math.max(1, stacksBefore + 1));
      gs.applyBuff('dance_of_chi_ji', 15, stacksAfter);
      if (stacksBefore > 0) {
        queue.push({
          type: EventType.BUFF_STACK_CHANGE,
          time: gs.currentTime,
          buffId: 'dance_of_chi_ji',
          stacks: stacksAfter,
          prevStacks: stacksBefore,
        });
      } else {
        queue.push({ type: EventType.BUFF_APPLY, time: gs.currentTime, buffId: 'dance_of_chi_ji' });
      }
    }
  }
}
