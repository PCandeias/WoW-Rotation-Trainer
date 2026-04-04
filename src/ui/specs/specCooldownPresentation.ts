import type { CooldownTrackerDefinition } from '@ui/components/CooldownManager';

const MONK_COOLDOWN_DEFINITIONS: Record<string, CooldownTrackerDefinition> = {
  tiger_palm: { spellId: 'tiger_palm', iconName: 'ability_monk_tigerpalm', emoji: '🐯', displayName: 'Tiger Palm' },
  blackout_kick: {
    spellId: 'blackout_kick',
    iconName: 'ability_monk_roundhousekick',
    emoji: '👊',
    displayName: 'Blackout Kick',
    procBuffId: 'combo_breaker',
  },
  spinning_crane_kick: {
    spellId: 'spinning_crane_kick',
    iconName: 'ability_monk_cranekick_new',
    emoji: '🌀',
    displayName: 'Spinning Crane Kick',
    procBuffId: 'dance_of_chi_ji',
  },
  fists_of_fury: { spellId: 'fists_of_fury', iconName: 'monk_ability_fistoffury', emoji: '👊', displayName: 'Fists of Fury' },
  rising_sun_kick: {
    spellId: 'rising_sun_kick',
    iconName: 'ability_monk_risingsunkick',
    emoji: '☀️',
    displayName: 'Rising Sun Kick',
    procBuffId: 'rushing_wind_kick',
    procOverride: {
      buffId: 'rushing_wind_kick',
      spellId: 'rushing_wind_kick',
      iconName: 'inv12_ability_monk_rushingwindkick',
      displayName: 'Rushing Wind Kick',
    },
  },
  whirling_dragon_punch: {
    spellId: 'whirling_dragon_punch',
    iconName: 'ability_monk_hurricanestrike',
    emoji: '🐉',
    displayName: 'Whirling Dragon Punch',
  },
  strike_of_the_windlord: {
    spellId: 'strike_of_the_windlord',
    iconName: 'inv_hand_1h_artifactskywall_d_01',
    emoji: '⚡',
    displayName: 'Strike of the Windlord',
  },
  slicing_winds: { spellId: 'slicing_winds', iconName: 'ability_monk_flyingdragonkick', emoji: '💨', displayName: 'Slicing Winds' },
  zenith: {
    spellId: 'zenith',
    iconName: 'inv_ability_monk_weaponsoforder',
    emoji: '✨',
    displayName: 'Zenith',
    activeBuffId: 'zenith',
  },
  invoke_xuen_the_white_tiger: {
    spellId: 'invoke_xuen_the_white_tiger',
    iconName: 'ability_monk_summontigerstatue',
    emoji: '🐅',
    displayName: 'Invoke Xuen',
  },
  celestial_conduit: {
    spellId: 'celestial_conduit',
    iconName: 'inv_ability_conduitofthecelestialsmonk_celestialconduit',
    emoji: '🌀',
    displayName: 'Celestial Conduit',
  },
  touch_of_death: { spellId: 'touch_of_death', iconName: 'ability_monk_touchofdeath', emoji: '💀', displayName: 'Touch of Death' },
  touch_of_karma: { spellId: 'touch_of_karma', iconName: 'ability_monk_touchofkarma', emoji: '🛡️', displayName: 'Touch of Karma' },
};

const SHAMAN_COOLDOWN_DEFINITIONS: Record<string, CooldownTrackerDefinition> = {
  stormstrike: {
    spellId: 'stormstrike',
    iconName: 'spell_shaman_improvedstormstrike',
    emoji: '⚡',
    displayName: 'Stormstrike',
    cooldownQuerySpellId: 'strike',
    defaultMaxCharges: 2,
    procBuffId: 'stormsurge',
    procOverride: {
      buffId: 'ascendance',
      spellId: 'windstrike',
      cooldownQuerySpellId: 'strike',
      defaultMaxCharges: 2,
      iconName: 'spell_shaman_windstrike',
      displayName: 'Windstrike',
    },
  },
  lava_lash: { spellId: 'lava_lash', iconName: 'ability_shaman_lavalash', emoji: '🔥', displayName: 'Lava Lash', procBuffId: 'hot_hand' },
  crash_lightning: { spellId: 'crash_lightning', iconName: 'spell_shaman_crashlightning', emoji: '⚡', displayName: 'Crash Lightning' },
  chain_lightning: { spellId: 'chain_lightning', iconName: 'spell_nature_chainlightning', emoji: '🌩️', displayName: 'Chain Lightning' },
  lightning_bolt: {
    spellId: 'lightning_bolt',
    iconName: 'spell_nature_lightning',
    emoji: '⚡',
    displayName: 'Lightning Bolt',
    procOverride: {
      buffId: 'tempest',
      spellId: 'tempest',
      iconName: 'inv_ability_stormcallershaman_tempest',
      displayName: 'Tempest',
    },
  },
  voltaic_blaze: { spellId: 'voltaic_blaze', iconName: 'inv_10_dungeonjewelry_primalist_trinket_1ragingelement_fire', emoji: '⚡', displayName: 'Voltaic Blaze' },
  feral_spirit: { spellId: 'feral_spirit', iconName: 'spell_shaman_feralspirit', emoji: '🐺', displayName: 'Feral Spirit' },
  surging_totem: { spellId: 'surging_totem', iconName: 'inv_ability_totemicshaman_surgingtotem', emoji: '🗿', displayName: 'Surging Totem' },
  doom_winds: { spellId: 'doom_winds', iconName: 'ability_ironmaidens_swirlingvortex', emoji: '🌪️', displayName: 'Doom Winds' },
  ascendance: { spellId: 'ascendance', iconName: 'spell_fire_elementaldevastation', emoji: '⬆️', displayName: 'Ascendance' },
  sundering: {
    spellId: 'sundering',
    iconName: 'ability_rhyolith_lavapool',
    emoji: '🌋',
    displayName: 'Sundering',
    procOverride: {
      buffId: 'primordial_storm',
      spellId: 'primordial_storm',
      iconName: 'ability_shaman_ascendance',
      displayName: 'Primordial Storm',
    },
  },
  feral_lunge: { spellId: 'feral_lunge', iconName: 'spell_beastmaster_wolf', emoji: '🐾', displayName: 'Feral Lunge' },
  astral_shift: { spellId: 'astral_shift', iconName: 'ability_shaman_astralshift', emoji: '🛡️', displayName: 'Astral Shift', activeBuffId: 'astral_shift' },
  wind_rush_totem: { spellId: 'wind_rush_totem', iconName: 'ability_shaman_windwalktotem', emoji: '💨', displayName: 'Wind Rush Totem' },
  totemic_projection: { spellId: 'totemic_projection', iconName: 'ability_shaman_totemrelocation', emoji: '🗿', displayName: 'Totemic Projection' },
  bloodlust: { spellId: 'bloodlust', iconName: 'spell_nature_bloodlust', emoji: '⚡', displayName: 'Bloodlust' },
};

const COOLDOWN_DEFINITIONS_BY_PROFILE_SPEC = new Map<string, Readonly<Record<string, CooldownTrackerDefinition>>>([
  ['monk', MONK_COOLDOWN_DEFINITIONS],
  ['shaman', SHAMAN_COOLDOWN_DEFINITIONS],
]);

export function getCooldownTrackerDefinitionsForProfileSpec(
  profileSpec: string,
): Readonly<Record<string, CooldownTrackerDefinition>> {
  const definitions = COOLDOWN_DEFINITIONS_BY_PROFILE_SPEC.get(profileSpec);
  if (!definitions) {
    throw new Error(`No cooldown tracker definitions registered for profile spec '${profileSpec}'`);
  }

  return definitions;
}
