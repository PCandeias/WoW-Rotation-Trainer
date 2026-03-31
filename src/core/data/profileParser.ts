/**
 * SimC / Raidbots Profile Parser
 * Parses SimC profile strings (Raidbots export format) into CharacterProfile.
 */

import {
  cloneLoadout,
  createEmptyLoadout,
  isGearSlot,
  parseTemporaryEnchants,
  upsertGearItem,
  withSimcOptimalRaidExternalBuffs,
  type CharacterLoadout,
} from './loadout';
import { decodeMonkWindwalkerTalentString } from './talentStringDecoder';

export interface CharacterStats {
  attackPower: number;
  critPercent: number;
  hastePercent: number;
  versatilityPercent: number;
  masteryPercent: number;
  /** Raw mastery rating from gear (before DR). Used for DR-aware trinket mastery computation. */
  masteryRating?: number;
  mainHandMinDmg: number;
  mainHandMaxDmg: number;
  mainHandSpeed: number;
  offHandMinDmg: number;
  offHandMaxDmg: number;
  offHandSpeed: number;
  maxHealth?: number;
  /** Target armor for physical damage reduction. Default: 1470 (SimC training dummy). Override with 0 for no armor, 3430 for raid boss. */
  targetArmor?: number;
  /**
   * Player character level. Default 90.
   * Used to compute level-delta miss/dodge/parry chances vs the target.
   */
  characterLevel?: number;
  /**
   * Target level. Default 93 (standard raid boss = player level + 3).
   * Used with characterLevel to compute auto-attack avoidance.
   */
  targetLevel?: number;
  /**
   * Player hit chance percent (reduces miss chance on auto-attacks). Default 7.5.
   * At level 90 vs a level 93 boss, dual-wield white-hit cap = 26.5%.
   */
  hitPercent?: number;
  /**
   * Player expertise percent (reduces dodge/parry chance). Default 7.5.
   * At level 90 vs a level 93 boss, expertise cap = 7.5% (back), 15% (front).
   */
  expertisePercent?: number;
  /**
   * Player-level crit damage multiplier from gear enchants (e.g. Eyes of the Eagle).
   * Multiplies the crit bonus portion of all abilities. Default 1.0 (no bonus).
   */
  playerCritDamageMult?: number;
}

export type CharacterProfileStatsSource = 'profile' | 'simc_buffed_snapshot';

export type TalentSet = Set<string>;

export interface GearEffect {
  source: string; // e.g. "trinket_1", "trinket_2", "enchant_main_hand"
  type: 'proc' | 'on_use' | 'passive';
  rppm?: number; // for proc type
  cooldown?: number; // for on_use type (seconds)
  statType?: string; // e.g. "haste", "crit", "agility"
  statAmount?: number;
}

export interface CharacterProfile {
  name: string;
  race: string;
  spec: string;
  stats: CharacterStats;
  /** Describes whether `stats` are raw profile values or already a SimC composite snapshot. */
  statsSource?: CharacterProfileStatsSource;
  /**
   * When true, the profile's `stats.attackPower` already includes the Battle Shout ×1.05
   * multiplier baked in (i.e. exported from SimC with `buff=battle_shout`). Required when
   * `statsSource === 'simc_buffed_snapshot'`; leaving it false or absent will cause GameState
   * to throw rather than silently over-scale the weapon AP term.
   */
  battleShoutBaked?: boolean;
  talents: TalentSet;
  /** Maps talent internalId → selected rank (1-based). Only populated for decoded talent strings. */
  talentRanks: Map<string, number>;
  gearEffects: GearEffect[];
  rawLines: string[]; // all parsed lines for debugging
  rawTalentString: string; // raw talent encoding string
  loadout?: CharacterLoadout;
}

// Rating-to-percent conversion divisors for WoW The War Within (TWW), Season 1-2, level 70.
// These values change each expansion — source: https://www.wowhead.com/rating-calculator
// Crit: 35 rating = 1%
// Haste: 33 rating = 1%
// Mastery: 35 rating = 1% (WW-specific, varies by spec)
// Versatility: 40 rating = 1%
const CRIT_RATING_PER_PCT = 35.0;
const HASTE_RATING_PER_PCT = 33.0;
const MASTERY_RATING_PER_PCT = 35.0;
const VERS_RATING_PER_PCT = 40.0;

/**
 * Applies the Shadowlands secondary-stat Diminishing Returns (DR) curve to a raw percent value.
 *
 * Source: SimC `sc_rating.cpp` `rating_t::rating_to_pct` piecewise curve.
 * Applies to crit, haste, mastery, and versatility only (not primary stats).
 *
 * Effectiveness by raw-percent tier:
 *   0–30%:   100%  (no DR)
 *   30–39%:   90%
 *   39–47%:   80%
 *   47–54%:   70%
 *   54–66%:   60%
 *   66–126%:  50%  (hard cap at 126% raw → 86.6% effective)
 */
export function applyStatDR(rawPercent: number): number {
  const x = Math.min(rawPercent, 126);
  if (x <= 30) return x;
  if (x <= 39) return 30.0 + (x - 30) * 0.9;
  if (x <= 47) return 38.1 + (x - 39) * 0.8;
  if (x <= 54) return 44.5 + (x - 47) * 0.7;
  if (x <= 66) return 49.4 + (x - 54) * 0.6;
  /* x <= 126 */ return 56.6 + (x - 66) * 0.5;
}
const LEVEL_90_HEALTH_PER_STAMINA = 20.0;

// Exported for use by GameState initialization in Stage 3
export const WW_SHADO_PAN_TALENTS = new Set([
  'whirling_dragon_punch',
  'strike_of_the_windlord',
  'flurry_strikes',
  'obsidian_spiral',
  'efficient_training',
  'drinking_horn_cover',
  'shado_pan_adept',
  'martial_precision',
  'hit_combo',
  'jade_ignition',
  'glory_of_the_dawn',
  'rushing_jade_wind',
  'dance_of_chi_ji',
]);

/**
 * Parses a SimC profile string (Raidbots export format) into a CharacterProfile.
 *
 * Format:
 * ```
 * monk="Windwalker"
 * level=70
 * race=orc
 * region=us
 * server=stormrage
 * role=attack
 * talents=BcEAAAAAAAAAAAAAAAAAAAAAAAAACJSSSSSSSJSSJJJC
 *
 * gear_agility_rating=12000
 * gear_crit_rating=2500
 * gear_haste_rating=3200
 * gear_mastery_rating=4100
 * gear_versatility_rating=1800
 * attack_power=18000
 *
 * main_hand=fist_weapon_name,id=12345,bonus_id=1234,enchant_id=7981
 * main_hand_speed=2.60
 * main_hand_min=1200
 * main_hand_max=1800
 * off_hand=fist_weapon_name_2,id=23456
 * off_hand_speed=2.60
 * off_hand_min=900
 * off_hand_max=1300
 *
 * trinket1=,id=133282,bonus_id=1234
 * trinket1_rppm=2.5
 * trinket1_stat=haste
 * trinket2=,id=133201,bonus_id=5678
 * trinket2_on_use_cooldown=120
 * trinket2_stat=agility
 * trinket2_stat_amount=1500
 * ```
 *
 * Parsing rules:
 * - Each line is `key=value` or `key=value # comment`; strip `#` comments
 * - `monk="Name"` → `name`; strip quotes
 * - `race=` → `race`
 * - `talents=` → store raw string; decode selected talents for supported profiles
 * - `gear_crit_rating=N` → convert to percent: `critPercent = N / 35.0`
 * - `gear_haste_rating=N` → `hastePercent = N / 33.0`
 * - `gear_mastery_rating=N` → `masteryPercent = N / 35.0`
 * - `gear_versatility_rating=N` → `versatilityPercent = N / 40.0`
 * - `attack_power=N` → `attackPower`
 * - `level=N` or `character_level=N` → `characterLevel`
 * - `target_level=N` → `targetLevel`
 * - `target_armor=N` → `targetArmor`
 * - `hit_percent=N` → `hitPercent`
 * - `expertise_percent=N` → `expertisePercent`
 * - `main_hand_min=N`, `main_hand_max=N`, `main_hand_speed=N`
 * - `off_hand_min=N`, `off_hand_max=N`, `off_hand_speed=N`
 * - `trinket1_rppm=N` → GearEffect for trinket 1 with type 'proc'
 * - `trinket2_on_use_cooldown=N` → GearEffect for trinket 2 with type 'on_use'
 * - Malformed/unknown lines: log a warning and skip (do not throw)
 *
 * @param input - The SimC profile string
 * @returns A CharacterProfile object
 */
export function parseProfile(input: string): CharacterProfile {
  const profile: CharacterProfile = {
    name: '',
    race: '',
    spec: '',
    statsSource: 'profile',
    stats: {
      attackPower: 0,
      critPercent: 0,
      hastePercent: 0,
      versatilityPercent: 0,
      masteryPercent: 0,
      mainHandMinDmg: 0,
      mainHandMaxDmg: 0,
      mainHandSpeed: 0,
      offHandMinDmg: 0,
      offHandMaxDmg: 0,
      offHandSpeed: 0,
    },
    talents: new Set(),
    talentRanks: new Map(),
    gearEffects: [],
    rawLines: [],
    rawTalentString: '',
    loadout: createEmptyLoadout(),
  };

  if (!input || input.trim().length === 0) {
    throw new Error('Profile input is empty');
  }

  const lines = input.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      continue;
    }

    const summaryComment = parseSummaryComment(trimmed);
    if (summaryComment) {
      profile.rawLines.push(summaryComment.raw);
      parseField(profile, summaryComment.key, summaryComment.value);
      continue;
    }

    // Strip comments
    const beforeComment = trimmed.split('#')[0].trim();

    // Skip if nothing left after stripping comment
    if (!beforeComment) {
      continue;
    }

    // Parse key=value
    const eqIndex = beforeComment.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Malformed profile line: "${trimmed}" (expected "key=value" format)`);
    }

    const key = beforeComment.substring(0, eqIndex).trim();
    const value = beforeComment.substring(eqIndex + 1).trim();

    // Add to rawLines
    profile.rawLines.push(beforeComment);

    parseField(profile, key, value);
  }

  applyDecodedTalentString(profile);
  validateRequiredProfileFields(profile);
  validateRequiredWeaponStats(profile);

  return profile;
}

/**
 * Parse a single field and update the profile.
 */
function parseField(profile: CharacterProfile, key: string, value: string): void {
  // Class/Spec field (e.g., monk="Windwalker")
  if (key === 'monk' || key === 'warrior' || key === 'rogue' || key === 'hunter' ||
    key === 'shaman' || key === 'druid' || key === 'paladin' || key === 'deathknight' ||
    key === 'priest' || key === 'warlock' || key === 'mage' || key === 'demonhunter' ||
    key === 'evoker') {
    profile.spec = key;
    profile.name = stripQuotes(value);
    return;
  }

  // Race field
  if (key === 'race') {
    profile.race = value;
    return;
  }

  // Talents raw string
  if (key === 'talents') {
    profile.rawTalentString = value;
    return;
  }

  if (key === 'optimal_raid') {
    const enabled = parseIntegerField(key, value) !== 0;
    profile.loadout = withSimcOptimalRaidExternalBuffs(cloneLoadout(profile.loadout), enabled);
    return;
  }

  if (key.startsWith('override.')) {
    const enabled = parseIntegerField(key, value) !== 0;
    profile.loadout = cloneLoadout(profile.loadout);

    switch (key) {
      case 'override.bloodlust':
        profile.loadout.externalBuffs.bloodlust = enabled;
        return;
      case 'override.battle_shout':
        profile.loadout.externalBuffs.battleShout = enabled;
        return;
      case 'override.arcane_intellect':
        profile.loadout.externalBuffs.arcaneIntellect = enabled;
        return;
      case 'override.mark_of_the_wild':
        profile.loadout.externalBuffs.markOfTheWild = enabled;
        return;
      case 'override.power_word_fortitude':
        profile.loadout.externalBuffs.powerWordFortitude = enabled;
        return;
      case 'override.skyfury':
        profile.loadout.externalBuffs.skyfury = enabled;
        return;
      case 'override.mystic_touch':
        profile.loadout.externalBuffs.mysticTouch = enabled;
        return;
      case 'override.chaos_brand':
        profile.loadout.externalBuffs.chaosBrand = enabled;
        return;
      case 'override.hunters_mark':
        profile.loadout.externalBuffs.huntersMark = enabled;
        return;
      // Known SimC overrides not modeled by the trainer yet.
      case 'override.blessing_of_the_bronze':
      case 'override.mortal_wounds':
      case 'override.bleeding':
        return;
      default:
        return;
    }
  }

  if (key === 'potion') {
    profile.loadout = cloneLoadout(profile.loadout);
    // SimC treats `potion=` as "auto/default potion", not disabled.
    // Keep an explicit non-null marker so runtime potion actions remain available.
    profile.loadout.consumables.potion = value === '' ? 'auto' : (value || null);
    return;
  }

  if (key === 'flask') {
    profile.loadout = cloneLoadout(profile.loadout);
    profile.loadout.consumables.flask = value || null;
    return;
  }

  if (key === 'food') {
    profile.loadout = cloneLoadout(profile.loadout);
    profile.loadout.consumables.food = value || null;
    return;
  }

  if (key === 'augmentation') {
    profile.loadout = cloneLoadout(profile.loadout);
    profile.loadout.consumables.augmentation = value || null;
    return;
  }

  if (key === 'temporary_enchant') {
    profile.loadout = cloneLoadout(profile.loadout);
    profile.loadout.consumables.temporaryEnchants = parseTemporaryEnchants(value);
    return;
  }

  if (key === 'gear_agility' || key === 'gear_agility_rating') {
    const val = parseIntegerField(key, value);
    // For monks, agility converts to AP at 1:1 ratio (attack_power_per_agility = 1.0).
    // This is a rough fallback; accurate AP requires SimC buffed stats + weapon AP.
    if (profile.stats.attackPower === 0) {
      profile.stats.attackPower = val;
    }
    return;
  }

  if (key === 'gear_stamina') {
    const val = parseIntegerField(key, value);
    // Level-90 SimC profiles use 20 health per stamina for validation-scale
    // max-health estimates. SimC export profiles do not include max health
    // directly, so we derive it from the commented gear summary.
    profile.stats.maxHealth = val * LEVEL_90_HEALTH_PER_STAMINA;
    return;
  }

  if (
    key === 'gear_ilvl' ||
    key === 'gear_avoidance_rating' ||
    key === 'gear_armor'
  ) {
    parseFloatField(key, value);
    return;
  }

  // Attack power
  if (key === 'attack_power') {
    const val = parseIntegerField(key, value);
    profile.stats.attackPower = val;
    return;
  }

  if (key === 'level' || key === 'character_level') {
    const val = parseIntegerField(key, value);
    profile.stats.characterLevel = val;
    return;
  }

  if (key === 'target_level') {
    const val = parseIntegerField(key, value);
    profile.stats.targetLevel = val;
    return;
  }

  if (key === 'target_armor') {
    const val = parseIntegerField(key, value);
    profile.stats.targetArmor = val;
    return;
  }

  if (key === 'hit_percent') {
    const val = parseFloatField(key, value);
    profile.stats.hitPercent = val;
    return;
  }

  if (key === 'expertise_percent') {
    const val = parseFloatField(key, value);
    profile.stats.expertisePercent = val;
    return;
  }

  // Stat rating conversions — apply Diminishing Returns curve after linear division
  if (key === 'gear_crit_rating') {
    const val = parseIntegerField(key, value);
    profile.stats.critPercent = applyStatDR(val / CRIT_RATING_PER_PCT);
    return;
  }

  if (key === 'gear_haste_rating') {
    const val = parseIntegerField(key, value);
    profile.stats.hastePercent = applyStatDR(val / HASTE_RATING_PER_PCT);
    return;
  }

  if (key === 'gear_mastery_rating') {
    const val = parseIntegerField(key, value);
    profile.stats.masteryPercent = applyStatDR(val / MASTERY_RATING_PER_PCT);
    return;
  }

  if (key === 'gear_versatility_rating') {
    const val = parseIntegerField(key, value);
    profile.stats.versatilityPercent = applyStatDR(val / VERS_RATING_PER_PCT);
    return;
  }

  // Main hand weapon
  if (key === 'main_hand_min') {
    const val = parseIntegerField(key, value);
    profile.stats.mainHandMinDmg = val;
    return;
  }

  if (key === 'main_hand_max') {
    const val = parseIntegerField(key, value);
    profile.stats.mainHandMaxDmg = val;
    return;
  }

  if (key === 'main_hand_speed') {
    const val = parseFloatField(key, value);
    profile.stats.mainHandSpeed = val;
    return;
  }

  // Off hand weapon
  if (key === 'off_hand_min') {
    const val = parseIntegerField(key, value);
    profile.stats.offHandMinDmg = val;
    return;
  }

  if (key === 'off_hand_max') {
    const val = parseIntegerField(key, value);
    profile.stats.offHandMaxDmg = val;
    return;
  }

  if (key === 'off_hand_speed') {
    const val = parseFloatField(key, value);
    profile.stats.offHandSpeed = val;
    return;
  }

  // Trinket rppm fields (generic)
  const trinketRppmRegex = /^trinket(\d+)_rppm$/;
  const trinketRppmMatch = trinketRppmRegex.exec(key);
  if (trinketRppmMatch) {
    const trinketNum = trinketRppmMatch[1];
    const source = `trinket_${trinketNum}`;
    let effect = profile.gearEffects.find((e) => e.source === source);
    if (!effect) {
      effect = { source, type: 'proc' };
      profile.gearEffects.push(effect);
    }
    const rppmVal = parseFloatField(key, value);
    effect.rppm = rppmVal;
    return;
  }

  // Trinket on_use_cooldown fields (generic)
  const trinketOnUseRegex = /^trinket(\d+)_on_use_cooldown$/;
  const trinketOnUseMatch = trinketOnUseRegex.exec(key);
  if (trinketOnUseMatch) {
    const trinketNum = trinketOnUseMatch[1];
    const source = `trinket_${trinketNum}`;
    let effect = profile.gearEffects.find((e) => e.source === source);
    if (!effect) {
      effect = { source, type: 'on_use' };
      profile.gearEffects.push(effect);
    }
    const cdVal = parseIntegerField(key, value);
    effect.cooldown = cdVal;
    return;
  }

  // Trinket stat fields (generic, can apply to any trinket)
  const trinketStatRegex = /^trinket(\d+)_stat$/;
  const trinketStatMatch = trinketStatRegex.exec(key);
  if (trinketStatMatch) {
    const trinketNum = trinketStatMatch[1];
    const source = `trinket_${trinketNum}`;
    let effect = profile.gearEffects.find((e) => e.source === source);
    if (!effect) {
      effect = { source, type: 'passive' };
      profile.gearEffects.push(effect);
    }
    effect.statType = value;
    return;
  }

  const trinketStatAmountRegex = /^trinket(\d+)_stat_amount$/;
  const trinketStatAmountMatch = trinketStatAmountRegex.exec(key);
  if (trinketStatAmountMatch) {
    const trinketNum = trinketStatAmountMatch[1];
    const source = `trinket_${trinketNum}`;
    let effect = profile.gearEffects.find((e) => e.source === source);
    if (!effect) {
      effect = { source, type: 'passive' };
      profile.gearEffects.push(effect);
    }
    const saVal = parseIntegerField(key, value);
    effect.statAmount = saVal;
    return;
  }

  if (key === 'set_bonus') {
    const [setBonusId, enabledValue] = value.split('=');
    if (!setBonusId || enabledValue !== '1') {
      throw new Error(`Invalid set_bonus value for '${key}': '${value}'`);
    }
    profile.talents.add(setBonusId);
    return;
  }

  if (isGearSlot(key)) {
    if ((key === 'trinket1' || key === 'trinket2') && value.trim().length === 0) {
      const source = key === 'trinket1' ? 'trinket_1' : 'trinket_2';
      profile.gearEffects = profile.gearEffects.filter((effect) => effect.source !== source);
    }
    profile.loadout = cloneLoadout(profile.loadout);
    upsertGearItem(profile.loadout, key, value, `${key}=${value}`);
    return;
  }

  if (
    key === 'source' ||
    key === 'spec' ||
    key === 'position' ||
    key === 'region' ||
    key === 'server' ||
    key === 'role' ||
    key === 'potion' ||
    key === 'flask' ||
    key === 'food' ||
    key === 'augmentation' ||
    key === 'temporary_enchant' ||
    key.startsWith('actions') ||
    key.startsWith('head') ||
    key.startsWith('neck') ||
    key.startsWith('shoulders') ||
    key.startsWith('back') ||
    key.startsWith('chest') ||
    key.startsWith('wrists') ||
    key.startsWith('hands') ||
    key.startsWith('waist') ||
    key.startsWith('legs') ||
    key.startsWith('feet') ||
    key.startsWith('finger') ||
    key.startsWith('set_bonus')
  ) {
    return;
  }

  if (key === 'main_hand') {
    return;
  }

  if (key === 'off_hand') {
    return;
  }

  if (/^trinket\d+$/.test(key)) {
    return;
  }

  // Unknown field
  throw new Error(`Unknown profile field '${key}'`);
}

function parseIntegerField(key: string, value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for '${key}': '${value}'`);
  }
  return parsed;
}

function parseFloatField(key: string, value: string): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for '${key}': '${value}'`);
  }
  return parsed;
}

/**
 * Strip leading and trailing quotes from a string.
 */
function stripQuotes(str: string): string {
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  return str;
}

function parseSummaryComment(line: string): { raw: string; key: string; value: string } | null {
  if (!line.startsWith('#')) return null;
  const summary = line.slice(1).trim();
  if (
    !summary.startsWith('gear_') &&
    !summary.startsWith('character_level=') &&
    !summary.startsWith('target_level=') &&
    !summary.startsWith('target_armor=') &&
    !summary.startsWith('hit_percent=') &&
    !summary.startsWith('expertise_percent=') &&
    summary !== 'main_hand_speed' &&
    summary !== 'main_hand_min' &&
    summary !== 'main_hand_max' &&
    summary !== 'off_hand_speed' &&
    summary !== 'off_hand_min' &&
    summary !== 'off_hand_max' &&
    !summary.startsWith('main_hand_speed=') &&
    !summary.startsWith('main_hand_min=') &&
    !summary.startsWith('main_hand_max=') &&
    !summary.startsWith('off_hand_speed=') &&
    !summary.startsWith('off_hand_min=') &&
    !summary.startsWith('off_hand_max=')
  ) {
    return null;
  }

  const eqIndex = summary.indexOf('=');
  if (eqIndex === -1) return null;

  return {
    raw: summary,
    key: summary.slice(0, eqIndex).trim(),
    value: summary.slice(eqIndex + 1).trim(),
  };
}

function applyDecodedTalentString(profile: CharacterProfile): void {
  if (!profile.rawTalentString) {
    return;
  }

  const decodedTalents = decodeMonkWindwalkerTalentString(profile.rawTalentString);
  if (decodedTalents.length === 0) {
    throw new Error(`Invalid monk talent string: '${profile.rawTalentString}'`);
  }

  // Decode-driven talent set with set bonuses re-applied from parsed lines.
  const decodedTalentSet = new Set(decodedTalents.map((talent) => talent.internalId));
  const rankMap = new Map(decodedTalents.map((talent) => [talent.internalId, talent.rank]));
  for (const line of profile.rawLines) {
    const setBonusMatch = /^set_bonus=([^=]+)=1$/.exec(line);
    if (setBonusMatch?.[1]) {
      decodedTalentSet.add(setBonusMatch[1]);
    }
  }

  profile.talents = decodedTalentSet;
  profile.talentRanks = rankMap;
}

function validateRequiredProfileFields(profile: CharacterProfile): void {
  if (!profile.spec) {
    throw new Error('Profile is missing a class/spec header');
  }

  if (!profile.name) {
    throw new Error('Profile is missing a character name');
  }
}

function validateRequiredWeaponStats(profile: CharacterProfile): void {
  const hasMainHand = profile.loadout?.gear.some((item) => item.slot === 'main_hand') ?? false;
  const hasOffHand = profile.loadout?.gear.some((item) => item.slot === 'off_hand') ?? false;

  if (hasMainHand && profile.stats.mainHandSpeed <= 0) {
    throw new Error("Profile is missing required 'main_hand_speed' for the equipped main-hand weapon");
  }

  if (hasMainHand && profile.stats.mainHandMinDmg <= 0) {
    throw new Error("Profile is missing required 'main_hand_min' for the equipped main-hand weapon");
  }

  if (hasMainHand && profile.stats.mainHandMaxDmg <= 0) {
    throw new Error("Profile is missing required 'main_hand_max' for the equipped main-hand weapon");
  }

  if (hasOffHand && profile.stats.offHandSpeed <= 0) {
    throw new Error("Profile is missing required 'off_hand_speed' for the equipped off-hand weapon");
  }

  if (hasOffHand && profile.stats.offHandMinDmg <= 0) {
    throw new Error("Profile is missing required 'off_hand_min' for the equipped off-hand weapon");
  }

  if (hasOffHand && profile.stats.offHandMaxDmg <= 0) {
    throw new Error("Profile is missing required 'off_hand_max' for the equipped off-hand weapon");
  }
}
