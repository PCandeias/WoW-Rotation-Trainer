/**
 * Data module.
 * Exposes spell databases, APL files, and profile parsers.
 */

export { parseSpellDataDump, type SpellRecord } from './spellDataParser';
export {
  parseProfile,
  WW_SHADO_PAN_TALENTS,
  type CharacterProfile,
  type CharacterStats,
  type GearEffect,
  type TalentSet,
} from './profileParser';

export {
  getDefaultProfileForSpec,
  getDefaultMonkWindwalkerProfile,
  resolveCharacterStatsWithTrainerDefaults,
} from './defaultProfile';

export {
  DEFAULT_MONK_WINDWALKER_APL_TALENT_STRING,
  DEFAULT_SHAMAN_ENHANCEMENT_APL_TALENT_STRING,
  decodeTalentStringForProfileSpec,
  decodeMonkWindwalkerTalentString,
  decodeShamanEnhancementTalentString,
  decodeTalentLoadoutState,
  decodeTalentLoadoutString,
  getTalentCatalogForProfileSpec,
  getMonkWindwalkerTalentCatalog,
  getTalentLoadoutForProfileSpec,
  getTalentCatalog,
  MONK_WINDWALKER_TALENT_LOADOUT,
  SHAMAN_ENHANCEMENT_TALENT_LOADOUT,
  type DecodedTalent,
  type DecodedTalentTree,
  type GeneratedSimcTalentLoadoutMetadata,
  type HeroTalentChoiceDefinition,
  type TalentNodeDefinition,
  type MonkWindwalkerTalentNodeDefinition,
  type TalentLoadoutDefinition,
  type TalentTreeDefinition,
} from './talentStringDecoder';

export { MONK_WW_SPELLS, MONK_WW_BUFFS } from './spells/monk_windwalker';
export type { SpellDef, BuffDef } from './spells/monk_windwalker';
export { getSpellbookForProfileSpec } from './specSpellbook';
export { getBuffbookForProfileSpec } from './specBuffbook';
