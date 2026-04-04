// src/core/class_modules/monk/actions/spinning_crane_kick.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import type { ActionResult } from '../../../engine/action';
import type { SimEventQueue, DamageSnapshot } from '../../../engine/eventQueue';
import type { RngInstance } from '../../../engine/rng';
import type { IGameState } from '../../../engine/i_game_state';
import { EventType } from '../../../engine/eventQueue';
import type { GameState } from '../../../engine/gameState';
import { FlurryStrikeSource, triggerFlurryStrikes } from '../flurry_strikes';
import { calculateDamage } from '../../../engine/damage';
import { CHI_EXPLOSION_SPELL } from '../monk_proc_spells';
import type { SpellDef } from '../../../data/spells';

import {
  SCK_WW_SPEC_MULTIPLIER,
  COMBO_BREAKER_MAX_STACKS,
  COMBO_BREAKER_DURATION_SECONDS,
} from '../monk_derived_values';

const FAST_FEET_SPELL = requireMonkSpellData(388809);

const CAST_DURING_SCK_SPELLS = new Set([
  // SimC source of truth (midnight branch, sc_monk.cpp): WW actions with
  // cast_during_sck=true that this trainer models directly.
  'tiger_palm',
  'blackout_kick',
  'blackout_kick_free',
  'rising_sun_kick',
  'spinning_crane_kick',
  'whirling_dragon_punch',
  'strike_of_the_windlord',
  'touch_of_death',
  'touch_of_karma',
  'invoke_xuen_the_white_tiger',
]);

export class SpinningCraneKickAction extends MonkMeleeAction {
  readonly name = 'spinning_crane_kick';
  readonly spellData = requireMonkSpellData(101546);

  // AOE: hits all enemies, sqrt reduction beyond 5 targets, only primary gets full damage
  override readonly aoe = -1;
  override readonly reducedAoeTargets = 5;
  override readonly fullAmountTargets = 1;

  override canBeInterruptedByCastAttempt(nextSpell: SpellDef): boolean {
    void nextSpell;
    return false;
  }

  override canCastWhileChannelingWithoutInterrupt(nextSpell: SpellDef): boolean {
    return CAST_DURING_SCK_SPELLS.has(nextSpell.name);
  }

  /**
   * SimC: spinning_crane_kick_t::tick_t sets ap_type = attack_power_type::WEAPON_BOTH (sc_monk.cpp:1398).
   * The snapshot captures this AP at cast time; ticks use the snapshot via calculateDamageFromSnapshot.
   */
  protected override effectiveAttackPower(): number {
    return this.p.getWeaponBothAttackPower?.() ?? this.p.getAttackPower();
  }

  /**
   * WW spec aura (id=137025) effect #18: +1647% to SCK (107270) → ×SCK_WW_SPEC_MULTIPLIER.
   * Stacks with the inherited WW base 0.9× from MonkMeleeAction.
   * Fast Feet (388809 effectN(2)): +10% to SCK when talent is selected.
   */
  override composite_da_multiplier(): number {
    let m = super.composite_da_multiplier() * SCK_WW_SPEC_MULTIPLIER;
    if (this.p.hasTalent('fast_feet')) m *= 1 + FAST_FEET_SPELL.effectN(2).percent();
    return m;
  }

  /**
   * Effective chi cost: 0 when Dance of Chi-Ji is active (cost waiver only —
   * no damage bonus). 2 otherwise.
   *
   * Source: Dance id=286587 effect #3 = flat −2 modifier on SCK chi cost.
   * This overrides Action.chiCost() so the executor uses this value instead
   * of reading the SpellDef's chiCost: 2 directly (matching SimC's cost() override).
   */
  override chiCost(): number {
    return this.p.isBuffActive('dance_of_chi_ji') ? 0 : 2;
  }

  override channelTickOffsets(channelDuration: number, channelTicks: number): number[] {
    if (channelTicks <= 0) {
      return [];
    }
    if (channelTicks === 1) {
      return [0];
    }

    const interval = channelDuration / (channelTicks - 1);
    return Array.from({ length: channelTicks }, (_, index) => interval * index);
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    this.comboStrikesTrigger(isComboStrike);

    const newEvents: ActionResult['newEvents'] = [];

    // Consume Dance of Chi-Ji buff on cast (the cost waiver was handled by chiCost()).
    const danceStacksBefore = this.p.getBuffStacks('dance_of_chi_ji');
    const danceWasActive = danceStacksBefore > 0;
    if (danceWasActive) {
      this.p.removeBuffStack('dance_of_chi_ji');
      const danceStacksAfter = Math.max(0, danceStacksBefore - 1);
      if (danceStacksAfter > 0) {
        newEvents.push({
          type: EventType.BUFF_STACK_CHANGE,
          time: this.p.currentTime,
          buffId: 'dance_of_chi_ji',
          stacks: danceStacksAfter,
          prevStacks: danceStacksBefore,
        });
      } else {
        newEvents.push({
          type: EventType.BUFF_EXPIRE,
          time: this.p.currentTime,
          buffId: 'dance_of_chi_ji',
        });
      }
    }

    // Sequenced Strikes: guaranteed Combo Breaker stack when SCK consumes Dance proc.
    // DBC: spell 451515, effect 1152152, value 100.0 → 100% chance.
    if (danceWasActive && this.p.hasTalent('sequenced_strikes')) {
      const stacksBefore = this.p.getBuffStacks('combo_breaker');
      const stacksAfter = Math.min(COMBO_BREAKER_MAX_STACKS, stacksBefore + 1);
      this.p.applyBuff('combo_breaker', COMBO_BREAKER_DURATION_SECONDS, stacksAfter);
      newEvents.push(
        stacksBefore > 0
          ? { type: EventType.BUFF_STACK_CHANGE, time: this.p.currentTime,
              buffId: 'combo_breaker', stacks: stacksAfter, prevStacks: stacksBefore }
          : { type: EventType.BUFF_APPLY, time: this.p.currentTime,
              buffId: 'combo_breaker', stacks: stacksAfter },
      );
    }

    // Wisdom of the Wall: flurry strikes per SCK during Zenith
    newEvents.push(...this.triggerWisdomOfTheWall());

    // Jade Ignition: fire chi_explosion AoE proc on every SCK cast.
    // SimC: sc_monk.cpp:1516 — jade_ignition->execute() at SCK execute time.
    let chiExplosionDamage = 0;
    let chiExplosionCrit = false;
    if (this.p.hasTalent('jade_ignition')) {
      const chiExpResult = calculateDamage(CHI_EXPLOSION_SPELL, this.p, rng, isComboStrike);
      chiExplosionDamage = chiExpResult.finalDamage;
      chiExplosionCrit = chiExpResult.isCrit;
      this.p.addDamage(chiExplosionDamage);
      this.p.recordPendingSpellStat(CHI_EXPLOSION_SPELL.name, chiExplosionDamage, 1, chiExplosionCrit);
    }

    // Channeled: no direct damage at cast time — ticks handle SCK's own damage.
    return {
      damage: 0,
      isCrit: false,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  /**
   * Wisdom of the Wall: release 3 flurry strikes per SCK cast while Zenith
   * is active. Internal 1s ICD prevents multiple procs per rapid cast.
   * Moved from executor.ts — this is WW Shado-Pan-specific logic.
   */
  private triggerWisdomOfTheWall(): ActionResult['newEvents'] {
    if (!this.p.hasTalent('wisdom_of_the_wall')) return [];
    if (!this.p.isBuffActive('zenith')) return [];

    return triggerFlurryStrikes(this.p as GameState, FlurryStrikeSource.WISDOM_OF_THE_WALL);
  }

  override tick(
    state: IGameState,
    rng: RngInstance,
    snapshot: DamageSnapshot,
    _tickNum: number,
  ): ActionResult {
    const n = this.nTargets();
    let totalDamage = 0;
    let primaryIsCrit = false;

    for (let t = 0; t < n; t++) {
      const { damage: baseDmg, isCrit } = this.computeTickDamageFromSnapshot(snapshot, rng, t);
      let damage = baseDmg;
      if (t > 0) {
        damage *= this.aoeDamageMultiplier(t, n);
      }
      state.addDamage(damage, t);
      totalDamage += damage;
      if (t === 0) primaryIsCrit = isCrit;
    }

    return {
      damage: totalDamage,
      isCrit: primaryIsCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}
