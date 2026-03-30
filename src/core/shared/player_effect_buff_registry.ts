type BuffRegistry = Record<string, {
  iconName?: string;
  emoji?: string;
  displayName?: string;
  hideTimer?: boolean;
}>;

export const PLAYER_EFFECT_BUFF_REGISTRY: BuffRegistry = {
  bloodlust: { iconName: 'spell_nature_bloodlust', emoji: '⚡', displayName: 'Bloodlust' },
  battle_shout: { iconName: 'ability_warrior_battleshout', emoji: '🗣️', displayName: 'Battle Shout', hideTimer: true },
  arcane_intellect: { iconName: 'spell_holy_magicalsentry', emoji: '✨', displayName: 'Arcane Intellect', hideTimer: true },
  mark_of_the_wild: { iconName: 'spell_nature_regeneration', emoji: '🌿', displayName: 'Mark of the Wild', hideTimer: true },
  power_word_fortitude: { iconName: 'spell_holy_wordfortitude', emoji: '🛡️', displayName: 'Power Word: Fortitude', hideTimer: true },
  skyfury: { iconName: 'achievement_raidprimalist_windelemental', emoji: '🌪️', displayName: 'Skyfury', hideTimer: true },
  berserking: { iconName: 'racial_troll_berserk', emoji: '🔴', displayName: 'Berserking' },
  blood_fury: { iconName: 'racial_orc_berserkerstrength', emoji: '🩸', displayName: 'Blood Fury' },
  algethar_puzzle: { iconName: 'inv_misc_enggizmos_18', emoji: '💎', displayName: 'Trinket' },
  potion_of_recklessness_haste: { iconName: 'inv_12_profession_alchemy_voidpotion_red', emoji: '⚗️', displayName: 'Potion of Recklessness' },
  potion_of_recklessness_penalty_vers: { iconName: 'inv_12_profession_alchemy_voidpotion_red', emoji: '⚗️', displayName: 'Recklessness Penalty' },
  // Embellishment / trinket proc buffs
  hasty_hunt:                   { iconName: 'inv_eyeofnzothpet',                                       emoji: '🎯', displayName: 'Hasty Hunt' },
  focused_hunt:                 { iconName: 'inv_eyeofnzothpet',                                       emoji: '🎯', displayName: 'Focused Hunt' },
  masterful_hunt:               { iconName: 'inv_eyeofnzothpet',                                       emoji: '🎯', displayName: 'Masterful Hunt' },
  versatile_hunt:               { iconName: 'inv_eyeofnzothpet',                                       emoji: '🎯', displayName: 'Versatile Hunt' },
  alnsight:                     { iconName: 'inv_12_trinket_raid_dreamrift_gazeofthealnseer',           emoji: '👁️', displayName: 'Alnsight' },
  alnscorned_essence:           { iconName: 'inv_azerite_area_denial',                                 emoji: '💠', displayName: 'Alnscorned Essence' },
  precision_of_the_dragonhawk: { iconName: 'inv_dragonhawk2_pink',                                    emoji: '🦅', displayName: 'Precision of the Dragonhawk' },
  blessing_of_the_capybara:     { iconName: 'inv_capybara_orange',                                     emoji: '🦫', displayName: 'Blessing of the Capybara' },
  akilzons_cry_of_victory:      { iconName: 'artifactability_survivalhunter_eaglesbite',               emoji: '🦅', displayName: "Akil'zon's Cry of Victory" },
};
