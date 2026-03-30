export interface TrackerCatalogEntry {
  id: string;
  spellId?: number;
  iconName?: string;
  emoji: string;
  displayName: string;
  supportsProcGlow?: boolean;
}

export const ESSENTIAL_COOLDOWN_TRACKERS: readonly TrackerCatalogEntry[] = [
  { id: 'tiger_palm', iconName: 'ability_monk_tigerpalm', emoji: '🐯', displayName: 'Tiger Palm' },
  { id: 'blackout_kick', iconName: 'ability_monk_roundhousekick', emoji: '👊', displayName: 'Blackout Kick', supportsProcGlow: true },
  { id: 'spinning_crane_kick', iconName: 'ability_monk_cranekick_new', emoji: '🌀', displayName: 'Spinning Crane Kick', supportsProcGlow: true },
  { id: 'fists_of_fury', iconName: 'monk_ability_fistoffury', emoji: '👊', displayName: 'Fists of Fury', supportsProcGlow: true },
  { id: 'rising_sun_kick', iconName: 'ability_monk_risingsunkick', emoji: '☀️', displayName: 'Rising Sun Kick', supportsProcGlow: true },
  { id: 'whirling_dragon_punch', iconName: 'ability_monk_hurricanestrike', emoji: '🐉', displayName: 'Whirling Dragon Punch', supportsProcGlow: true },
  { id: 'strike_of_the_windlord', iconName: 'inv_hand_1h_artifactskywall_d_01', emoji: '⚡', displayName: 'Strike of the Windlord', supportsProcGlow: true },
  { id: 'slicing_winds', iconName: 'ability_monk_flyingdragonkick', emoji: '💨', displayName: 'Slicing Winds', supportsProcGlow: true },
  { id: 'zenith', spellId: 1249625, iconName: 'inv_ability_monk_weaponsoforder', emoji: '✨', displayName: 'Zenith' },
  { id: 'invoke_xuen_the_white_tiger', iconName: 'ability_monk_summontigerstatue', emoji: '🐅', displayName: 'Invoke Xuen' },
  { id: 'celestial_conduit', iconName: 'inv_ability_conduitofthecelestialsmonk_celestialconduit', emoji: '🌀', displayName: 'Celestial Conduit' },
];

export const UTILITY_COOLDOWN_TRACKERS: readonly TrackerCatalogEntry[] = [
  { id: 'touch_of_death', iconName: 'ability_monk_touchofdeath', emoji: '💀', displayName: 'Touch of Death' },
  { id: 'touch_of_karma', iconName: 'ability_monk_touchofkarma', emoji: '🛡️', displayName: 'Touch of Karma' },
];

export const BUFF_TRACKERS: readonly TrackerCatalogEntry[] = [
  { id: 'zenith', spellId: 1249625, iconName: 'inv_ability_monk_weaponsoforder', emoji: '✨', displayName: 'Zenith' },
  { id: 'hit_combo', spellId: 196741, iconName: 'ability_monk_palmstrike', emoji: '🔗', displayName: 'Hit Combo' },
  { id: 'combo_strikes', iconName: 'ability_monk_palmstrike', emoji: '🥋', displayName: 'Combo Strikes' },
  { id: 'blackout_reinforcement', iconName: 'ability_monk_roundhousekick', emoji: '👊', displayName: 'Blackout Kick!', supportsProcGlow: true },
  { id: 'dance_of_chi_ji', iconName: 'ability_monk_quitornado', emoji: '🌀', displayName: 'Dance of Chi-Ji', supportsProcGlow: true },
  { id: 'rushing_wind_kick', spellId: 467307, iconName: 'inv12_ability_monk_rushingwindkick', emoji: '🌪️', displayName: 'Rushing Wind Kick', supportsProcGlow: true },
  { id: 'flurry_charge', iconName: 'inv_ability_shadopanmonk_flurrystrikes', emoji: '💨', displayName: 'Flurry Charges' },
  { id: 'memory_of_the_monastery', iconName: 'ability_monk_tigerpalm', emoji: '🐯', displayName: 'Memory of the Monastery' },
  { id: 'teachings_of_the_monastery', iconName: 'passive_monk_teachingsofmonastery', emoji: '📖', displayName: 'Teachings of the Monastery' },
  { id: 'stand_ready', iconName: 'ability_monk_tigerpalm', emoji: '🐯', displayName: 'Stand Ready' },
  { id: 'pressure_point', iconName: 'monk_ability_fistoffury', emoji: '👊', displayName: 'Pressure Point' },
  { id: 'combat_wisdom', iconName: 'ability_monk_tigerpalm', emoji: '📖', displayName: 'Combat Wisdom' },
  { id: 'momentum_boost', spellId: 451298, iconName: 'inv_belt_leather_raidmonk_n_01', emoji: '⚡', displayName: 'Momentum Boost' },
  { id: 'whirling_dragon_punch', iconName: 'ability_monk_hurricanestrike', emoji: '🐉', displayName: 'Whirling Dragon Punch' },
  { id: 'celestial_conduit_active', iconName: 'inv_ability_conduitofthecelestialsmonk_celestialconduit', emoji: '🌀', displayName: 'Celestial Conduit' },
  { id: 'tigereye_brew_1', iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'Tigereye Brew' },
  { id: 'tigereye_brew_3', iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'Tigereye Brew (FoF)' },
  { id: 'zenith_teb_crit', iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'TEB Zenith Crit' },
];

export const CONSUMABLE_TRACKERS: readonly TrackerCatalogEntry[] = [
  { id: 'berserking', spellId: 26297, iconName: 'racial_troll_berserk', emoji: '🔴', displayName: 'Berserking' },
  { id: 'algethar_puzzle', spellId: 193701, iconName: 'inv_misc_enggizmos_18', emoji: '💎', displayName: "Algeth'ar Puzzle Box" },
  { id: 'potion', iconName: 'inv_12_profession_alchemy_voidpotion_red', emoji: '🧪', displayName: 'Potion' },
];

export function getCatalogEntryIds(entries: readonly TrackerCatalogEntry[]): string[] {
  return entries.map((entry) => entry.id);
}
