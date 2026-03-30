import type { BuffDef, SpellDef } from '../data/spells';
import type { GameState } from '../engine/gameState';
import type { IGameState } from '../engine/i_game_state';

const CRIT_RATING_PER_PCT = 35;
const HASTE_RATING_PER_PCT = 33;
const MASTERY_RATING_PER_PCT = 35;
const VERSATILITY_RATING_PER_PCT = 40;
const RECKLESSNESS_POTION_HASTE_PCT = 934.5676 / 33;
const RECKLESSNESS_POTION_VERS_PENALTY_PCT = 125.6926 / 40;
const ALGETHAR_PUZZLE_MASTERY_PCT = 480.5574 / 35;
const BLOODLUST_HASTE_PCT = 30;
const MARK_OF_THE_WILD_VERS_PCT = 3;
const BATTLE_SHOUT_AP_MULTIPLIER = 1.05;
const POWER_WORD_FORTITUDE_HEALTH_MULTIPLIER = 1.05;
const SKYFURY_MASTERY_PCT = 2;
const MYSTIC_TOUCH_PHYSICAL_TAKEN_PCT = 5;
const CHAOS_BRAND_MAGIC_TAKEN_PCT = 3;
const HUNTERS_MARK_DAMAGE_TAKEN_PCT = 3;
/** Gaze of the Alnseer: DBC spell 1256896, coefficient 0.144396, ~19 Agility per Alnscorned Essence stack. */
const GAZE_ALNSEER_AGI_PER_STACK = 19;
const LOA_CAPYBARA_PRIMARY_STAT = 31.60888;
const AKILZONS_CRY_OF_VICTORY_HASTE_PCT = 74.62438 / HASTE_RATING_PER_PCT;
const HUNT_EMBELLISHMENT_STAT_PCT = 198.7753 / HASTE_RATING_PER_PCT;
const HUNT_EMBELLISHMENT_CRIT_PCT = 198.7753 / CRIT_RATING_PER_PCT;
const HUNT_EMBELLISHMENT_MASTERY_PCT = 198.7753 / MASTERY_RATING_PER_PCT;
const HUNT_EMBELLISHMENT_VERS_PCT = 198.7753 / VERSATILITY_RATING_PER_PCT;
const HUNT_TRINKET_STAT_PCT = 119.1912 / HASTE_RATING_PER_PCT;
const HUNT_TRINKET_CRIT_PCT = 119.1912 / CRIT_RATING_PER_PCT;
const HUNT_TRINKET_MASTERY_PCT = 119.1912 / MASTERY_RATING_PER_PCT;
const HUNT_TRINKET_VERS_PCT = 119.1912 / VERSATILITY_RATING_PER_PCT;
const PRECISION_OF_THE_DRAGONHAWK_CRIT_PCT = 82.91601 / CRIT_RATING_PER_PCT;

const SHARED_PLAYER_SPELL_DEFS: SpellDef[] = [
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
    crit += PRECISION_OF_THE_DRAGONHAWK_CRIT_PCT;
  }
  if (state.isBuffActive('focused_hunt')) {
    const huntCritPct = state.getBuffStacks('focused_hunt') > 1
      ? HUNT_TRINKET_CRIT_PCT
      : HUNT_EMBELLISHMENT_CRIT_PCT;
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
    multiplier *= percentToMultiplier(RECKLESSNESS_POTION_HASTE_PCT);
  }
  if (state.isBuffActive('berserking')) {
    multiplier *= percentToMultiplier(15);
  }
  if (state.isBuffActive('akilzons_cry_of_victory')) {
    multiplier *= percentToMultiplier(AKILZONS_CRY_OF_VICTORY_HASTE_PCT);
  }
  if (state.isBuffActive('hasty_hunt')) {
    const huntHastePct = state.getBuffStacks('hasty_hunt') > 1
      ? HUNT_TRINKET_STAT_PCT
      : HUNT_EMBELLISHMENT_STAT_PCT;
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
      ? HUNT_TRINKET_VERS_PCT
      : HUNT_EMBELLISHMENT_VERS_PCT;
    versatility += huntVersPct;
  }
  if (!state.isBuffActive('potion_of_recklessness_penalty_vers')) {
    return versatility;
  }
  return versatility - RECKLESSNESS_POTION_VERS_PENALTY_PCT;
}

export function getSharedPlayerMasteryBonus(state: IGameState): number {
  let mastery = 0;
  const statsSeedIncludesPassiveBonuses = (state as { profileStatsSource?: string }).profileStatsSource === 'simc_buffed_snapshot';
  if (!state.isBuffActive('algethar_puzzle')) {
    mastery = 0;
  } else {
    mastery += ALGETHAR_PUZZLE_MASTERY_PCT;
  }
  if (state.isBuffActive('skyfury') && !statsSeedIncludesPassiveBonuses) {
    mastery += SKYFURY_MASTERY_PCT;
  }
  if (state.isBuffActive('masterful_hunt')) {
    const huntMasteryPct = state.getBuffStacks('masterful_hunt') > 1
      ? HUNT_TRINKET_MASTERY_PCT
      : HUNT_EMBELLISHMENT_MASTERY_PCT;
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
 * DBC: spell 1256896, coefficient 0.144396, scaled value ~19 per stack.
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
