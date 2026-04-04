import type { ActionBarSlotDef } from '@ui/specs/actionBarTypes';

/**
 * Default action-bar slot definitions for Enhancement Shaman.
 *
 * Each entry describes one logical button: which spell it maps to, what
 * keybind it defaults to, total cooldown for display, and optional
 * proc-override / proc-glow / talent metadata.
 */
export const ENHANCEMENT_ACTION_BAR: ActionBarSlotDef[] = [
  {
    spellId: 'stormstrike',
    defaultKey: '1',
    cdTotal: 8,
    cooldownQuerySpellId: 'strike',
    defaultMaxCharges: 2,
    procOverride: { buffId: 'ascendance', spellId: 'windstrike', cooldownQuerySpellId: 'strike', defaultMaxCharges: 2 },
    procGlow: { buffId: 'stormsurge' },
  },
  { spellId: 'lava_lash',          defaultKey: '2', cdTotal: 18, talentRequired: 'lava_lash', procGlow: { buffId: 'hot_hand' } },
  {
    spellId: 'flame_shock',
    defaultKey: '3',
    cdTotal: 6,
    talentExcluded: 'voltaic_blaze',
  },
  { spellId: 'voltaic_blaze',     defaultKey: '3', cdTotal: 10, talentRequired: 'voltaic_blaze', replacesSpellId: 'flame_shock' },
  {
    spellId: 'lightning_bolt',
    defaultKey: '4',
    cdTotal: 0,
    procGlow: { buffId: 'maelstrom_weapon' },
    procOverride: { buffId: 'tempest', spellId: 'tempest' },
  },
  { spellId: 'crash_lightning',    defaultKey: '5', cdTotal: 15, talentRequired: 'crash_lightning' },
  { spellId: 'chain_lightning',    defaultKey: '6', cdTotal: 0, talentRequired: 'chain_lightning', procGlow: { buffId: 'maelstrom_weapon' } },
  {
    spellId: 'sundering',
    defaultKey: '7',
    cdTotal: 30,
    talentRequired: 'sundering',
    procOverride: { buffId: 'primordial_storm', spellId: 'primordial_storm' },
  },
  { spellId: 'feral_spirit',       defaultKey: '8', cdTotal: 90, talentRequired: 'feral_spirit' },
  { spellId: 'surging_totem',      defaultKey: '9', cdTotal: 60, talentRequired: 'surging_totem' },
  { spellId: 'doom_winds',         defaultKey: '0', cdTotal: 60, talentRequired: 'doom_winds', isOffGcd: true },
  { spellId: 'ascendance',         defaultKey: '-', cdTotal: 180, talentRequired: 'ascendance' },
  { spellId: 'feral_lunge',        defaultKey: '=', cdTotal: 30 },
  { spellId: 'astral_shift',       defaultKey: '[', cdTotal: 90, talentRequired: 'astral_shift' },
  { spellId: 'wind_rush_totem',    defaultKey: ']', cdTotal: 120, talentRequired: 'wind_rush_totem' },
  { spellId: 'totemic_projection', defaultKey: '\\', cdTotal: 10, talentRequired: 'totemic_projection' },
  { spellId: 'bloodlust',          defaultKey: ';', cdTotal: 600 },
  { spellId: 'blood_fury',         defaultKey: '\'', cdTotal: 120, isOffGcd: true },
  { spellId: 'potion',             defaultKey: 'shift+1', cdTotal: 300, isOffGcd: true },
];
