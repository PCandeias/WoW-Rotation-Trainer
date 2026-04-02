import type { BuffDef, SpellDef } from '../data/spells';
import {
  applyStatDR,
  convertSecondaryRatingToPercent,
  getSecondaryRatingPerPercent,
} from '../data/profileParser';
import type { GameState } from '../engine/gameState';
import type { IGameState } from '../engine/i_game_state';

const RECKLESSNESS_POTION_HASTE_RATING = 934.5676;
const RECKLESSNESS_POTION_VERS_PENALTY_RATING = 125.6926;
/**
 * Algeth'ar Puzzle Box mastery bonus computed dynamically via
 * {@link computePuzzleMasteryDelta}. This legacy constant is the fallback when
 * the profile's base mastery rating is unavailable.
 */
const ALGETHAR_PUZZLE_MASTERY_RATING_FALLBACK = 480.5574;
/** Mastery rating granted by Algeth'ar Puzzle Box at ilevel 289 (SimC debug verified). */
const ALGETHAR_PUZZLE_MASTERY_RATING = 861;
/**
 * Baseline player mastery points before rating-driven DR and external buffs.
 *
 * The trainer seeds mastery from SimC-style percent snapshots, so the Puzzle Box
 * delta needs the generic "base + DR(rating) + external points" shape that WoW
 * mastery uses. Our current modeled specs all use the standard 8-point baseline.
 */
const BASE_MASTERY_POINTS = 8;
/**
 * Fallback mastery coefficient only used when the seed cannot derive one from
 * profile stats. This remains a compatibility fallback, not the preferred path.
 */
const DEFAULT_MASTERY_COEFFICIENT = 1.9355;
/** Skyfury adds 2 mastery points (included in SimC buffed_stats seed). */
const SKYFURY_MASTERY_POINTS = 2;
const BLOODLUST_HASTE_PCT = 30;
const MARK_OF_THE_WILD_VERS_PCT = 3;
const BATTLE_SHOUT_AP_MULTIPLIER = 1.05;
const POWER_WORD_FORTITUDE_HEALTH_MULTIPLIER = 1.05;
const SKYFURY_MASTERY_PCT = 2;
const MYSTIC_TOUCH_PHYSICAL_TAKEN_PCT = 5;
const CHAOS_BRAND_MAGIC_TAKEN_PCT = 3;
const HUNTERS_MARK_DAMAGE_TAKEN_PCT = 3;
/**
 * Gaze of the Alnseer: DBC spell 1256896, coefficient 0.144396.
 * At ilevel 289: ~34 Agility per Alnscorned Essence stack (SimC debug verified).
 */
const GAZE_ALNSEER_AGI_PER_STACK = 34;
const LOA_CAPYBARA_PRIMARY_STAT = 31.60888;
const AKILZONS_CRY_OF_VICTORY_HASTE_RATING = 74.62438;
const HUNT_EMBELLISHMENT_STAT_RATING = 198.7753;
const HUNT_TRINKET_STAT_RATING = 119.1912;
const PRECISION_OF_THE_DRAGONHAWK_CRIT_RATING = 82.91601;

function getSecondaryBonusPercent(
  state: Pick<IGameState, 'characterLevel'>,
  stat: 'crit' | 'haste' | 'mastery' | 'versatility',
  rating: number,
): number {
  return convertSecondaryRatingToPercent(rating, stat, state.characterLevel);
}

const SHARED_PLAYER_SPELL_DEFS: SpellDef[] = [
  {
    id: 2825,
    name: 'bloodlust',
    displayName: 'Bloodlust',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 600,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: false,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },
  {
    id: 1236994,
    name: 'potion',
    displayName: 'Potion of Recklessness',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 300,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: false,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },
  {
    id: 193701,
    name: 'algethar_puzzle_box',
    displayName: "Algeth'ar Puzzle Box",
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 120,
    hasteScalesCooldown: false,
    isChanneled: true,
    channelDuration: 2,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },
  {
    id: 26297,
    name: 'berserking',
    displayName: 'Berserking',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 180,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: false,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },
  {
    id: 33697,
    name: 'blood_fury',
    displayName: 'Blood Fury',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 120,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: false,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },
];

const SHARED_PLAYER_BUFF_DEFS: BuffDef[] = [
  {
    id: 'bloodlust',
    displayName: 'Bloodlust',
    duration: 40,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'battle_shout',
    displayName: 'Battle Shout',
    duration: 0,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'arcane_intellect',
    displayName: 'Arcane Intellect',
    duration: 0,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'mark_of_the_wild',
    displayName: 'Mark of the Wild',
    duration: 0,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'power_word_fortitude',
    displayName: 'Power Word: Fortitude',
    duration: 0,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'skyfury',
    displayName: 'Skyfury',
    duration: 0,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'chaos_brand',
    displayName: 'Chaos Brand',
    duration: 0,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'hunters_mark',
    displayName: "Hunter's Mark",
    duration: 0,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'berserking',
    displayName: 'Berserking',
    duration: 12,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'blood_fury',
    displayName: 'Blood Fury',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'potion_of_recklessness_haste',
    displayName: 'Potion of Recklessness Haste',
    duration: 30,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'potion_of_recklessness_penalty_vers',
    displayName: 'Potion of Recklessness Penalty',
    duration: 30,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'algethar_puzzle',
    displayName: "Algeth'ar Puzzle",
    duration: 20,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'alnsight',
    displayName: 'Alnsight',
    duration: 12,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'alnscorned_essence',
    displayName: 'Alnscorned Essence',
    duration: 12,
    maxStacks: 20,
    isHarmful: false,
  },
  {
    id: 'blessing_of_the_capybara',
    displayName: 'Blessing of the Capybara',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'akilzons_cry_of_victory',
    displayName: "Akil'zon's Cry of Victory",
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'hasty_hunt',
    displayName: 'Hasty Hunt',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'focused_hunt',
    displayName: 'Focused Hunt',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'masterful_hunt',
    displayName: 'Masterful Hunt',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'versatile_hunt',
    displayName: 'Versatile Hunt',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'precision_of_the_dragonhawk',
    displayName: 'Precision of the Dragonhawk',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
];

export const SHARED_PLAYER_SPELLS = new Map<string, SpellDef>(
  SHARED_PLAYER_SPELL_DEFS.map((spell) => [spell.name, spell])
);

export const SHARED_PLAYER_BUFFS = new Map<string, BuffDef>(
  SHARED_PLAYER_BUFF_DEFS.map((buff) => [buff.id, buff])
);

function percentToMultiplier(percent: number): number {
  return 1 + percent / 100;
}

const ENERGY_REGEN_BUFFS = new Set([
  'bloodlust',
  'berserking',
  'potion_of_recklessness_haste',
  'akilzons_cry_of_victory',
  'hasty_hunt',
]);

export function getSharedPlayerCritBonus(state: IGameState): number {
  let crit = 0;
  if (state.isBuffActive('precision_of_the_dragonhawk')) {
    crit += getSecondaryBonusPercent(state, 'crit', PRECISION_OF_THE_DRAGONHAWK_CRIT_RATING);
  }
  if (state.isBuffActive('focused_hunt')) {
    const huntCritPct = state.getBuffStacks('focused_hunt') > 1
      ? getSecondaryBonusPercent(state, 'crit', HUNT_TRINKET_STAT_RATING)
      : getSecondaryBonusPercent(state, 'crit', HUNT_EMBELLISHMENT_STAT_RATING);
    crit += huntCritPct;
  }
  return crit;
}

export function getSharedPlayerHasteBonus(state: IGameState): number {
  let multiplier = 1;
  if (state.isBuffActive('bloodlust')) {
    multiplier *= percentToMultiplier(BLOODLUST_HASTE_PCT);
  }
  if (state.isBuffActive('potion_of_recklessness_haste')) {
    multiplier *= percentToMultiplier(getSecondaryBonusPercent(state, 'haste', RECKLESSNESS_POTION_HASTE_RATING));
  }
  if (state.isBuffActive('berserking')) {
    multiplier *= percentToMultiplier(15);
  }
  if (state.isBuffActive('akilzons_cry_of_victory')) {
    multiplier *= percentToMultiplier(getSecondaryBonusPercent(state, 'haste', AKILZONS_CRY_OF_VICTORY_HASTE_RATING));
  }
  if (state.isBuffActive('hasty_hunt')) {
    const huntHastePct = state.getBuffStacks('hasty_hunt') > 1
      ? getSecondaryBonusPercent(state, 'haste', HUNT_TRINKET_STAT_RATING)
      : getSecondaryBonusPercent(state, 'haste', HUNT_EMBELLISHMENT_STAT_RATING);
    multiplier *= percentToMultiplier(huntHastePct);
  }
  return (multiplier - 1) * 100;
}

export function getSharedPlayerVersatilityBonus(state: IGameState): number {
  let versatility = 0;
  if (state.isBuffActive('mark_of_the_wild')) {
    versatility += MARK_OF_THE_WILD_VERS_PCT;
  }
  if (state.isBuffActive('versatile_hunt')) {
    const huntVersPct = state.getBuffStacks('versatile_hunt') > 1
      ? getSecondaryBonusPercent(state, 'versatility', HUNT_TRINKET_STAT_RATING)
      : getSecondaryBonusPercent(state, 'versatility', HUNT_EMBELLISHMENT_STAT_RATING);
    versatility += huntVersPct;
  }
  if (!state.isBuffActive('potion_of_recklessness_penalty_vers')) {
    return versatility;
  }
  return versatility - getSecondaryBonusPercent(state, 'versatility', RECKLESSNESS_POTION_VERS_PENALTY_RATING);
}

/**
 * Compute the mastery_VALUE delta from Algeth'ar Puzzle Box using the DR-aware
 * rating conversion.
 *
 * SimC chain: composite_mastery_value = (base + DR(rating/35) + skyfury) × coefficient.
 * The delta is computed as the difference in mastery_value with and without the
 * puzzle box's +861 mastery rating, accounting for diminishing returns at the
 * combined rating level.
 *
 * When the base mastery rating is unknown, falls back to the legacy constant.
 */
function computePuzzleMasteryDelta(
  baseMasteryRating: number,
  baseMasteryPct: number,
  skyfuryPointsInBase: number,
  characterLevel: number,
): number {
  const masteryRatingPerPct = getSecondaryRatingPerPercent('mastery', characterLevel);
  if (baseMasteryRating <= 0) {
    return convertSecondaryRatingToPercent(ALGETHAR_PUZZLE_MASTERY_RATING_FALLBACK, 'mastery', characterLevel);
  }

  const baseRaw = baseMasteryRating / masteryRatingPerPct;
  const totalRaw = (baseMasteryRating + ALGETHAR_PUZZLE_MASTERY_RATING) / masteryRatingPerPct;
  const baseDR = applyStatDR(baseRaw);
  const totalDR = applyStatDR(totalRaw);

  // Derive the mastery coefficient from the seeded mastery value.
  // mastery_value = (base_points + DR(rating) + skyfury?) × coefficient
  // skyfuryPointsInBase should be SKYFURY_MASTERY_POINTS when the seed
  // already contains skyfury (e.g. simc_buffed_snapshot with skyfury enabled),
  // or 0 when skyfury is absent from the seed.
  const baseComposite = BASE_MASTERY_POINTS + baseDR + skyfuryPointsInBase;
  const coefficient = (baseComposite > 0 && baseMasteryPct > 0)
    ? baseMasteryPct / baseComposite
    : DEFAULT_MASTERY_COEFFICIENT;

  const deltaPoints = totalDR - baseDR;
  return deltaPoints * coefficient;
}

export function getSharedPlayerMasteryBonus(state: IGameState): number {
  let mastery = 0;
  const statsSeedIncludesPassiveBonuses = (state as { profileStatsSource?: string }).profileStatsSource === 'simc_buffed_snapshot';
  if (state.isBuffActive('algethar_puzzle')) {
    const stateWithStats = state as { stats?: { masteryRating?: number; masteryPercent?: number } };
    const baseMasteryRating = stateWithStats.stats?.masteryRating ?? 0;
    const baseMasteryPct = stateWithStats.stats?.masteryPercent ?? 0;
    // Skyfury mastery points are baked into the seed when the stats come from
    // a SimC buffed snapshot that had skyfury enabled.
    const skyfuryInSeed = statsSeedIncludesPassiveBonuses && state.isBuffActive('skyfury');
    const skyfuryPoints = skyfuryInSeed ? SKYFURY_MASTERY_POINTS : 0;
    mastery += computePuzzleMasteryDelta(baseMasteryRating, baseMasteryPct, skyfuryPoints, state.characterLevel);
  }
  if (state.isBuffActive('skyfury') && !statsSeedIncludesPassiveBonuses) {
    mastery += SKYFURY_MASTERY_PCT;
  }
  if (state.isBuffActive('masterful_hunt')) {
    const huntMasteryPct = state.getBuffStacks('masterful_hunt') > 1
      ? getSecondaryBonusPercent(state, 'mastery', HUNT_TRINKET_STAT_RATING)
      : getSecondaryBonusPercent(state, 'mastery', HUNT_EMBELLISHMENT_STAT_RATING);
    mastery += huntMasteryPct;
  }
  return mastery;
}

export function getSharedPlayerAttackPowerMultiplier(state: IGameState): number {
  if (state.isBuffActive('battle_shout')) {
    return BATTLE_SHOUT_AP_MULTIPLIER;
  }
  return 1;
}

/**
 * Gaze of the Alnseer: Alnscorned Essence stacks grant primary stat (Agility).
 * DBC: spell 1256896, coefficient 0.144396. At ilevel 289: 34 per stack (SimC debug verified).
 * In WoW, 1 Agility = 1 Attack Power for monks.
 */
export function getSharedPlayerAttackPowerBonus(state: IGameState): number {
  const stacks = state.getBuffStacks('alnscorned_essence');
  let attackPower = 0;
  if (stacks > 0) {
    attackPower += stacks * GAZE_ALNSEER_AGI_PER_STACK;
  }
  if (state.isBuffActive('blessing_of_the_capybara')) {
    attackPower += LOA_CAPYBARA_PRIMARY_STAT;
  }
  return attackPower;
}

export function getSharedPlayerMaxHealthMultiplier(state: IGameState): number {
  if (state.isBuffActive('power_word_fortitude')) {
    return POWER_WORD_FORTITUDE_HEALTH_MULTIPLIER;
  }
  return 1;
}

export function getSharedPlayerDamageMultiplier(state: IGameState): number {
  let multiplier = 1.0;
  if (state.isBuffActive('blood_fury')) {
    multiplier *= 1.2;
  }
  return multiplier;
}

export function getHuntersMarkTargetMultiplier(
  state: Pick<IGameState, 'isBuffActive'>,
): number {
  return state.isBuffActive('hunters_mark')
    ? percentToMultiplier(HUNTERS_MARK_DAMAGE_TAKEN_PCT)
    : 1.0;
}

export function getSharedTargetDebuffMultiplier(
  state: Pick<IGameState, 'assumeMysticTouch' | 'isBuffActive'>,
  spell: Pick<SpellDef, 'isPhysical'>,
): number {
  const isPhysical = spell.isPhysical !== false;
  let multiplier = 1.0;

  // SimC: player_t::composite_player_vulnerability() applies these by school.
  if (state.assumeMysticTouch && isPhysical) {
    multiplier *= percentToMultiplier(MYSTIC_TOUCH_PHYSICAL_TAKEN_PCT);
  }
  if (state.isBuffActive('chaos_brand') && !isPhysical) {
    multiplier *= percentToMultiplier(CHAOS_BRAND_MAGIC_TAKEN_PCT);
  }
  multiplier *= getHuntersMarkTargetMultiplier(state);

  return multiplier;
}

export function buffAffectsEnergyRegen(buffId: string): boolean {
  return ENERGY_REGEN_BUFFS.has(buffId);
}

export function expireSharedPlayerBuff(state: GameState, buffId: string): boolean {
  if (!SHARED_PLAYER_BUFFS.has(buffId)) {
    return false;
  }

  if (buffAffectsEnergyRegen(buffId)) {
    state.settleEnergy();
    state.expireBuff(buffId);
    state.recomputeEnergyRegenRate();
    return true;
  }

  state.expireBuff(buffId);

  if (buffId === 'algethar_puzzle') {
    const trinket = state.trinkets.find((entry) => entry.itemName === 'algethar_puzzle_box');
    if (trinket) {
      trinket.procActive = false;
    }
  }

  return true;
}
