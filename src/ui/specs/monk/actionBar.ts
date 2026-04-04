import type { ActionBarSlotDef } from '@ui/specs/actionBarTypes';

/**
 * Default action-bar slot definitions for Windwalker Monk.
 *
 * Each entry describes one logical button: which spell it maps to, what
 * keybind it defaults to, total cooldown for display, and optional
 * proc-override / proc-glow metadata.
 */
export const WW_ACTION_BAR: ActionBarSlotDef[] = [
  { spellId: 'tiger_palm',             defaultKey: '1', cdTotal: 0 },
  { spellId: 'blackout_kick',          defaultKey: '2', cdTotal: 0,   procGlow: { buffId: 'combo_breaker' } },
  { spellId: 'rising_sun_kick',        defaultKey: '3', cdTotal: 10,  procOverride: { buffId: 'rushing_wind_kick', spellId: 'rushing_wind_kick' } },
  { spellId: 'fists_of_fury',          defaultKey: '4', cdTotal: 20 },
  { spellId: 'whirling_dragon_punch',  defaultKey: '5', cdTotal: 13,  talentRequired: 'whirling_dragon_punch' },
  { spellId: 'strike_of_the_windlord', defaultKey: '6', cdTotal: 40,  talentRequired: 'strike_of_the_windlord' },
  { spellId: 'zenith',                 defaultKey: '7', cdTotal: 90,  talentRequired: 'zenith', isOffGcd: true, activeBuffId: 'zenith' },
  { spellId: 'spinning_crane_kick',    defaultKey: '8', cdTotal: 0,   procGlow: { buffId: 'dance_of_chi_ji' } },
  { spellId: 'slicing_winds',          defaultKey: '9', cdTotal: 30,  talentRequired: 'slicing_winds' },
  { spellId: 'touch_of_death',         defaultKey: ']', cdTotal: 180 },
  { spellId: 'touch_of_karma',         defaultKey: '=', cdTotal: 90 },
  { spellId: 'berserking',             defaultKey: '0', cdTotal: 180, isOffGcd: true },
  { spellId: 'algethar_puzzle_box',    defaultKey: '-', cdTotal: 120 },
  { spellId: 'potion',                 defaultKey: '[', cdTotal: 300, isOffGcd: true },
];
