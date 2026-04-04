// src/core/class_modules/monk/actions/fists_of_fury.ts
import { MonkMeleeAction } from '../monk_action';
import { requireMonkSpellData } from '../../../dbc/monk_spell_data';
import type { ActionResult } from '../../../engine/action';
import { EventType } from '../../../engine/eventQueue';
import type { SimEventQueue, DamageSnapshot } from '../../../engine/eventQueue';
import { rollChance } from '../../../engine/rng';
import type { RngInstance } from '../../../engine/rng';
import { calculateDamage } from '../../../engine/damage';
import type { IGameState } from '../../../engine/i_game_state';
import type { GameState } from '../../../engine/gameState';
import { JADEFIRE_STOMP_SPELL } from '../monk_proc_spells';
import { FlurryStrikeSource, triggerFlurryStrikes } from '../flurry_strikes';
import { getWindwalkerBaselineDirectMultiplier, getWindwalkerBaselinePeriodicMultiplier } from '../monk_runtime';
import type { SpellDef } from '../../../data/spells';

const ONE_VERSUS_MANY_SPELL = requireMonkSpellData(450988);

const MOMENTUM_BOOST_BUFF_SPELL = requireMonkSpellData(451297);
const TIGEREYE_BREW_FOF_BUFF_SPELL = requireMonkSpellData(1262042);

export class FistsOfFuryAction extends MonkMeleeAction {
  readonly name = 'fists_of_fury';
  readonly spellData = requireMonkSpellData(113656);

  // AOE: hits all enemies, sqrt reduction beyond 5 targets, only primary gets full damage
  override readonly aoe = -1;
  override readonly reducedAoeTargets = 5;
  override readonly fullAmountTargets = 1;

  /** Secondary targets receive 54% damage (effectN(6).percent()). */
  override compositeAoeMultiplier(_chainTarget: number, _nTargets: number): number {
    return 0.54;
  }

  override canBeInterruptedByCastAttempt(nextSpell: SpellDef): boolean {
    void nextSpell;
    return true;
  }

  override onCastInterrupted(
    queue: SimEventQueue,
    rng: RngInstance,
  ): ActionResult {
    return this.last_tick(this.p, queue, rng);
  }

  override channelDuration(baseDuration: number, hastePercent: number): number {
    const duration = this.p.hasTalent('crashing_fists') ? baseDuration + 1 : baseDuration;
    return duration / (1 + hastePercent / 100);
  }

  override channelTicks(baseTicks: number): number {
    return this.p.hasTalent('crashing_fists') ? baseTicks + 1 : baseTicks;
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

  /**
   * FoF talent modifiers on top of WW 0.9× base.
   *
   * SimC parsed passives on fists_of_fury_damage (117418):
   *   - Windwalker Monk (137025) eff#1: -10% direct → ×0.9
   *   - One Versus Many (450988) eff#2: +50% direct → ×1.5 (permanent, not per-stack)
   *
   * Harmonic Combo (1250041) does NOT modify FoF_damage in SimC.
   * Its effectN(2) = -10% targets the base FoF spell (113656), not the
   * damage sub-spell (117418), so parse_effects never picks it up.
   * Harmonic Combo only reduces chi cost (-1 via effectN(1)).
   */
  override composite_da_multiplier(): number {
    let m = super.composite_da_multiplier();
    m *= getWindwalkerBaselinePeriodicMultiplier() / getWindwalkerBaselineDirectMultiplier();
    if (this.p.hasTalent('one_versus_many')) m *= 1 + ONE_VERSUS_MANY_SPELL.effectN(2).percent();
    // Crashing Fists adds +1 tick and +1s duration (handled by channelTicks/channelDuration).
    // SimC does not apply a per-tick damage multiplier; the extra damage comes from the extra tick.
    return m;
  }

  /**
   * Chi cost: 3, reduced to 2 by Harmonic Combo.
   * Executor applies Zenith -1 on top.
   */
  override chiCost(): number {
    return this.p.hasTalent('harmonic_combo') ? 2 : 3;
  }

  override execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
  ): ActionResult {
    void rng;

    this.comboStrikesTrigger(isComboStrike);

    const newEvents: ActionResult['newEvents'] = triggerFlurryStrikes(
      this.p as GameState,
      FlurryStrikeSource.FLURRY_STRIKES,
    );

    // Trigger WDP buff after FoF starts
    if (this.p.hasTalent('whirling_dragon_punch')) {
      const hastePercent = this.p.getHastePercent();
      const remains = Math.min(
        this.p.getCooldownRemains('rising_sun_kick'),
        this.p.getCooldownRemains('fists_of_fury'),
      );
      if (remains > 0) {
        const graceWindow = Math.max(0.75, 1.5 / (1 + hastePercent / 100));
        this.p.applyBuff('whirling_dragon_punch', remains + graceWindow);
        newEvents.push({
          type: EventType.BUFF_APPLY,
          time: this.p.currentTime,
          buffId: 'whirling_dragon_punch',
        });
      }
    }

    // Channeled spells deal no damage at cast time; ticks handle damage.
    return {
      damage: 0,
      isCrit: false,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
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

    const hasMomentumBoost = state.hasTalent('momentum_boost');
    const hasTigereyeBrew = state.hasTalent('tigereye_brew');

    // Read stacks ONCE before the target loop. In SimC, composite_da_multiplier()
    // is evaluated during snapshot_internal() for ALL targets before any impact()
    // fires (sc_monk.cpp execute flow: snapshot all → calculate all → impact all).
    // This means all targets in a tick see the same momentum/tigereye stacks.
    const momentumStacks = hasMomentumBoost ? state.getBuffStacks('momentum_boost_damage') : 0;
    const tigereyeStacks = hasTigereyeBrew ? state.getBuffStacks('tigereye_brew_3') : 0;

    // Phase 1: Calculate and record damage for all targets (snapshot phase)
    for (let t = 0; t < n; t++) {
      const { damage: baseTick, isCrit } = this.computeTickDamageFromSnapshot(snapshot, rng, t);
      let damage = baseTick;

      if (hasMomentumBoost) {
        damage *= 1 + state.getHastePercent() / 100;
        if (momentumStacks > 0) {
          damage *= 1 + momentumStacks * MOMENTUM_BOOST_BUFF_SPELL.effectN(1).percent();
        }
      }

      if (hasTigereyeBrew && tigereyeStacks > 0) {
        damage *= 1 + tigereyeStacks * TIGEREYE_BREW_FOF_BUFF_SPELL.effectN(1).percent();
      }

      if (t > 0) {
        damage *= this.aoeDamageMultiplier(t, n);
      }

      state.addDamage(damage, t);
      totalDamage += damage;
      if (t === 0) primaryIsCrit = isCrit;
    }

    // Phase 2: Trigger per-impact buffs AFTER all targets are processed.
    // Each impact increments stacks; N targets = N increments per tick.
    if (hasMomentumBoost) {
      state.applyBuff('momentum_boost_damage', 10, Math.min(10, momentumStacks + n));
    }
    if (hasTigereyeBrew) {
      let newTigereyeStacks = tigereyeStacks;
      for (let t = 0; t < n; t++) {
        if (rollChance(rng, this.composite_crit_chance() * 100)) {
          newTigereyeStacks = Math.min(10, newTigereyeStacks + 1);
        }
      }
      if (newTigereyeStacks > tigereyeStacks) {
        state.applyBuff('tigereye_brew_3', 10, newTigereyeStacks);
      }
    }

    return {
      damage: totalDamage,
      isCrit: primaryIsCrit,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  override last_tick(
    state: IGameState,
    _queue: SimEventQueue,
    rng: RngInstance,
  ): ActionResult {
    const newEvents: ActionResult['newEvents'] = [];
    let damage = 0;

    // Jadefire Stomp bonus damage at end of channel.
    // calculateDamage accepts IGameState; no cast needed.
    if (state.hasTalent('jadefire_stomp')) {
      const stomp = calculateDamage(JADEFIRE_STOMP_SPELL, state, rng, true);
      const sfj = state.hasTalent('singularly_focused_jade') ? 4.0 : 1.0;
      const stompDamage = stomp.finalDamage * sfj;
      state.addDamage(stompDamage);
      state.recordPendingSpellStat(JADEFIRE_STOMP_SPELL.name, stompDamage, 1, stomp.isCrit);
      damage += stompDamage;
    }

    // Expire intra-channel damage-scaling buffs (SimC: sc_monk.cpp last_tick ~1649-1652).
    state.expireBuff('momentum_boost_damage');
    state.expireBuff('tigereye_brew_3');

    // Pressure Point is a separate monk-class talent. Do not grant it from
    // Xuen's Battlegear alone.
    if (state.hasTalent('pressure_points')) {
      state.applyBuff('pressure_point', 5);
    }

    // Momentum Boost buffs are only granted when the talent is selected.
    if (state.hasTalent('momentum_boost')) {
      state.applyBuff('momentum_boost', 10);
      state.applyBuff('momentum_boost_speed', 8);

      newEvents.push({
        type: EventType.BUFF_APPLY,
        time: state.currentTime,
        buffId: 'momentum_boost',
      });

      newEvents.push({
        type: EventType.BUFF_APPLY,
        time: state.currentTime,
        buffId: 'momentum_boost_speed',
      });

      newEvents.push({
        type: EventType.BUFF_EXPIRE,
        time: state.currentTime + 10,
        buffId: 'momentum_boost',
      });

      newEvents.push({
        type: EventType.BUFF_EXPIRE,
        time: state.currentTime + 8,
        buffId: 'momentum_boost_speed',
      });
    }

    return {
      damage,
      isCrit: false,
      newEvents,
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }
}
