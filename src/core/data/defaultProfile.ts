import monkProfileText from './profiles/monk_windwalker_mid1.simc?raw';
import shamanProfileText from './profiles/shaman_enhancement_mid1.simc?raw';

import { cloneLoadout, createEmptyLoadout, withSimcOptimalRaidExternalBuffs } from './loadout';
import type { CharacterProfile, CharacterStats } from './profileParser';
import { parseProfile } from './profileParser';

interface RequiredCombatDefaults {
  targetArmor: number;
  characterLevel: number;
  targetLevel: number;
  hitPercent: number;
  expertisePercent: number;
}

const BASE_DEFAULT_MONK_WINDWALKER_PROFILE: CharacterProfile = (() : CharacterProfile => {
  const parsed = parseProfile(monkProfileText);
  const baseLoadout = parsed.loadout ? cloneLoadout(parsed.loadout) : createEmptyLoadout();
  const optimalRaidLoadout = withSimcOptimalRaidExternalBuffs(baseLoadout, true);

  return {
    ...parsed,
    talents: new Set(parsed.talents),
    talentRanks: new Map(parsed.talentRanks),
    gearEffects: parsed.gearEffects.map((effect) => ({ ...effect })),
    rawLines: [...parsed.rawLines],
    // SimC defaults to optimal_raid=1 for raid-style simulations.
    loadout: optimalRaidLoadout,
  };
})();

const BASE_DEFAULT_SHAMAN_ENHANCEMENT_PROFILE: CharacterProfile = (() : CharacterProfile => {
  const parsed = parseProfile(shamanProfileText);
  const baseLoadout = parsed.loadout ? cloneLoadout(parsed.loadout) : createEmptyLoadout();
  const optimalRaidLoadout = withSimcOptimalRaidExternalBuffs(baseLoadout, true);

  return {
    ...parsed,
    talents: new Set(parsed.talents),
    talentRanks: new Map(parsed.talentRanks),
    gearEffects: parsed.gearEffects.map((effect) => ({ ...effect })),
    rawLines: [...parsed.rawLines],
    loadout: optimalRaidLoadout,
  };
})();

const DEFAULT_COMBAT_STATS: RequiredCombatDefaults = (() : RequiredCombatDefaults => {
  const stats = BASE_DEFAULT_MONK_WINDWALKER_PROFILE.stats;
  return {
    targetArmor: requireDefaultStat(stats.targetArmor, 'targetArmor'),
    characterLevel: requireDefaultStat(stats.characterLevel, 'characterLevel'),
    targetLevel: requireDefaultStat(stats.targetLevel, 'targetLevel'),
    hitPercent: requireDefaultStat(stats.hitPercent, 'hitPercent'),
    expertisePercent: requireDefaultStat(stats.expertisePercent, 'expertisePercent'),
  };
})();

const DEFAULT_PROFILE_BUILDERS = new Map<string, () => CharacterProfile>([
  ['monk', (): CharacterProfile => cloneCharacterProfile(BASE_DEFAULT_MONK_WINDWALKER_PROFILE)],
  ['shaman', (): CharacterProfile => cloneCharacterProfile(BASE_DEFAULT_SHAMAN_ENHANCEMENT_PROFILE)],
]);

function requireDefaultStat(value: number | undefined, fieldName: keyof RequiredCombatDefaults): number {
  if (value === undefined) {
    throw new Error(`Default trainer profile is missing required combat field '${fieldName}'`);
  }

  return value;
}

export function getDefaultMonkWindwalkerProfile(): CharacterProfile {
  return getDefaultProfileForSpec('monk');
}

export function getDefaultProfileForSpec(spec: string): CharacterProfile {
  const builder = DEFAULT_PROFILE_BUILDERS.get(spec);
  if (!builder) {
    throw new Error(`No default trainer profile registered for spec '${spec}'`);
  }

  return builder();
}

export function getRegisteredDefaultProfiles(): CharacterProfile[] {
  return [...DEFAULT_PROFILE_BUILDERS.values()].map((builder) => builder());
}

export function resolveCharacterStatsWithTrainerDefaults(stats: CharacterStats): CharacterStats {
  return {
    ...stats,
    targetArmor: stats.targetArmor ?? DEFAULT_COMBAT_STATS.targetArmor,
    characterLevel: stats.characterLevel ?? DEFAULT_COMBAT_STATS.characterLevel,
    targetLevel: stats.targetLevel ?? DEFAULT_COMBAT_STATS.targetLevel,
    hitPercent: stats.hitPercent ?? DEFAULT_COMBAT_STATS.hitPercent,
    expertisePercent: stats.expertisePercent ?? DEFAULT_COMBAT_STATS.expertisePercent,
  };
}

function cloneCharacterProfile(profile: CharacterProfile): CharacterProfile {
  return {
    ...profile,
    stats: { ...profile.stats },
    talents: new Set(profile.talents),
    talentRanks: new Map(profile.talentRanks),
    gearEffects: profile.gearEffects.map((effect) => ({ ...effect })),
    rawLines: [...profile.rawLines],
    loadout: profile.loadout ? cloneLoadout(profile.loadout) : undefined,
  };
}
