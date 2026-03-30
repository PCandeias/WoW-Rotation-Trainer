// src/core/class_modules/monk/monk_module.ts
import type { ClassModule } from '../class_module';
import type { IGameState } from '../../engine/i_game_state';
import type { Action } from '../../engine/action';
import type { GameState } from '../../engine/gameState';
import type { SimEventQueue } from '../../engine/eventQueue';
import { EventType } from '../../engine/eventQueue';
import type { RngInstance } from '../../engine/rng';
import { rollChance, rollRange } from '../../engine/rng';
import { computePhysicalArmorMultiplier } from '../../engine/armor';
import { currentSwingInterval } from '../../engine/autoAttack';
import { calculateDamage } from '../../engine/damage';
import { getSharedTargetDebuffMultiplier } from '../../shared/player_effects';
import { requireMonkSpellData } from '../../dbc/monk_spell_data';
import { DUAL_THREAT_SPELL, THUNDERFIST_SPELL } from './monk_proc_spells';
import {
  addMonkFlurryCharges,
  getFerocityOfXuenMultiplier,
  getMartialInstinctsPhysicalDamageMultiplier,
  getMonkTalents,
  initializeMonkRuntimeState,
} from './monk_runtime';
import { TigerPalmAction } from './actions/tiger_palm';
import { BlackoutKickAction } from './actions/blackout_kick';
import { RisingSunKickAction } from './actions/rising_sun_kick';
import { RushingWindKickAction } from './actions/rushing_wind_kick';
import { FistsOfFuryAction } from './actions/fists_of_fury';
import { WhirlingDragonPunchAction } from './actions/whirling_dragon_punch';
import { StrikeOfTheWindlordAction } from './actions/strike_of_the_windlord';
import { CelestialConduitAction } from './actions/celestial_conduit';
import { SpinningCraneKickAction } from './actions/spinning_crane_kick';
import { SlicingWindsAction } from './actions/slicing_winds';
import { TouchOfDeathAction } from './actions/touch_of_death';
import { TouchOfKarmaAction } from './actions/touch_of_karma';

const WINDWALKER_PASSIVE_SPELL = requireMonkSpellData(137025);
const DUAL_THREAT_TALENT = requireMonkSpellData(451823);
const SKYFURY_SPELL = requireMonkSpellData(462854);
const TIGER_FANG_SPELL = requireMonkSpellData(1272781);
const DUAL_THREAT_PROC_CHANCE_PCT = DUAL_THREAT_TALENT.effectN(1).base_value();
const SKYFURY_PROC_CHANCE_PCT = SKYFURY_SPELL.proc_chance_pct();
const SKYFURY_ICD_SECONDS = SKYFURY_SPELL.internal_cooldown_ms() / 1000;
const WW_SPEC_AUTO_ATTACK_MULT = 1 + WINDWALKER_PASSIVE_SPELL.effectN(5).percent();
const SKYFURY_PROC_SPELL_IDS = {
  mainHand: 'skyfury_proc_mh',
  offHand: 'skyfury_proc_oh',
} as const;

function getFlurryChargesForHit(
  state: GameState,
  isCrit: boolean,
): number {
  if (!state.hasTalent('flurry_strikes')) {
    return 0;
  }

  const monkTalents = getMonkTalents(state)?.windwalker;
  const baseCharges = state.stats.offHandSpeed > 0
    ? monkTalents?.flurry_strikes.effectN(1).base_value() ?? 1
    : monkTalents?.flurry_strikes.effectN(2).base_value() ?? 2;

  if (!isCrit || !state.hasTalent('one_versus_many')) {
    return baseCharges;
  }

  const critMultiplier = 1 + (monkTalents?.one_versus_many.effectN(1).base_value() ?? 1);
  return baseCharges * critMultiplier;
}

export const monk_module: ClassModule = {
  className: 'monk',

  create_actions(state: IGameState): Map<string, Action> {
    const bk = new BlackoutKickAction(state);
    return new Map<string, Action>([
      ['tiger_palm',         new TigerPalmAction(state)],
      ['blackout_kick',      bk],
      ['blackout_kick_free', bk],  // same instance; cost=0 handled by executor pre-dispatch
      ['rising_sun_kick',    new RisingSunKickAction(state)],
      ['rushing_wind_kick',  new RushingWindKickAction(state)],
      ['fists_of_fury',            new FistsOfFuryAction(state)],
      ['whirling_dragon_punch',    new WhirlingDragonPunchAction(state)],
      ['strike_of_the_windlord',   new StrikeOfTheWindlordAction(state)],
      ['zenith',                   new CelestialConduitAction(state)],
      ['spinning_crane_kick',      new SpinningCraneKickAction(state)],
      ['slicing_winds',            new SlicingWindsAction(state)],
      ['touch_of_karma',           new TouchOfKarmaAction(state)],
      ['touch_of_death',           new TouchOfDeathAction(state)],
    ]);
  },

  init(state: GameState): void {
    initializeMonkRuntimeState(state);
    state.action_list = new Map([
      ...(state.action_list?.entries() ?? []),
      ...this.create_actions(state).entries(),
    ]);
  },

  combat_begin(state: GameState, queue: SimEventQueue): void {
    if (state.hasTalent('tigereye_brew')) {
      // Rank 1: start with 10 stacks (SimC: triggers with base_value at combat start)
      state.applyBuff('tigereye_brew_1', 120, 10);
      // Schedule first periodic tick (8s base, haste-scaled)
      const period = 8 / (1 + state.getHastePercent() / 100);
      queue.push({ type: EventType.TIGEREYE_BREW_TICK, time: state.currentTime + period });
    }

    if (state.hasTalent('combat_wisdom')) {
      state.chi = Math.min(state.chiMax, 2);
      state.applyBuff('combat_wisdom', state.encounterDuration);
      state.nextCombatWisdomAt = state.currentTime + 15;
      queue.push({ type: EventType.COMBAT_WISDOM_TICK, time: state.nextCombatWisdomAt });
    }
  },

  on_auto_attack(
    hand: 'mainHand' | 'offHand',
    state: IGameState,
    queue: SimEventQueue,
    rng: RngInstance,
  ): number {
    const gs = state as GameState;

    // Weapon stats
    const minDmg = hand === 'mainHand' ? gs.stats.mainHandMinDmg : gs.stats.offHandMinDmg;
    const maxDmg = hand === 'mainHand' ? gs.stats.mainHandMaxDmg : gs.stats.offHandMaxDmg;
    const weaponSpeed = hand === 'mainHand' ? gs.stats.mainHandSpeed : gs.stats.offHandSpeed;

    // -----------------------------------------------------------------------
    // Auto-attack avoidance and crit table (SimC one-roll attack table)
    //
    // Source:
    // - engine/action/attack.cpp (miss_chance, dodge_chance, calculate_result)
    // - engine/class_modules/monk/sc_monk.cpp (melee_t: base_hit -= 0.19 for DW)
    //
    // miss   = 3% base + level_delta*1.5% + DW penalty (19%) - hit
    // dodge  = 3% base + level_delta*1.5% - expertise
    // parry  = 0 from behind (SimC: only when POSITION_FRONT)
    // glance = 0 at delta <= 3 for this profile
    //
    // We match SimC's one-roll resolution order: MISS -> DODGE -> CRIT -> HIT.
    // -----------------------------------------------------------------------
    const levelDelta = state.targetLevel - state.characterLevel;
    const BASE_AVOIDANCE_PCT = 3.0;
    const LEVEL_PENALTY_PER_LEVEL = 1.5;
    // SimC: dual-wield auto-attacks suffer an additional 19% miss penalty (base_hit -= 0.19 in melee_t).
    const dwMissPenalty = gs.stats.offHandSpeed > 0 ? 19 : 0;
    const missChance = Math.max(
      0,
      BASE_AVOIDANCE_PCT + levelDelta * LEVEL_PENALTY_PER_LEVEL + dwMissPenalty - state.hitPercent,
    ) / 100;
    const dodgeChance = Math.max(
      0,
      BASE_AVOIDANCE_PCT + levelDelta * LEVEL_PENALTY_PER_LEVEL - state.expertisePercent,
    ) / 100;
    // Parry = 0 (position=back). Glancing = 0 (delta=3, SimC only glances at delta>3).
    const spellKey = `auto_attack_${hand === 'mainHand' ? 'mh' : 'oh'}`;
    // SimC: each hand's dual_threat_t has its own damage->allowed flag.
    const dtKey = hand === 'mainHand' ? 'dualThreatMhAllowed' : 'dualThreatOhAllowed' as const;

    // Tiger Fang: +15% auto-attack crit chance.
    let critChancePct = state.getCritPercent();
    if (state.hasTalent('tiger_fang')) critChancePct += TIGER_FANG_SPELL.effectN(1).base_value();
    const critChance = Math.max(0, Math.min(1, critChancePct / 100));

    // Schedule next swing helper (used on both hit and miss paths)
    const scheduleNextSwing = (): void => {
      const nextTime = state.currentTime + currentSwingInterval(hand, gs);
      if (hand === 'mainHand') {
        queue.push({ type: EventType.AUTO_ATTACK_MH, time: nextTime });
        state.mhSwingTimer = nextTime;
      } else {
        queue.push({ type: EventType.AUTO_ATTACK_OH, time: nextTime });
        state.ohSwingTimer = nextTime;
      }
    };

    const maybeTriggerSkyfury = (): number => {
      if (!state.isBuffActive('skyfury')) {
        return 0;
      }
      if (state.currentTime < gs.lastSkyfuryProcAt + SKYFURY_ICD_SECONDS) {
        return 0;
      }
      if (!rollChance(rng, SKYFURY_PROC_CHANCE_PCT)) {
        return 0;
      }

      gs.lastSkyfuryProcAt = state.currentTime;
      state.recordPendingSpellStat(SKYFURY_PROC_SPELL_IDS[hand], 0, 1);
      return resolveAutoAttack({ mayMiss: false, allowSkyfuryProc: false, scheduleSwing: false });
    };

    const resolveAutoAttack = (
      options: { mayMiss: boolean; allowSkyfuryProc: boolean; scheduleSwing: boolean },
    ): number => {
      let totalDamage = 0;

      let isCrit = false;
      if (options.mayMiss) {
        const roll = rng.next();
        if (roll < missChance) {
          state.recordPendingSpellStat(spellKey, 0, 1, false, 'miss');
          if (state.hasTalent('dual_threat')) {
            gs[dtKey] = true;
          }
          if (options.scheduleSwing) {
            scheduleNextSwing();
          }
          return totalDamage;
        }

        if (roll < missChance + dodgeChance) {
          state.recordPendingSpellStat(spellKey, 0, 1, false, 'dodge');
          if (state.hasTalent('dual_threat')) {
            gs[dtKey] = true;
          }
          if (options.scheduleSwing) {
            scheduleNextSwing();
          }
          return totalDamage;
        }

        const critWindow = Math.max(0, 1 - missChance - dodgeChance);
        const tableCritChance = Math.min(critChance, critWindow);
        isCrit = roll < missChance + dodgeChance + tableCritChance;
      } else {
        isCrit = rollChance(rng, critChancePct);
      }

      if (
        state.hasTalent('dual_threat')
        && gs[dtKey]
        && rollChance(rng, DUAL_THREAT_PROC_CHANCE_PCT)
      ) {
        // SimC: dual_threat_t::impact() — when DT procs it *replaces* the melee
        // hit entirely (TBase::impact is NOT called).  The parent melee swing
        // still counts in melee_main_hand / melee_off_hand stats (SimC records
        // execute count before impact), so we record a 0-damage entry for the
        // auto-attack and a separate entry for dual_threat.
        state.recordPendingSpellStat(spellKey, 0, 1, false);

        const isComboStrike = false;
        const dtResult = calculateDamage(DUAL_THREAT_SPELL, state, rng, isComboStrike);

        state.addDamage(dtResult.finalDamage);
        state.recordPendingSpellStat('dual_threat', dtResult.finalDamage, 1, dtResult.isCrit);
        // SimC dual_threat_t::damage_t::impact() attributes flurry_charge to MH weapon.
        addMonkFlurryCharges(gs, getFlurryChargesForHit(gs, dtResult.isCrit));

        gs[dtKey] = false;
        totalDamage += dtResult.finalDamage;
        if (options.allowSkyfuryProc) {
          totalDamage += maybeTriggerSkyfury();
        }
        if (options.scheduleSwing) {
          scheduleNextSwing();
        }
        return totalDamage;
      }

      const weaponDamage = minDmg === maxDmg
        ? minDmg
        : rollRange(rng, minDmg, maxDmg);

      const attackPowerDamage = weaponSpeed * (state.getAttackPower() / 6);
      let baseDamage = weaponDamage + attackPowerDamage;
      if (hand === 'offHand') { baseDamage *= 0.5; }

      let playerMult = 1.0;
      if (state.isBuffActive('blood_fury')) playerMult *= 1.2;

      const versMult = 1 + state.getVersatilityPercent() / 100;
      const targetMult = getSharedTargetDebuffMultiplier(state, { isPhysical: true });
      const martialInstinctsMult = getMartialInstinctsPhysicalDamageMultiplier(state);
      const ferocityMult = state.hasTalent('ferocity_of_xuen')
        ? 1 + getFerocityOfXuenMultiplier(state)
        : 1.0;
      const weaponOfWindMult = (state.hasTalent('weapon_of_wind') && state.isBuffActive('zenith')) ? 1.1 : 1.0;
      const armorPen = state.hasTalent('martial_precision') ? 12 : 0;
      const armorFactorEffective = computePhysicalArmorMultiplier(state, armorPen);

      const combined = WW_SPEC_AUTO_ATTACK_MULT * martialInstinctsMult * ferocityMult * weaponOfWindMult * playerMult * versMult * targetMult * armorFactorEffective;
      let finalDamage = baseDamage * combined;

      if (isCrit) { finalDamage *= 2.0; }

      state.addDamage(finalDamage);
      state.recordPendingSpellStat(spellKey, finalDamage, 1, isCrit);
      addMonkFlurryCharges(gs, getFlurryChargesForHit(gs, isCrit));

      if (state.hasTalent('thunderfist') && gs.getBuffStacks('thunderfist') > 0) {
        const tfResult = calculateDamage(THUNDERFIST_SPELL, state, rng, false);
        state.addDamage(tfResult.finalDamage);
        state.recordPendingSpellStat(THUNDERFIST_SPELL.name, tfResult.finalDamage, 1, tfResult.isCrit);
        gs.removeBuffStack('thunderfist');
        totalDamage += tfResult.finalDamage;
      }

      if (state.hasTalent('dual_threat')) {
        gs[dtKey] = true;
      }

      totalDamage += finalDamage;
      if (options.allowSkyfuryProc) {
        totalDamage += maybeTriggerSkyfury();
      }
      if (options.scheduleSwing) {
        scheduleNextSwing();
      }
      return totalDamage;
    };

    return resolveAutoAttack({ mayMiss: true, allowSkyfuryProc: true, scheduleSwing: true });
  },
};
