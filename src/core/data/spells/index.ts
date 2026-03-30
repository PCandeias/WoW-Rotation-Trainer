/**
 * Spell database exports.
 */

export { MONK_WW_SPELLS, MONK_WW_BUFFS } from './monk_windwalker';
export type {
  SpellDef,
  BuffDef,
  AutoAttackInterruptionMode,
  AutoAttackInterruptionPolicy,
} from './types';
export { spellRequiresGcdReady } from './types';
export { spellUsableDuringCurrentGcd } from './types';
