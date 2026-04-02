/**
 * Enhancement Shaman starter spell and buff catalog.
 *
 * This is intentionally a sourced foundation slice: the entries here cover the
 * core button/buff names, spell ids, and headline cooldown/GCD behavior needed
 * for registry wiring and future action implementation. Detailed damage logic
 * still belongs in Enhancement action classes and DBC-backed spell data.
 */

import { SHARED_PLAYER_BUFFS, SHARED_PLAYER_SPELLS } from '../../shared/player_effects';
import type { BuffDef, SpellDef } from './types';

export type { BuffDef, SpellDef } from './types';
export { spellRequiresGcdReady } from './types';

function createSpell(definition: Partial<SpellDef> & Pick<SpellDef, 'id' | 'name' | 'displayName'>): SpellDef {
  return {
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 0,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
    ...definition,
  };
}

const SPELLS: SpellDef[] = [
  createSpell({ id: 17364, name: 'stormstrike', displayName: 'Stormstrike', cooldown: 7.5, isPhysical: true }),
  createSpell({ id: 60103, name: 'lava_lash', displayName: 'Lava Lash', cooldown: 18, isPhysical: false, talentRequired: 'lava_lash' }),
  createSpell({ id: 187874, name: 'crash_lightning', displayName: 'Crash Lightning', cooldown: 15, isPhysical: false, talentRequired: 'crash_lightning' }),
  createSpell({ id: 195592, name: 'crash_lightning_proc', displayName: 'Crash Lightning', isPhysical: false }),
  createSpell({ id: 1252431, name: 'crash_lightning_unleashed', displayName: 'Crash Lightning', isPhysical: false }),
  createSpell({ id: 384352, name: 'doom_winds', displayName: 'Doom Winds', cooldown: 60, isOnGcd: false, buffApplied: 'doom_winds', buffDuration: 8, talentRequired: 'doom_winds' }),
  createSpell({ id: 469270, name: 'doom_winds_damage', displayName: 'Doom Winds', isPhysical: false }),
  createSpell({ id: 114051, name: 'ascendance', displayName: 'Ascendance', cooldown: 180, buffApplied: 'ascendance', buffDuration: 15, talentRequired: 'ascendance' }),
  createSpell({ id: 344548, name: 'ascendance_damage', displayName: 'Ascendance', isPhysical: false }),
  createSpell({ id: 196884, name: 'feral_lunge', displayName: 'Feral Lunge', cooldown: 30, isPhysical: true }),
  createSpell({ id: 108271, name: 'astral_shift', displayName: 'Astral Shift', cooldown: 90, isOnGcd: false, buffApplied: 'astral_shift', buffDuration: 12, talentRequired: 'astral_shift' }),
  createSpell({ id: 192077, name: 'wind_rush_totem', displayName: 'Wind Rush Totem', cooldown: 120, talentRequired: 'wind_rush_totem' }),
  createSpell({ id: 108287, name: 'totemic_projection', displayName: 'Totemic Projection', cooldown: 10, isOnGcd: false, talentRequired: 'totemic_projection' }),
  // SimC's live Midnight behavior spaces Surging Totem casts at roughly 60s for this profile.
  // Keep trainer spellbook cooldown aligned with the observed SimC action timing until the local spell dump is refreshed.
  createSpell({ id: 444995, name: 'surging_totem', displayName: 'Surging Totem', cooldown: 60, buffApplied: 'surging_totem', buffDuration: 24, talentRequired: 'surging_totem' }),
  createSpell({ id: 455622, name: 'tremor', displayName: 'Tremor', isPhysical: false }),
  createSpell({ id: 458267, name: 'surging_bolt', displayName: 'Surging Bolt', isPhysical: false }),
  createSpell({ id: 390287, name: 'stormblast', displayName: 'Stormblast', isPhysical: false }),
  createSpell({ id: 384444, name: 'thorims_invocation', displayName: 'Thorim\'s Invocation', isPhysical: false, talentRequired: 'thorims_invocation' }),
  createSpell({ id: 188196, name: 'lightning_bolt_ti', displayName: 'Lightning Bolt', isPhysical: false }),
  createSpell({ id: 289874, name: 'ride_the_lightning', displayName: 'Ride the Lightning', isPhysical: false, talentRequired: 'ride_the_lightning' }),
  createSpell({ id: 211094, name: 'chain_lightning_ll_rtl', displayName: 'Chain Lightning', isPhysical: false }),
  createSpell({ id: 211094, name: 'chain_lightning_ss_rtl', displayName: 'Chain Lightning', isPhysical: false }),
  createSpell({ id: 211094, name: 'chain_lightning_ws_rtl', displayName: 'Chain Lightning', isPhysical: false }),
  createSpell({ id: 467283, name: 'sundering_splitstream', displayName: 'Sundering', isPhysical: false, talentRequired: 'splitstream' }),
  createSpell({ id: 467386, name: 'flametongue_attack_imbuement_mastery', displayName: 'Flametongue Attack', isPhysical: false, talentRequired: 'imbuement_mastery' }),
  createSpell({ id: 470057, name: 'voltaic_blaze', displayName: 'Voltaic Blaze', cooldown: 10, talentRequired: 'voltaic_blaze' }),
  createSpell({ id: 452201, name: 'tempest', displayName: 'Tempest', castTime: 2, isPhysical: false, talentRequired: 'tempest' }),
  createSpell({ id: 1218090, name: 'primordial_storm', displayName: 'Primordial Storm', talentRequired: 'primordial_storm' }),
  createSpell({ id: 1218113, name: 'primordial_fire', displayName: 'Primordial Fire', isPhysical: false }),
  createSpell({ id: 1218116, name: 'primordial_frost', displayName: 'Primordial Frost', isPhysical: false }),
  createSpell({ id: 1218118, name: 'primordial_lightning', displayName: 'Primordial Lightning', isPhysical: false }),
  createSpell({ id: 188196, name: 'lightning_bolt_ps', displayName: 'Lightning Bolt', isPhysical: false }),
  createSpell({ id: 188443, name: 'chain_lightning_ps', displayName: 'Chain Lightning', isPhysical: false }),
  createSpell({ id: 188443, name: 'chain_lightning', displayName: 'Chain Lightning', castTime: 2, isPhysical: false, talentRequired: 'chain_lightning' }),
  createSpell({ id: 188196, name: 'lightning_bolt', displayName: 'Lightning Bolt', castTime: 2.5, isPhysical: false }),
  createSpell({ id: 470411, name: 'flame_shock', displayName: 'Flame Shock', cooldown: 6, isPhysical: false }),
  createSpell({ id: 192106, name: 'lightning_shield', displayName: 'Lightning Shield', buffApplied: 'lightning_shield', buffDuration: 3600 }),
  createSpell({ id: 33757, name: 'windfury_weapon', displayName: 'Windfury Weapon', buffApplied: 'windfury_weapon', buffDuration: 3600, talentRequired: 'windfury_weapon' }),
  createSpell({ id: 25504, name: 'windfury_attack', displayName: 'Windfury Attack', isPhysical: true }),
  createSpell({ id: 318038, name: 'flametongue_weapon', displayName: 'Flametongue Weapon', buffApplied: 'flametongue_weapon', buffDuration: 3600, talentRequired: 'flametongue_weapon' }),
  createSpell({ id: 51533, name: 'feral_spirit', displayName: 'Feral Spirit', cooldown: 90, buffApplied: 'feral_spirit', buffDuration: 15, talentRequired: 'feral_spirit' }),
  createSpell({ id: 198455, name: 'alpha_wolf', displayName: 'Alpha Wolf', isPhysical: true }),
  createSpell({ id: 197214, name: 'sundering', displayName: 'Sundering', cooldown: 30, isPhysical: false, talentRequired: 'sundering' }),
  createSpell({ id: 114089, name: 'windlash', displayName: 'Windlash', isPhysical: true }),
  createSpell({ id: 115356, name: 'windstrike', displayName: 'Windstrike', cooldown: 7.5, isPhysical: true }),
];

const BUFFS: BuffDef[] = [
  { id: 'maelstrom_weapon', displayName: 'Maelstrom Weapon', duration: 30, maxStacks: 10, isHarmful: false },
  { id: 'doom_winds', displayName: 'Doom Winds', duration: 8, maxStacks: 1, isHarmful: false },
  { id: 'ascendance', displayName: 'Ascendance', duration: 15, maxStacks: 1, isHarmful: false },
  { id: 'astral_shift', displayName: 'Astral Shift', duration: 12, maxStacks: 1, isHarmful: false },
  { id: 'surging_totem', displayName: 'Surging Totem', duration: 24, maxStacks: 1, isHarmful: false },
  { id: 'crash_lightning', displayName: 'Crash Lightning', duration: 12, maxStacks: 20, isHarmful: false },
  { id: 'converging_storms', displayName: 'Converging Storms', duration: 12, maxStacks: 6, isHarmful: false },
  { id: 'storm_unleashed', displayName: 'Storm Unleashed', duration: 20, maxStacks: 2, isHarmful: false },
  { id: 'tempest', displayName: 'Tempest', duration: 30, maxStacks: 2, isHarmful: false },
  { id: 'stormsurge', displayName: 'Stormsurge', duration: 12, maxStacks: 1, isHarmful: false },
  { id: 'stormblast', displayName: 'Stormblast', duration: 12, maxStacks: 2, isHarmful: false },
  { id: 'voltaic_blaze', displayName: 'Voltaic Blaze', duration: 3600, maxStacks: 1, isHarmful: false },
  { id: 'surging_elements', displayName: 'Surging Elements', duration: 12, maxStacks: 6, isHarmful: false },
  { id: 'hot_hand', displayName: 'Hot Hand', duration: 8, maxStacks: 1, isHarmful: false },
  { id: 'raging_maelstrom', displayName: 'Raging Maelstrom', duration: 30, maxStacks: 1, isHarmful: false },
  { id: 'forceful_winds', displayName: 'Forceful Winds', duration: 15, maxStacks: 5, isHarmful: false },
  { id: 'lightning_shield', displayName: 'Lightning Shield', duration: 3600, maxStacks: 1, isHarmful: false },
  { id: 'flametongue_weapon', displayName: 'Flametongue Weapon', duration: 3600, maxStacks: 1, isHarmful: false },
  { id: 'windfury_weapon', displayName: 'Windfury Weapon', duration: 3600, maxStacks: 1, isHarmful: false },
  { id: 'static_accumulation', displayName: 'Static Accumulation', duration: 15, maxStacks: 1, isHarmful: false },
  { id: 'flame_shock', displayName: 'Flame Shock', duration: 18, maxStacks: 1, isHarmful: true },
  { id: 'lashing_flames', displayName: 'Lashing Flames', duration: 20, maxStacks: 1, isHarmful: true },
  { id: 'feral_spirit', displayName: 'Feral Spirit', duration: 15, maxStacks: 1, isHarmful: false },
  { id: 'earthen_weapon', displayName: 'Earthen Weapon', duration: 15, maxStacks: 30, isHarmful: false },
  { id: 'molten_weapon', displayName: 'Molten Weapon', duration: 15, maxStacks: 30, isHarmful: false },
  { id: 'icy_edge', displayName: 'Icy Edge', duration: 15, maxStacks: 30, isHarmful: false },
  { id: 'crackling_surge', displayName: 'Crackling Surge', duration: 15, maxStacks: 30, isHarmful: false },
  { id: 'primordial_storm', displayName: 'Primordial Storm', duration: 15, maxStacks: 1, isHarmful: false },
  { id: 'amplification_core', displayName: 'Amplification Core', duration: 24, maxStacks: 1, isHarmful: false },
  { id: 'whirling_air', displayName: 'Whirling Air', duration: 24, maxStacks: 1, isHarmful: false },
  { id: 'whirling_fire', displayName: 'Whirling Fire', duration: 24, maxStacks: 1, isHarmful: false },
  { id: 'whirling_earth', displayName: 'Whirling Earth', duration: 24, maxStacks: 1, isHarmful: false },
  { id: 'totemic_rebound', displayName: 'Totemic Rebound', duration: 25, maxStacks: 10, isHarmful: false },
  { id: 'winning_streak', displayName: 'Winning Streak!', duration: 30, maxStacks: 5, isHarmful: false },
  { id: 'electrostatic_wager', displayName: 'Electrostatic Wager', duration: 30, maxStacks: 10, isHarmful: false },
  { id: 'electrostatic_wager_damage', displayName: 'Electrostatic Wager', duration: 30, maxStacks: 5, isHarmful: false },
];

export const SHAMAN_ENHANCEMENT_SPELLS = new Map<string, SpellDef>([
  ...SHARED_PLAYER_SPELLS,
  ...SPELLS.map((spell) => [spell.name, spell] as const),
]);

export const SHAMAN_ENHANCEMENT_BUFFS = new Map<string, BuffDef>([
  ...SHARED_PLAYER_BUFFS,
  ...BUFFS.map((buff) => [buff.id, buff] as const),
]);
