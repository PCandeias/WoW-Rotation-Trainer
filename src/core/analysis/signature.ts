import type { CharacterLoadout } from '@core/data/loadout';
import { ANALYSIS_VERSION, type AnalysisProfileInput, type BenchmarkSignature } from './types';

export function buildTalentStateSignature(
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
): string {
  const talentPart = [...talents].sort().join('|');
  const rankPart = [...talentRanks.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([internalId, rank]) => `${internalId}:${rank}`)
    .join('|');

  return `${talentPart}::${rankPart}`;
}

export function buildLoadoutSignature(loadout: CharacterLoadout): string {
  const consumables = [
    loadout.consumables.potion ?? '',
    loadout.consumables.flask ?? '',
    loadout.consumables.food ?? '',
    loadout.consumables.augmentation ?? '',
    loadout.consumables.temporaryEnchants
      .map((enchant) => `${enchant.slot}:${enchant.enchantName}`)
      .sort()
      .join('|'),
  ].join('::');

  const externalBuffs = Object.entries(loadout.externalBuffs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, enabled]) => `${key}:${enabled ? 1 : 0}`)
    .join('|');

  const gear = loadout.gear
    .map((item) => `${item.slot}:${item.itemId ?? 0}:${item.enchantId ?? 0}`)
    .sort()
    .join('|');

  return `${consumables}::${externalBuffs}::${gear}`;
}

export function buildBenchmarkSignature(
  input: AnalysisProfileInput,
  aplSignature = 'default-apl',
  rngPolicy = 'avg-seeds:1337,7331,9001,4242,2026',
): BenchmarkSignature {
  const talentsSignature = buildTalentStateSignature(input.talents, input.talentRanks);
  const loadoutSignature = buildLoadoutSignature(input.loadout);
  const key = [
    input.specId,
    input.encounterDuration,
    input.activeEnemies,
    talentsSignature,
    loadoutSignature,
    aplSignature,
    ANALYSIS_VERSION,
    rngPolicy,
  ].join('||');

  return {
    key,
    specId: input.specId,
    encounterDuration: input.encounterDuration,
    activeEnemies: input.activeEnemies,
    talentsSignature,
    loadoutSignature,
    aplSignature,
    analysisVersion: ANALYSIS_VERSION,
    rngPolicy,
  };
}
