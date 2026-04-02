import { MONK_WW_SPELLS } from './spells/monk_windwalker';
import { SHAMAN_ENHANCEMENT_SPELLS } from './spells/shaman_enhancement';
import type { SpellDef } from './spells/monk_windwalker';

const SPELLBOOKS_BY_PROFILE_SPEC = new Map<string, ReadonlyMap<string, SpellDef>>([
  ['monk', MONK_WW_SPELLS],
  ['shaman', SHAMAN_ENHANCEMENT_SPELLS],
]);

export function getSpellbookForProfileSpec(spec: string): ReadonlyMap<string, SpellDef> {
  const spellbook = SPELLBOOKS_BY_PROFILE_SPEC.get(spec);
  if (!spellbook) {
    throw new Error(`No spellbook registered for profile spec '${spec}'`);
  }

  return spellbook;
}
