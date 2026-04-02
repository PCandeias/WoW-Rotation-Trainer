import { MONK_WW_BUFFS } from './spells/monk_windwalker';
import { SHAMAN_ENHANCEMENT_BUFFS } from './spells/shaman_enhancement';
import type { BuffDef } from './spells/types';

const BUFFBOOKS_BY_PROFILE_SPEC = new Map<string, ReadonlyMap<string, BuffDef>>([
  ['monk', MONK_WW_BUFFS],
  ['shaman', SHAMAN_ENHANCEMENT_BUFFS],
]);

export function getBuffbookForProfileSpec(spec: string): ReadonlyMap<string, BuffDef> {
  const buffbook = BUFFBOOKS_BY_PROFILE_SPEC.get(spec);
  if (!buffbook) {
    throw new Error(`No buffbook registered for profile spec '${spec}'`);
  }

  return buffbook;
}
