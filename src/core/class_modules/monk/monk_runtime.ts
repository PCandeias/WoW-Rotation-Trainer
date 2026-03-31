import type { GameState } from '../../engine/gameState';
import type { IGameState } from '../../engine/i_game_state';
import { createRppmTracker } from '../../engine/rppm';
import type { RppmTracker } from '../../engine/rppm';
import type { MonkTalents } from './monk_t';
import { buildMonkTalents } from './monk_t';
import { MONK_DBC, requireMonkSpellData } from '../../dbc/monk_spell_data';
import { EventType } from '../../engine/eventQueue';
import type { SimEvent } from '../../engine/eventQueue';
import type { SpellDef } from '../../data/spells';
import { MONK_WW_SPELLS } from '../../data/spells/monk_windwalker';
import { SHARED_PLAYER_SPELLS } from '../../shared/player_effects';

const MAX_FLURRY_CHARGES = 30;
const SIMC_BUFFED_SNAPSHOT_SOURCE = 'simc_buffed_snapshot';
const WINDWALKER_PASSIVE_ID = 137025;

// Skyfire Heel: +4% crit per enemy (buff 1248705 effectN(1)), capped at effectN(3) enemies from talent 1248704.
const SKYFIRE_HEEL_TALENT = requireMonkSpellData(1248704);
const SKYFIRE_HEEL_BUFF = requireMonkSpellData(1248705);
const SKYFIRE_HEEL_CRIT_PER_ENEMY_PCT = SKYFIRE_HEEL_BUFF.effectN(1).base_value(); // 4
const SKYFIRE_HEEL_MAX_ENEMIES = SKYFIRE_HEEL_TALENT.effectN(3).base_value();       // 5

const WEAPON_OF_WIND_SPELL = requireMonkSpellData(1272678);
const FAST_FEET_SPELL = requireMonkSpellData(388809);
const HIT_COMBO_BUFF_SPELL = requireMonkSpellData(196741);
const MOMENTUM_BOOST_SPEED_SPELL = requireMonkSpellData(451298);
const VIGILANT_WATCH_SPELL = requireMonkSpellData(450993);
const FEROCITY_OF_XUEN_SPELL = requireMonkSpellData(388674);
const FEROCIOUSNESS_SPELL = requireMonkSpellData(458623);
const TIGER_FANG_SPELL = requireMonkSpellData(1272781);
const CHI_PROFICIENCY_SPELL = requireMonkSpellData(450426);
const TIGEREYE_BREW_CRIT_SPELL = requireMonkSpellData(1261724);
const TIGEREYE_BREW_CRIT_BONUS_TALENT = requireMonkSpellData(1261844);
const IMPROVED_TOUCH_OF_DEATH_TALENT = requireMonkSpellData(322113);
export const IMPROVED_TOUCH_OF_DEATH_EXECUTE_PCT = IMPROVED_TOUCH_OF_DEATH_TALENT.effectN(1).base_value();
export const IMPROVED_TOUCH_OF_DEATH_DAMAGE_FRACTION = IMPROVED_TOUCH_OF_DEATH_TALENT.effectN(2).percent();

/** Spell names that receive the Skyfire Heel crit bonus (RSK/RWK/GotD family). */
const SKYFIRE_HEEL_CRIT_SPELLS = new Set([
  'rising_sun_kick',
  'rushing_wind_kick',
  'glory_of_the_dawn_rising_sun_kick_damage',
  'glory_of_the_dawn_rushing_wind_kick_damage',
]);
const RSK_FAMILY_CRIT_SPELLS = new Set([
  'rising_sun_kick',
  'rushing_wind_kick',
  'glory_of_the_dawn_rising_sun_kick_damage',
  'glory_of_the_dawn_rushing_wind_kick_damage',
]);

const RSK_FAMILY_PROC_SPELLS = new Set([
  'glory_of_the_dawn_rising_sun_kick_damage',
  'glory_of_the_dawn_rushing_wind_kick_damage',
]);

const MONK_TALENTS = new WeakMap<GameState, MonkTalents>();
const DANCE_OF_CHIJI_RPPM = new WeakMap<GameState, RppmTracker>();

function isTouchOfDeathReady(state: IGameState): boolean {
  const maxHealth = state.getMaxHealth();
  const targetCurrentHealth = state.getTargetCurrentHealth?.() ?? 0;
  const killRangeReady = targetCurrentHealth > 0 && targetCurrentHealth <= maxHealth;
  const improvedExecuteReady = state.hasTalent('improved_touch_of_death')
    && state.targetHealthPct < IMPROVED_TOUCH_OF_DEATH_EXECUTE_PCT;
  return killRangeReady || improvedExecuteReady;
}

export function getWindwalkerBaselineDirectMultiplier(): number {
  const bonusPct = MONK_DBC[WINDWALKER_PASSIVE_ID]?.effectN(1).base_value() ?? -10;
  return 1 + bonusPct / 100;
}

export function getWindwalkerBaselinePeriodicMultiplier(): number {
  const bonusPct = MONK_DBC[WINDWALKER_PASSIVE_ID]?.effectN(2).base_value() ?? -10;
  return 1 + bonusPct / 100;
}

export function getWindwalkerRskFamilyDirectMultiplier(): number {
  const bonusPct = MONK_DBC[WINDWALKER_PASSIVE_ID]?.effectN(15).base_value() ?? 188;
  return 1 + bonusPct / 100;
}

export function getWindwalkerJadefireStompDirectMultiplier(): number {
  // Windwalker Monk passive (137025 effect #19): +25% direct amount to
  // Jadefire Stomp labeled spells.
  const bonusPct = MONK_DBC[WINDWALKER_PASSIVE_ID]?.effectN(19).base_value();
  if (bonusPct == null) {
    throw new Error('Missing DBC data: Windwalker passive effect #19 (Jadefire Stomp multiplier) not found in MONK_DBC[137025]');
  }
  return 1 + bonusPct / 100;
}

/**
 * Martial Instincts: player-level physical damage multiplier.
 *
 * SimC rank curve at rank 2: value changes from 5 → 4 (not additive per rank).
 * The total bonus at rank 2 is 4%, not 2 × 5% = 10%.
 * We store the rank-2-adjusted value (4) in the DBC and use it directly.
 *
 * Ref: SimC debug — "Martial Instincts (450427) rank 2 effect id 1150320 value, old=5, new=4"
 */
export function getMartialInstinctsPhysicalDamageMultiplier(state: IGameState): number {
  if (!state.hasTalent('martial_instincts')) {
    return 1.0;
  }

  const bonusPct = MONK_DBC[450427]?.effectN(1).base_value() ?? 0;
  return 1 + bonusPct / 100;
}

/**
 * Chi Proficiency: player-level magic (all schools) damage multiplier.
 *
 * SimC rank curve at rank 2: value changes from 5 → 4 (not additive per rank).
 * The total bonus at rank 2 is 4%, not 2 × 4% = 8%.
 * DBC stores the rank-2-adjusted value (4); use directly.
 *
 * Ref: SimC debug — "Chi Proficiency (450426) rank 2 effect id 1150317 value, old=5, new=4"
 */
export function getChiProficiencyMagicDamageMultiplier(state: IGameState): number {
  if (!state.hasTalent('chi_proficiency')) {
    return 1.0;
  }

  return 1 + CHI_PROFICIENCY_SPELL.effectN(1).percent();
}

/**
 * Returns the bonus damage portion from Ferocity of Xuen (DBC 388674 effectN(1) per rank).
 * e.g. rank 2 → 0.04 (4% bonus).
 */
export function getFerocityOfXuenMultiplier(state: IGameState): number {
  const rank = state.getTalentRank?.('ferocity_of_xuen') ?? 2;
  return FEROCITY_OF_XUEN_SPELL.effectN(1).percent() * rank;
}

/**
 * Initialise monk-owned runtime state and generic stat hooks on GameState.
 */
export function initializeMonkRuntimeState(state: GameState): void {
  MONK_TALENTS.set(state, buildMonkTalents(state.talents, MONK_DBC));
  const statsSeedIncludesPassiveBonuses = state.profileStatsSource === SIMC_BUFFED_SNAPSHOT_SOURCE;
  const inheritedPreCastFailReason = state.executionHooks.preCastFailReason?.bind(undefined);
  const hasTalentRankMap = (runtimeState: IGameState): runtimeState is IGameState & { talentRanks: Map<string, number> } => (
    'talentRanks' in runtimeState && runtimeState.talentRanks instanceof Map
  );
  const getSelectedTalentRank = (runtimeState: IGameState, talentName: string, defaultRank: number): number => {
    if (!runtimeState.hasTalent(talentName)) {
      return 0;
    }
    if (hasTalentRankMap(runtimeState)) {
      return runtimeState.talentRanks.get(talentName) ?? defaultRank;
    }
    return runtimeState.getTalentRank?.(talentName) ?? defaultRank;
  };
  state.statHooks = {
    ...state.statHooks,
    getCritPercentBonus: (s: IGameState): number => {
      // zenith_teb_crit is STAT_PCT_BUFF_CRIT in SimC — it feeds composite_melee_crit_chance()
      // and therefore applies to ALL melee hits, including auto attacks.
      let bonus = s.getBuffStacks('zenith_teb_crit') * TIGEREYE_BREW_CRIT_SPELL.effectN(1).base_value();
      if (!statsSeedIncludesPassiveBonuses && s.hasTalent('ferociousness')) {
        const rank = getSelectedTalentRank(s, 'ferociousness', 2);
        bonus += FEROCIOUSNESS_SPELL.effectN(1).base_value() * rank;
      }
      return bonus;
    },
    getAutoAttackHastePercentBonus: (s: IGameState): number => {
      if (!s.hasTalent('martial_agility')) {
        return 0;
      }

      return s.isBuffActive('zenith') ? 60 : 30;
    },
    getAutoAttackSpeedMultiplier: (s: IGameState): number => {
      let multiplier = 1;
      if (s.isBuffActive('momentum_boost_speed')) {
        multiplier *= 1 + MOMENTUM_BOOST_SPEED_SPELL.effectN(1).percent();
      }
      return multiplier;
    },
    getAttackPowerMultiplierBonus: (s: IGameState): number => {
      if (statsSeedIncludesPassiveBonuses) {
        return 0;
      }
      // Against All Odds is an agility multiplier in SimC. We approximate this as
      // base AP scaling (agility -> AP) and keep the WEAPON_* AP term unscaled.
      return s.hasTalent('against_all_odds') ? 0.04 : 0;
    },
    getAttackPowerWeaponMultiplierBonus: (_s: IGameState): number => 0,
    getHastePercentBonus: (s: IGameState): number => {
      if (statsSeedIncludesPassiveBonuses || !s.hasTalent('veterans_eye')) {
        return 0;
      }
      return 5;
    },
  };

  state.executionHooks = {
    ...state.executionHooks,
    preCastFailReason: (
      s,
      spell,
    ): 'talent_missing' | 'wdp_constraint' | 'execute_not_ready' | 'not_available' | undefined => {
      const inheritedFailReason = inheritedPreCastFailReason?.(s, spell);
      if (inheritedFailReason) {
        return inheritedFailReason;
      }
      if (spell.name === 'touch_of_death' && !isTouchOfDeathReady(s)) {
        return 'execute_not_ready';
      }
      if (spell.isExecute && spell.name !== 'touch_of_death' && s.targetHealthPct > 15) {
        return 'execute_not_ready';
      }
      if (spell.name === 'rushing_wind_kick' && !s.isBuffActive('rushing_wind_kick')) {
        return 'talent_missing';
      }
      if (spell.isWdp && !s.isBuffActive('whirling_dragon_punch')) {
        return 'wdp_constraint';
      }
      return undefined;
    },
    resolveSpellDef: (_s, spellId): SpellDef | undefined => (
      MONK_WW_SPELLS.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId)
    ),
    getComboStrikeName: (_s, spell): string => (
      spell.name === 'blackout_kick_free' ? 'blackout_kick' : spell.name
    ),
    getUnregisteredChiCost: (s, spell, baseCost): number => {
      let cost = baseCost;
      if (
        (spell.name === 'blackout_kick' || spell.name === 'blackout_kick_free') &&
        s.isBuffActive('blackout_reinforcement')
      ) {
        cost = 0;
      }
      if (s.talents.has('harmonic_combo') && spell.name === 'fists_of_fury') {
        cost -= 1;
      }
      if (
        s.talents.has('knowledge_of_the_broken_temple') &&
        (spell.name === 'rising_sun_kick' || spell.name === 'rushing_wind_kick')
      ) {
        cost -= 1;
      }
      return Math.max(0, cost);
    },
    getGlobalChiCostReduction: (s, _spell): number => (
      s.isBuffActive('zenith') || s.isBuffActive('celestial_conduit_active') ? 1 : 0
    ),
    // WW Monk GCD: spec aura 1258122 eff#8 reduces base GCD 1.5s → 1.0s; gcd_type=NONE (non-hasted).
    // SimC: sc_monk.cpp:492. The 1.5s haste-scaled default is doubly wrong for WW.
    getGcdDuration: (_s, _spell, _default, _hastePercent): number => 1.0,
    /**
     * SimC gcd.max = base_gcd (1.5s) × attack_haste, min 750ms.
     * For energy classes, base_regen / energyRegenRate == attack_haste,
     * so we derive gcd.max from the live energy regen rate.
     *
     * Under normal conditions this is mathematically identical to the
     * default `1.5 / (1 + hastePercent / 100)`.  The hook exists because
     * the APL validator injects energyRegenRate directly from SimC logs,
     * so deriving gcd.max from energyRegenRate keeps both in sync even
     * if hastePercent is not perfectly aligned.
     */
    getGcdMax: (s, _defaultGcd): number => {
      const baseRegen = 10 * s.energyRegenMultiplier;
      return Math.max(0.75, 1.5 * baseRegen / s.energyRegenRate);
    },
    getUnregisteredCooldownDuration: (s, spell, baseDuration, hasteScalesCooldown): number => {
      let adjusted = baseDuration;
      if (spell.name === 'whirling_dragon_punch' || spell.name === 'strike_of_the_windlord') {
        if (s.talents.has('communion_with_wind')) {
          adjusted = Math.max(0, adjusted - 5);
        }
        if (s.talents.has('midnight_season_1_4pc')) {
          adjusted = Math.max(0, adjusted - 5);
        }
      }
      // Fatal Touch: reduces Touch of Death cooldown by 90s (DBC 394123 eff#1).
      if (spell.name === 'touch_of_death' && s.talents.has('fatal_touch')) {
        adjusted = Math.max(0, adjusted - 90);
      }
      if (!hasteScalesCooldown) {
        return adjusted;
      }
      return adjusted / (1 + s.getHastePercent() / 100);
    },
    getUnregisteredChannelDuration: (s, spell, baseDuration, hastePercent): number => {
      const adjusted = spell.name === 'fists_of_fury' && s.talents.has('crashing_fists')
        ? baseDuration + 1
        : baseDuration;
      if (spell.name === 'algethar_puzzle_box') {
        return adjusted;
      }
      return adjusted / (1 + hastePercent / 100);
    },
    getUnregisteredChannelTicks: (s, spell, baseTicks): number => (
      spell.name === 'fists_of_fury' && s.talents.has('crashing_fists') ? baseTicks + 1 : baseTicks
    ),
    getUnregisteredChannelTickOffsets: (_s, spell, channelDuration, channelTicks): number[] | undefined => {
      if (spell.name !== 'fists_of_fury' && spell.name !== 'spinning_crane_kick') {
        return undefined;
      }
      if (channelTicks <= 0) {
        return [];
      }
      if (channelTicks === 1) {
        return [0];
      }

      const interval = channelDuration / (channelTicks - 1);
      return Array.from({ length: channelTicks }, (_, index) => interval * index);
    },
    startCooldown: (s, spell): SimEvent[] | undefined => {
      if (spell.name !== 'zenith') {
        return undefined;
      }

      // Efficient Training effect #4: -10s Zenith recharge time (DBC 450989).
      const rechargeDuration = s.talents.has('efficient_training')
        ? Math.max(0, spell.cooldown - 10)
        : spell.cooldown;
      s.startChargeCooldown('zenith', 2, rechargeDuration);
      s.startCooldown('zenith', 16);
      s.cooldowns.delete('rising_sun_kick');

      const remains = s.getCooldownRemains('zenith');
      if (remains <= 0) {
        return [];
      }

      return [{
        type: EventType.COOLDOWN_READY,
        time: s.currentTime + remains,
        spellId: spell.name,
      }];
    },
  };

  state.damageHooks = {
    ...state.damageHooks,
    getActionMultiplier: (spell, s): number => {
      let mult = getWindwalkerBaselineDirectMultiplier();
      if (RSK_FAMILY_PROC_SPELLS.has(spell.name)) {
        mult *= getWindwalkerRskFamilyDirectMultiplier();
        // Fast Feet (388809 effectN(1)): +70% to GotD procs (same family as RSK/RWK).
        if (s.hasTalent('fast_feet')) mult *= 1 + FAST_FEET_SPELL.effectN(1).percent();
      }
      if (spell.name === 'jadefire_stomp') {
        mult *= getWindwalkerJadefireStompDirectMultiplier();
      }
      if (spell.name === 'teachings_of_the_monastery') {
        // WW aura (137025) eff#14 applies +329% (×4.29) to BOK family including 228649.
        // WW aura (1258122) eff#20 applies -75% (×0.25) to 228649 only.
        // BOK action class hardcodes eff#14 in composite_da_multiplier(); teachings
        // bypasses that path, so we apply the net factor here: 4.29 × 0.25 = 1.0725.
        mult *= 4.29 * 0.25;
      }
      if (spell.isPhysical !== false) {
        mult *= getMartialInstinctsPhysicalDamageMultiplier(s);
      } else {
        mult *= getChiProficiencyMagicDamageMultiplier(s);
      }
      if (s.hasTalent('weapon_of_wind') && s.isBuffActive('zenith')) {
        mult *= 1 + WEAPON_OF_WIND_SPELL.effectN(1).percent();
      }
      // Ferocity of Xuen (rank 2): +2% all damage per rank (DBC 388674 effectN(1)).
      if (s.hasTalent('ferocity_of_xuen')) {
        const rank = getSelectedTalentRank(s, 'ferocity_of_xuen', 2);
        mult *= 1 + FEROCITY_OF_XUEN_SPELL.effectN(1).percent() * rank;
      }
      // Jade Ignition fires a separate chi_explosion spell on SCK execute;
      // SimC does NOT apply a per-tick SCK damage multiplier for jade_ignition.
      return mult;
    },
    getMasteryMultiplier: (s, isComboStrike): number => {
      if (!isComboStrike) {
        return 1.0;
      }
      return 1 + s.getMasteryPercent() / 100;
    },
    getHitComboMultiplier: (s): number => {
      if (!s.hasTalent('hit_combo')) {
        return 1.0;
      }
      return 1 + s.hitComboStacks * HIT_COMBO_BUFF_SPELL.effectN(1).percent();
    },
    getSpellCritChanceBonusPercent: (spell, s): number => {
      // zenith_teb_crit is now in getCritPercentBonus (STAT_PCT_BUFF_CRIT — applies to all melee).
      // RSK/RWK/GotD family crit bonuses live on the damage action in SimC, so they
      // must be applied here for both direct hits and child proc spells.
      let bonus = 0;
      if (spell.name === 'dual_threat' && s.hasTalent('tiger_fang')) {
        bonus += TIGER_FANG_SPELL.effectN(2).base_value();
      }
      if (RSK_FAMILY_CRIT_SPELLS.has(spell.name)) {
        if (s.hasTalent('xuens_battlegear')) {
          bonus += requireMonkSpellData(392993).effectN(1).base_value();
        }
        if (s.hasTalent('pressure_points') && s.isBuffActive('pressure_point')) {
          bonus += requireMonkSpellData(337482).effectN(1).base_value();
        }
      }
      if (s.hasTalent('skyfire_heel') && SKYFIRE_HEEL_CRIT_SPELLS.has(spell.name)) {
        bonus += SKYFIRE_HEEL_CRIT_PER_ENEMY_PCT * Math.min(s.activeEnemies, SKYFIRE_HEEL_MAX_ENEMIES);
      }
      return bonus;
    },
    getCritDamageMultiplier: (spell, s): number => {
      const tebRank = s.getTalentRank('tigereye_brew');
      // TEB crit bonus: DBC 1261844 effectN(1) = 10% per rank (rank override [10, 20]).
      // SimC applies this as crit_bonus_multiplier via parse_effects (subtype 108).
      // bonus = (base_crit_mult - 1.0) * (1 + rank × effectN(1).percent())
      const tebCritBonusPctPerRank = TIGEREYE_BREW_CRIT_BONUS_TALENT.effectN(1).percent();
      // tigereye_brew is represented as a 4-rank node in the decoded talent map,
      // but crit-bonus scaling spell 1261844 only has two effective ranks.
      const tebRankForCrit = Math.min(2, Math.max(0, tebRank - 1)); // ranks 2/3 → spell ranks 1/2
      const baseCritBonus = 1.0; // standard WoW: crits do 2× damage → bonus portion = 1.0
      let mult = 1.0 + baseCritBonus * (1 + tebRankForCrit * tebCritBonusPctPerRank);
      // Vigilant Watch: crit bonus multiplier for Blackout Kick family (DBC 450993 effectN(1)).
      // Affected spell IDs: 100784, 205523, 228649.  228649 is the TotM child action
      // in SimC, which inherits BK's crit_bonus_effects via parse_effects.
      if (
        s.hasTalent('vigilant_watch') &&
        (spell.name === 'blackout_kick' || spell.name === 'blackout_kick_free' || spell.name === 'teachings_of_the_monastery')
      ) {
        const bonus = mult - 1.0;
        mult = 1.0 + bonus * (1 + VIGILANT_WATCH_SPELL.effectN(1).percent());
      }
      // Eyes of the Eagle ring enchant (DBC 1236701 eff#1): +1.25% crit_damage per rank.
      // Profile has rank 2 on both rings → multiplicative: (1.0125)^2 = 1.02515625.
      // SimC applies this as player_crit_damage_multiplier on the crit bonus portion.
      const playerCritDmgMult = state.stats.playerCritDamageMult ?? 1.0;
      if (playerCritDmgMult !== 1.0) {
        const eyesBonus = mult - 1.0;
        mult = 1.0 + eyesBonus * playerCritDmgMult;
      }
      return mult;
    },
    getArmorPenPercent: (s): number => {
      return s.hasTalent('martial_precision') ? 12 : 0;
    },
  };
}

/**
 * Read monk talent references built from DBC data for this state.
 */
export function getMonkTalents(state: GameState): MonkTalents | undefined {
  return MONK_TALENTS.get(state);
}

/**
 * Retrieve the monk Dance of Chi-Ji RPPM tracker for this state.
 * A cloned GameState gets a fresh tracker automatically because WeakMap keys differ.
 */
export function getDanceOfChiJiRppm(state: GameState): RppmTracker {
  let tracker = DANCE_OF_CHIJI_RPPM.get(state);
  if (tracker !== undefined) {
    return tracker;
  }

  tracker = createRppmTracker(1.0, true);
  DANCE_OF_CHIJI_RPPM.set(state, tracker);
  return tracker;
}

/**
 * Set Flurry Charge count and keep the canonical permanent buff in sync.
 */
export function setMonkFlurryCharges(state: GameState, value: number): number {
  const clamped = state.setPermanentStackingBuff('flurry_charge', value, MAX_FLURRY_CHARGES);
  state.flurryCharges = clamped;
  return clamped;
}

/**
 * Add Flurry Charges and synchronize the permanent buff stack.
 */
export function addMonkFlurryCharges(state: GameState, delta: number): number {
  return setMonkFlurryCharges(state, state.flurryCharges + delta);
}
