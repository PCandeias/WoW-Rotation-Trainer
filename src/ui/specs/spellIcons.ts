/**
 * Icon and emoji metadata for every spell shown in the trainer UI.
 *
 * SpellDef lacks iconName/emoji fields, so this catalog fills that gap.
 * Keyed by spell name (matching SpellDef.name / ActionBarSlotDef.spellId).
 */
export const SPELL_ICONS: Record<string, { iconName: string; emoji: string }> = {
  // Monk — Windwalker
  tiger_palm:                 { iconName: 'ability_monk_tigerpalm',                                          emoji: '🐯' },
  blackout_kick:              { iconName: 'ability_monk_roundhousekick',                                    emoji: '👊' },
  rising_sun_kick:            { iconName: 'ability_monk_risingsunkick',                                     emoji: '☀️' },
  teachings_of_the_monastery: { iconName: 'passive_monk_teachingsofmonastery',                              emoji: '📖' },
  fists_of_fury:              { iconName: 'monk_ability_fistoffury',                                        emoji: '👊' },
  whirling_dragon_punch:      { iconName: 'ability_monk_hurricanestrike',                                   emoji: '🐉' },
  strike_of_the_windlord:     { iconName: 'inv_hand_1h_artifactskywall_d_01',                               emoji: '⚡' },
  zenith:                     { iconName: 'inv_ability_monk_weaponsoforder',                                emoji: '✨' },
  momentum_boost:             { iconName: 'inv_belt_leather_raidmonk_n_01',                                 emoji: '⚡' },
  momentum_boost_damage:      { iconName: 'inv_belt_leather_raidmonk_n_01',                                 emoji: '⚡' },
  momentum_boost_speed:       { iconName: 'inv_belt_leather_raidmonk_n_01',                                 emoji: '⚡' },
  spinning_crane_kick:        { iconName: 'ability_monk_cranekick_new',                                     emoji: '🌀' },
  touch_of_death:             { iconName: 'ability_monk_touchofdeath',                                      emoji: '💀' },
  slicing_winds:              { iconName: 'ability_monk_flyingdragonkick',                                  emoji: '💨' },
  touch_of_karma:             { iconName: 'ability_monk_touchofkarma',                                      emoji: '🛡️' },
  rushing_wind_kick:          { iconName: 'inv12_ability_monk_rushingwindkick',                             emoji: '🌪️' },

  // Shaman — Enhancement
  stormstrike:                { iconName: 'spell_shaman_improvedstormstrike',                               emoji: '⚡' },
  windstrike:                 { iconName: 'spell_shaman_windstrike',                                        emoji: '🌩️' },
  lava_lash:                  { iconName: 'ability_shaman_lavalash',                                        emoji: '🔥' },
  flame_shock:                { iconName: 'spell_fire_flameshock',                                          emoji: '🔥' },
  voltaic_blaze:              { iconName: 'inv_10_dungeonjewelry_primalist_trinket_1ragingelement_fire',    emoji: '⚡' },
  lightning_bolt:             { iconName: 'spell_nature_lightning',                                         emoji: '⚡' },
  chain_lightning:            { iconName: 'spell_nature_chainlightning',                                    emoji: '🌩️' },
  crash_lightning:            { iconName: 'spell_shaman_crashlightning',                                    emoji: '💥' },
  feral_spirit:               { iconName: 'spell_shaman_feralspirit',                                       emoji: '🐺' },
  sundering:                  { iconName: 'ability_rhyolith_lavapool',                                      emoji: '🌋' },
  ascendance:                 { iconName: 'spell_fire_elementaldevastation',                                emoji: '🌪️' },
  doom_winds:                 { iconName: 'ability_ironmaidens_swirlingvortex',                             emoji: '🌪️' },
  surging_totem:              { iconName: 'inv_ability_totemicshaman_surgingtotem',                         emoji: '🗿' },
  feral_lunge:                { iconName: 'spell_beastmaster_wolf',                                         emoji: '🐾' },
  astral_shift:               { iconName: 'ability_shaman_astralshift',                                     emoji: '🛡️' },
  wind_rush_totem:            { iconName: 'ability_shaman_windwalktotem',                                   emoji: '💨' },
  totemic_projection:         { iconName: 'ability_shaman_totemrelocation',                                 emoji: '🗿' },
  tempest:                    { iconName: 'inv_ability_stormcallershaman_tempest',                          emoji: '🌩️' },
  primordial_storm:           { iconName: 'ability_shaman_ascendance',                                      emoji: '🌩️' },
  windfury_weapon:            { iconName: 'spell_nature_cyclone',                                           emoji: '💨' },
  flametongue_weapon:         { iconName: 'spell_fire_flametounge',                                         emoji: '🔥' },
  hot_hand:                   { iconName: 'spell_fire_playingwithfire',                                     emoji: '🔥' },
  storm_unleashed:            { iconName: 'inv12_apextalent_shaman_stormunleashed',                         emoji: '🌩️' },
  bloodlust:                  { iconName: 'spell_nature_bloodlust',                                         emoji: '⚡' },
  blood_fury:                 { iconName: 'racial_orc_berserkerstrength',                                   emoji: '🩸' },

  // Shared / consumables
  berserking:                 { iconName: 'racial_troll_berserk',                                           emoji: '🔴' },
  potion:                     { iconName: 'inv_12_profession_alchemy_voidpotion_red',                       emoji: '🧪' },
  algethar_puzzle_box:        { iconName: 'inv_misc_enggizmos_18',                                          emoji: '💎' },
};
