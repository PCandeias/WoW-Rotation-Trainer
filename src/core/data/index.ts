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
  DEFAULT_MONK_WINDWALKER_APL_TALENT_STRING,
  decodeMonkWindwalkerTalentString,
  decodeTalentLoadoutState,
  decodeTalentLoadoutString,
  getMonkWindwalkerTalentCatalog,
  getTalentCatalog,
  MONK_WINDWALKER_TALENT_LOADOUT,
  type DecodedTalent,
  type DecodedTalentTree,
  type HeroTalentChoiceDefinition,
  type MonkWindwalkerTalentNodeDefinition,
  type TalentLoadoutDefinition,
  type TalentTreeDefinition,
} from './talentStringDecoder';

export { MONK_WW_SPELLS, MONK_WW_BUFFS } from './spells/monk_windwalker';
export type { SpellDef, BuffDef } from './spells/monk_windwalker';
