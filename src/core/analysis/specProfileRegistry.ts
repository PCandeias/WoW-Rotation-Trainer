import type { SpecAnalysisProfile } from './types';
import { buildMonkWindwalkerAnalysisProfile } from './monk_windwalker_profile';
import { buildShamanEnhancementAnalysisProfile } from './shaman_enhancement_profile';

export function getAnalysisProfileForSpec(specId: string, talents: ReadonlySet<string>): SpecAnalysisProfile {
  switch (specId) {
    case 'monk_windwalker':
      return buildMonkWindwalkerAnalysisProfile(talents);
    case 'shaman_enhancement':
      return buildShamanEnhancementAnalysisProfile(talents);
    default:
      throw new Error(`No analysis profile registered for spec '${specId}'`);
  }
}

export function getProfileSpecForAnalysisSpecId(specId: string): string {
  switch (specId) {
    case 'monk_windwalker':
      return 'monk';
    case 'shaman_enhancement':
      return 'shaman';
    default:
      throw new Error(`No profile spec registered for analysis spec '${specId}'`);
  }
}
