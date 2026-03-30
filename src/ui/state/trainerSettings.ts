import { useCallback, useState } from 'react';
import { cloneLoadout, type CharacterLoadout } from '@core/data/loadout';
import { WW_ACTION_BAR } from '@ui/components/ActionBar';

export type TrainerSpecId = 'monk-windwalker';
export type TrainerMode = 'practice' | 'test' | 'tutorial' | 'challenge';
export type ChallengeDifficulty = 'easy' | 'hard';
export type PracticeSpeedMultiplier = 0.25 | 0.5 | 0.75 | 1;
export type ChallengeDisappearSpeedMultiplier = 0.5 | 1 | 2 | 3;
export type EncounterPreset = 'fight30' | 'fight90' | 'fight180' | 'fight300' | 'fight600';
export const ENCOUNTER_PRESET_OPTIONS = [
  { value: 'fight30', label: '30 sec', seconds: 30 },
  { value: 'fight90', label: '1 min 30', seconds: 90 },
  { value: 'fight180', label: '3 min', seconds: 180 },
  { value: 'fight300', label: '5 min', seconds: 300 },
  { value: 'fight600', label: '10 min', seconds: 600 },
] as const satisfies readonly { value: EncounterPreset; label: string; seconds: number }[];
export const ACTION_BAR_IDS = ['bar1', 'bar2', 'bar3', 'bar4', 'bar5'] as const;
export type ActionBarId = (typeof ACTION_BAR_IDS)[number];
export const DEFAULT_CHALLENGE_VALID_KEYS = ['w', 'a', 's', 'd'] as const;

export interface ChallengeSettings {
  difficulty: ChallengeDifficulty;
  validKeys: string[];
  disappearSpeedMultiplier: ChallengeDisappearSpeedMultiplier;
}

export interface TrackerEntrySettings {
  glowWhenReady: boolean;
  disableProcGlow: boolean;
  cooldownGroup?: 'essential' | 'utility';
}

export interface TrackerGroupSettings {
  enabled: boolean;
  blacklistSpellIds: number[];
  trackedSpellIds: number[];
  trackedEntryIds: string[];
  displayMode?: 'icons' | 'bars';
  iconsPerRow?: number;
  entryOptions: Record<string, TrackerEntrySettings>;
}

export interface HudSettings {
  layout: HudLayoutSettings;
  general: {
    showEnemyIcon: boolean;
    showMeleeSwingDamage: boolean;
    showDamageText: boolean;
    layoutScale?: number;
  };
  cooldowns: {
    essential: TrackerGroupSettings;
    utility: TrackerGroupSettings;
  };
  buffs: {
    iconTracker: TrackerGroupSettings;
    barTracker: TrackerGroupSettings;
  };
  targetDebuffs: TrackerGroupSettings;
  consumables: TrackerGroupSettings;
}

export interface HudGroupLayout {
  xPct: number;
  yPct: number;
  scale: number;
}

export interface HudLayoutSettings {
  enemyIcon: HudGroupLayout;
  essentialCooldowns: HudGroupLayout;
  utilityCooldowns: HudGroupLayout;
  buffIcons: HudGroupLayout;
  buffBars: HudGroupLayout;
  consumables: HudGroupLayout;
  challengePlayfield: HudGroupLayout;
  playerFrame: HudGroupLayout;
  resourceFrame: HudGroupLayout;
  targetFrame: HudGroupLayout;
  castBar: HudGroupLayout;
  actionBar1: HudGroupLayout;
  actionBar2: HudGroupLayout;
  actionBar3: HudGroupLayout;
  actionBar4: HudGroupLayout;
  actionBar5: HudGroupLayout;
}

export interface ActionBarButtonSettings {
  spellIds: string[];
  keybind: string;
}

export interface ActionBarConfig {
  enabled: boolean;
  buttonCount: number;
  buttonsPerRow: number;
  buttons: ActionBarButtonSettings[];
}

export interface ActionBarSettings {
  bars: Record<ActionBarId, ActionBarConfig>;
}

export interface AudioSettings {
  musicVolume: number;
}

/**
 * Persisted trainer configuration shared between the setup flow and the encounter.
 *
 * `loadout` matches `CharacterLoadout` only: consumables, gear, and external buffs.
 * Talent state remains separate so the final runtime `CharacterProfile` mirrors the
 * current engine contract.
 */
export interface TrainerSettings {
  selectedSpec: TrainerSpecId;
  mode: TrainerMode;
  practiceSpeedMultiplier: PracticeSpeedMultiplier;
  challenge: ChallengeSettings;
  encounterPreset: EncounterPreset;
  audio: AudioSettings;
  talents: string[];
  talentRanks: Record<string, number>;
  loadout: CharacterLoadout;
  hud: HudSettings;
  actionBars: ActionBarSettings;
}

const STORAGE_KEY = 'wow_trainer_settings';
const LEGACY_KEYBINDS_STORAGE_KEY = 'wow_trainer_keybinds';

export type TrainerSettingsUpdater = TrainerSettings | ((current: TrainerSettings) => TrainerSettings);

function createDefaultTrackerGroupSettings(
  displayMode?: 'icons' | 'bars',
  enabled = true,
  trackedEntryIds: string[] = [],
  iconsPerRow = 12,
): TrackerGroupSettings {
  return {
    enabled,
    blacklistSpellIds: [],
    trackedSpellIds: [],
    trackedEntryIds,
    displayMode,
    iconsPerRow,
    entryOptions: {},
  };
}

export function getDefaultHudLayoutSettings(): HudLayoutSettings {
  return {
    enemyIcon: { xPct: 50, yPct: 9.933406565357117, scale: 1 },
    essentialCooldowns: { xPct: 50, yPct: 72.56532066508314, scale: 1 },
    utilityCooldowns: { xPct: 50, yPct: 84.93340402504825, scale: 1 },
    buffIcons: { xPct: 50, yPct: 54.513064133016634, scale: 1 },
    buffBars: { xPct: 62.047244094488185, yPct: 45.72446555819478, scale: 1 },
    consumables: { xPct: 38.79265091863517, yPct: 72.56532066508314, scale: 1 },
    challengePlayfield: { xPct: 50, yPct: 39, scale: 1 },
    playerFrame: { xPct: 33.43832020997375, yPct: 62.871222552358866, scale: 1 },
    resourceFrame: { xPct: 50, yPct: 62.871222552358866, scale: 1 },
    targetFrame: { xPct: 66.4, yPct: 61, scale: 1 },
    castBar: { xPct: 50, yPct: 79.3562676989669, scale: 1 },
    actionBar1: { xPct: 50, yPct: 95, scale: 1 },
    actionBar2: { xPct: 50, yPct: 90.8, scale: 1 },
    actionBar3: { xPct: 76.81102362204724, yPct: 81.89157994148229, scale: 1 },
    actionBar4: { xPct: 76.81102362204724, yPct: 75.48662946590332, scale: 1 },
    actionBar5: { xPct: 76.81102362204724, yPct: 69.35866983372921, scale: 1 },
  };
}

function createDefaultActionButtons(spellIds: readonly string[]): ActionBarButtonSettings[] {
  return Array.from({ length: 12 }, (_, index) => ({
    spellIds: spellIds[index] ? [spellIds[index]] : [],
    keybind: WW_ACTION_BAR[index]?.defaultKey ?? '',
  }));
}

function createActionBarConfig(
  spellIds: readonly string[],
  enabled: boolean,
  buttonCount: number,
  buttonsPerRow: number,
): ActionBarConfig {
  return {
    enabled,
    buttonCount,
    buttonsPerRow,
    buttons: createDefaultActionButtons(spellIds),
  };
}

function createDefaultActionBarSettings(): ActionBarSettings {
  return {
    bars: {
      bar1: {
        enabled: true,
        buttonCount: 10,
        buttonsPerRow: 10,
        buttons: [
          { spellIds: ['tiger_palm'], keybind: '1' },
          { spellIds: ['blackout_kick'], keybind: '2' },
          { spellIds: ['rising_sun_kick'], keybind: '3' },
          { spellIds: ['fists_of_fury'], keybind: '4' },
          { spellIds: ['whirling_dragon_punch'], keybind: 'm5' },
          { spellIds: ['strike_of_the_windlord'], keybind: '6' },
          { spellIds: ['zenith'], keybind: 'ctrl+1' },
          { spellIds: ['spinning_crane_kick'], keybind: 'c' },
          { spellIds: ['slicing_winds'], keybind: '9' },
          { spellIds: ['touch_of_death'], keybind: ']' },
          { spellIds: ['touch_of_karma'], keybind: 'shift+r' },
          { spellIds: [], keybind: 'ctrl+4' },
        ],
      },
      bar2: {
        enabled: true,
        buttonCount: 10,
        buttonsPerRow: 10,
        buttons: [
          { spellIds: ['algethar_puzzle_box'], keybind: 'ctrl+2' },
          { spellIds: ['berserking'], keybind: 'ctrl+3' },
          { spellIds: ['potion'], keybind: 'ctrl+4' },
          { spellIds: [], keybind: '4' },
          { spellIds: [], keybind: '5' },
          { spellIds: [], keybind: '6' },
          { spellIds: [], keybind: '7' },
          { spellIds: [], keybind: '8' },
          { spellIds: [], keybind: '9' },
          { spellIds: [], keybind: ']' },
          { spellIds: [], keybind: '=' },
          { spellIds: [], keybind: '0' },
        ],
      },
      bar3: createActionBarConfig([], false, 12, 12),
      bar4: createActionBarConfig([], false, 12, 12),
      bar5: createActionBarConfig([], false, 12, 12),
    },
  };
}

/**
 * Returns the shipped default trainer settings.
 */
export function getDefaultTrainerSettings(): TrainerSettings {
  return {
    selectedSpec: 'monk-windwalker',
    mode: 'practice',
    practiceSpeedMultiplier: 1,
    challenge: {
      difficulty: 'hard',
      validKeys: [...DEFAULT_CHALLENGE_VALID_KEYS],
      disappearSpeedMultiplier: 0.5,
    },
    encounterPreset: 'fight90',
    audio: {
      musicVolume: 10,
    },
    talents: [
      'against_all_odds',
      'ancient_arts',
      'ascension',
      'calming_presence',
      'celerity',
      'chi_proficiency',
      'combat_stance',
      'combat_wisdom',
      'combo_breaker',
      'cyclones_drift',
      'dance_of_chi_ji',
      'dance_of_the_wind',
      'detox',
      'disable',
      'drinking_horn_cover',
      'dual_threat',
      'echo_technique',
      'efficient_training',
      'energy_burst',
      'fast_feet',
      'fatal_touch',
      'ferociousness',
      'ferocity_of_xuen',
      'fists_of_fury',
      'flow_of_chi',
      'flurry_strikes',
      'fortifying_brew',
      'glory_of_the_dawn',
      'grace_of_the_crane',
      'hit_combo',
      'improved_touch_of_death',
      'ironshell_brew',
      'jade_walk',
      'jadefire_stomp',
      'lighter_than_air',
      'martial_agility',
      'martial_instincts',
      'martial_precision',
      'memory_of_the_monastery',
      'midnight_season_1_2pc',
      'midnight_season_1_4pc',
      'momentum_boost',
      'obsidian_spiral',
      'one_versus_many',
      'paralysis',
      'pride_of_pandaria',
      'ring_of_peace',
      'rising_star',
      'rising_sun_kick',
      'rushing_wind_kick',
      'sequenced_strikes',
      'shado_over_the_battlefield',
      'sharp_reflexes',
      'singularly_focused_jade',
      'spear_hand_strike',
      'stand_ready',
      'stillstep_coil',
      'strength_of_spirit',
      'sunfire_spiral',
      'teachings_of_the_monastery',
      'tiger_fang',
      'tiger_tail_sweep',
      'tigereye_brew',
      'tigers_lust',
      'transcendence',
      'veterans_eye',
      'vigilant_watch',
      'vivacious_vivification',
      'weapon_of_wind',
      'weapons_of_the_wall',
      'whirling_dragon_punch',
      'whirling_steel',
      'windwalking',
      'wisdom_of_the_wall',
      'xuens_battlegear',
      'yulons_grace',
      'zenith',
      'zenith_stomp',
    ],
    talentRanks: {
      against_all_odds: 1,
      ancient_arts: 2,
      ascension: 1,
      calming_presence: 1,
      celerity: 1,
      chi_proficiency: 2,
      combat_stance: 1,
      combat_wisdom: 1,
      combo_breaker: 1,
      cyclones_drift: 1,
      dance_of_chi_ji: 1,
      dance_of_the_wind: 1,
      detox: 1,
      disable: 1,
      drinking_horn_cover: 1,
      dual_threat: 1,
      echo_technique: 1,
      efficient_training: 1,
      energy_burst: 1,
      fast_feet: 1,
      fatal_touch: 1,
      ferociousness: 2,
      ferocity_of_xuen: 2,
      fists_of_fury: 1,
      flow_of_chi: 1,
      flurry_strikes: 1,
      fortifying_brew: 1,
      glory_of_the_dawn: 1,
      grace_of_the_crane: 1,
      hit_combo: 1,
      improved_touch_of_death: 1,
      ironshell_brew: 1,
      jade_walk: 1,
      jadefire_stomp: 1,
      lighter_than_air: 1,
      martial_agility: 1,
      martial_instincts: 2,
      martial_precision: 1,
      memory_of_the_monastery: 1,
      momentum_boost: 1,
      obsidian_spiral: 1,
      one_versus_many: 1,
      paralysis: 1,
      pride_of_pandaria: 1,
      ring_of_peace: 1,
      rising_star: 1,
      rising_sun_kick: 1,
      rushing_wind_kick: 1,
      sequenced_strikes: 1,
      shado_over_the_battlefield: 1,
      sharp_reflexes: 1,
      singularly_focused_jade: 1,
      spear_hand_strike: 1,
      stand_ready: 1,
      stillstep_coil: 1,
      strength_of_spirit: 1,
      sunfire_spiral: 1,
      teachings_of_the_monastery: 1,
      tiger_fang: 1,
      tiger_tail_sweep: 1,
      tigereye_brew: 4,
      tigers_lust: 1,
      transcendence: 1,
      veterans_eye: 1,
      vigilant_watch: 1,
      vivacious_vivification: 1,
      weapon_of_wind: 1,
      weapons_of_the_wall: 1,
      whirling_dragon_punch: 1,
      whirling_steel: 1,
      windwalking: 1,
      wisdom_of_the_wall: 1,
      xuens_battlegear: 1,
      yulons_grace: 1,
      zenith: 1,
      zenith_stomp: 1,
    },
    loadout: {
      consumables: {
        potion: 'potion_of_recklessness_2',
        flask: 'flask_of_the_blood_knights_2',
        food: 'harandar_celebration',
        augmentation: 'void_touched',
        temporaryEnchants: [
          { slot: 'main_hand', enchantName: 'thalassian_phoenix_oil_2' },
          { slot: 'off_hand', enchantName: 'thalassian_phoenix_oil_2' },
        ],
      },
      externalBuffs: {
        bloodlust: true,
        battleShout: true,
        arcaneIntellect: true,
        markOfTheWild: true,
        powerWordFortitude: true,
        skyfury: true,
        mysticTouch: true,
        chaosBrand: true,
        huntersMark: true,
      },
      gear: [
        {
          slot: 'head',
          itemName: 'fearsome_visage_of_radens_chosen',
          itemId: 250015,
          enchantId: 8017,
          gemIds: [240983],
          bonusIds: [1808, 6652, 12667, 12676, 12806, 13335, 13338, 13575],
          craftedStats: [],
          raw: 'head=fearsome_visage_of_radens_chosen,id=250015,bonus_id=1808/6652/12667/12676/12806/13335/13338/13575,gem_id=240983,enchant_id=8017',
        },
        {
          slot: 'neck',
          itemName: 'amulet_of_the_abyssal_hymn',
          itemId: 250247,
          gemIds: [240892, 240892],
          bonusIds: [3170, 4786, 4800, 12806, 13668],
          craftedStats: [],
          raw: 'neck=amulet_of_the_abyssal_hymn,id=250247,bonus_id=3170/4786/4800/12806/13668,gem_id=240892/240892',
        },
        {
          slot: 'shoulders',
          itemName: 'aurastones_of_radens_chosen',
          itemId: 250013,
          enchantId: 8001,
          gemIds: [],
          bonusIds: [6652, 12675, 12806, 13335, 13340, 13574],
          craftedStats: [],
          raw: 'shoulders=aurastones_of_radens_chosen,id=250013,bonus_id=6652/12675/12806/13335/13340/13574,enchant_id=8001',
        },
        {
          slot: 'back',
          itemName: 'windwrap_of_radens_chosen',
          itemId: 250010,
          gemIds: [],
          bonusIds: [6652, 12806, 13335],
          craftedStats: [],
          raw: 'back=windwrap_of_radens_chosen,id=250010,bonus_id=6652/12806/13335',
        },
        {
          slot: 'chest',
          itemName: 'battle_garb_of_radens_chosen',
          itemId: 250018,
          enchantId: 7987,
          gemIds: [],
          bonusIds: [6652, 12676, 12806, 13335, 13336, 13575],
          craftedStats: [],
          raw: 'chest=battle_garb_of_radens_chosen,id=250018,bonus_id=6652/12676/12806/13335/13336/13575,enchant_id=7987',
        },
        {
          slot: 'wrists',
          itemName: 'voidskinned_bracers',
          itemId: 249327,
          gemIds: [240892],
          bonusIds: [3157, 4786, 4800, 11307, 12802, 12806],
          craftedStats: [],
          raw: 'wrists=voidskinned_bracers,id=249327,bonus_id=3157/4786/4800/11307/12802/12806,gem_id=240892',
        },
        {
          slot: 'hands',
          itemName: 'vaelgors_fearsome_grasp',
          itemId: 249321,
          gemIds: [],
          bonusIds: [12806, 13577],
          craftedStats: [],
          raw: 'hands=vaelgors_fearsome_grasp,id=249321,bonus_id=12806/13577',
        },
        {
          slot: 'waist',
          itemName: 'snapvine_cinch',
          itemId: 251082,
          gemIds: [240892],
          bonusIds: [3190, 4786, 11307, 12806],
          craftedStats: [],
          raw: 'waist=snapvine_cinch,id=251082,bonus_id=3190/4786/11307/12806,gem_id=240892',
        },
        {
          slot: 'legs',
          itemName: 'swiftsweepers_of_radens_chosen',
          itemId: 250014,
          enchantId: 8159,
          gemIds: [],
          bonusIds: [6652, 12676, 12806, 13335, 13339, 13575],
          craftedStats: [],
          raw: 'legs=swiftsweepers_of_radens_chosen,id=250014,bonus_id=6652/12676/12806/13335/13339/13575,enchant_id=8159',
        },
        {
          slot: 'feet',
          itemName: 'storm_crashers_of_radens_chosen',
          itemId: 250017,
          enchantId: 7963,
          gemIds: [],
          bonusIds: [6652, 12806, 13335],
          craftedStats: [],
          raw: 'feet=storm_crashers_of_radens_chosen,id=250017,bonus_id=6652/12806/13335,enchant_id=7963',
        },
        {
          slot: 'finger1',
          itemName: 'loa_worshipers_band',
          itemId: 251513,
          enchantId: 7967,
          gemIds: [240892],
          bonusIds: [8960, 12066, 12214, 13622, 12497],
          craftedStats: [],
          raw: 'finger1=loa_worshipers_band,id=251513,bonus_id=8960/12066/12214/13622/12497,gem_id=240892,enchant_id=7967',
        },
        {
          slot: 'finger2',
          itemName: 'eye_of_midnight',
          itemId: 249920,
          enchantId: 7967,
          gemIds: [240892, 240892],
          bonusIds: [6652, 12806, 13335, 13534],
          craftedStats: [],
          raw: 'finger2=eye_of_midnight,id=249920,bonus_id=6652/12806/13335/13534,gem_id=240892/240892,enchant_id=7967',
        },
        {
          slot: 'trinket1',
          itemName: 'gaze_of_the_alnseer',
          itemId: 249343,
          gemIds: [],
          bonusIds: [6652, 12806, 13335],
          craftedStats: [],
          raw: 'trinket1=gaze_of_the_alnseer,id=249343,bonus_id=6652/12806/13335',
        },
        {
          slot: 'trinket2',
          itemName: 'algethar_puzzle_box',
          itemId: 193701,
          gemIds: [],
          bonusIds: [6652, 12699, 12801, 12806, 13440],
          craftedStats: [],
          raw: 'trinket2=algethar_puzzle_box,id=193701,bonus_id=6652/12699/12801/12806/13440',
        },
        {
          slot: 'main_hand',
          itemName: 'shadowslash_slicer',
          itemId: 251122,
          enchantId: 7981,
          gemIds: [],
          bonusIds: [3190, 4786, 12806],
          craftedStats: [],
          raw: 'main_hand=shadowslash_slicer,id=251122,bonus_id=3190/4786/12806,enchant_id=7981',
        },
        {
          slot: 'off_hand',
          itemName: 'bloomforged_claw',
          itemId: 237845,
          enchantId: 7981,
          gemIds: [],
          bonusIds: [8960, 12066, 12214, 12693, 13622, 12497],
          craftedStats: [36, 49],
          raw: 'off_hand=bloomforged_claw,id=237845,bonus_id=8960/12066/12214/12693/13622/12497,enchant_id=7981,crafted_stats=36/49',
        },
      ],
    },
    hud: {
      layout: getDefaultHudLayoutSettings(),
      general: {
        showEnemyIcon: false,
        showMeleeSwingDamage: false,
        showDamageText: true,
        layoutScale: 1,
      },
      cooldowns: {
        essential: {
          ...createDefaultTrackerGroupSettings('icons', true, [
            'tiger_palm',
            'blackout_kick',
            'rising_sun_kick',
            'fists_of_fury',
            'whirling_dragon_punch',
            'touch_of_death',
            'zenith',
            'spinning_crane_kick',
          ], 5),
          entryOptions: {
            slicing_winds: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'utility' },
            touch_of_death: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
          },
        },
        utility: {
          ...createDefaultTrackerGroupSettings('icons', true, ['touch_of_karma']),
          entryOptions: {
            slicing_winds: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'utility' },
            touch_of_death: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
          },
        },
      },
      buffs: {
        iconTracker: {
          ...createDefaultTrackerGroupSettings('icons', true, [
            'berserking',
            'algethar_puzzle',
            'flurry_charge',
            'teachings_of_the_monastery',
            'momentum_boost',
            'hit_combo',
            'blackout_reinforcement',
            'dance_of_chi_ji',
          ]),
          entryOptions: {
            combo_strikes: { glowWhenReady: false, disableProcGlow: false },
            blackout_reinforcement: { glowWhenReady: false, disableProcGlow: false },
            dance_of_chi_ji: { glowWhenReady: false, disableProcGlow: false },
            momentum_boost: { glowWhenReady: false, disableProcGlow: false },
            hit_combo: { glowWhenReady: false, disableProcGlow: false },
            zenith: { glowWhenReady: false, disableProcGlow: false },
            rushing_wind_kick: { glowWhenReady: false, disableProcGlow: false },
            pressure_point: { glowWhenReady: false, disableProcGlow: false },
            stand_ready: { glowWhenReady: false, disableProcGlow: false },
            teachings_of_the_monastery: { glowWhenReady: false, disableProcGlow: false },
            memory_of_the_monastery: { glowWhenReady: false, disableProcGlow: false },
            flurry_charge: { glowWhenReady: false, disableProcGlow: false },
            tigereye_brew_3: { glowWhenReady: false, disableProcGlow: false },
            tigereye_brew_1: { glowWhenReady: false, disableProcGlow: false },
          },
        },
        barTracker: {
          ...createDefaultTrackerGroupSettings('bars', true, ['berserking', 'algethar_puzzle']),
          entryOptions: {
            combo_strikes: { glowWhenReady: false, disableProcGlow: false },
            blackout_reinforcement: { glowWhenReady: false, disableProcGlow: false },
            dance_of_chi_ji: { glowWhenReady: false, disableProcGlow: false },
            momentum_boost: { glowWhenReady: false, disableProcGlow: false },
            hit_combo: { glowWhenReady: false, disableProcGlow: false },
            zenith: { glowWhenReady: false, disableProcGlow: false },
            rushing_wind_kick: { glowWhenReady: false, disableProcGlow: false },
            pressure_point: { glowWhenReady: false, disableProcGlow: false },
            stand_ready: { glowWhenReady: false, disableProcGlow: false },
            teachings_of_the_monastery: { glowWhenReady: false, disableProcGlow: false },
            memory_of_the_monastery: { glowWhenReady: false, disableProcGlow: false },
            flurry_charge: { glowWhenReady: false, disableProcGlow: false },
            tigereye_brew_3: { glowWhenReady: false, disableProcGlow: false },
            tigereye_brew_1: { glowWhenReady: false, disableProcGlow: false },
          },
        },
      },
      targetDebuffs: createDefaultTrackerGroupSettings('icons'),
      consumables: createDefaultTrackerGroupSettings('icons', true, []),
    },
    actionBars: createDefaultActionBarSettings(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function sanitizeTalentRanks(value: unknown, fallback: TrainerSettings['talentRanks']): TrainerSettings['talentRanks'] {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  const next: TrainerSettings['talentRanks'] = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      next[key] = raw;
    }
  }
  return Object.keys(next).length > 0 ? next : { ...fallback };
}

function sanitizeAudioSettings(value: unknown, fallback: AudioSettings): AudioSettings {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    musicVolume: clampMusicVolume(value.musicVolume, fallback.musicVolume),
  };
}

function sanitizeTrackerGroupSettings(value: unknown, fallback: TrackerGroupSettings): TrackerGroupSettings {
  if (!isRecord(value)) {
    return {
      ...fallback,
      blacklistSpellIds: [...fallback.blacklistSpellIds],
      trackedSpellIds: [...fallback.trackedSpellIds],
      trackedEntryIds: [...fallback.trackedEntryIds],
      entryOptions: { ...fallback.entryOptions },
    };
  }

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
    blacklistSpellIds: sanitizeNumberArray(value.blacklistSpellIds),
    trackedSpellIds: sanitizeNumberArray(value.trackedSpellIds),
    trackedEntryIds: Array.isArray(value.trackedEntryIds)
      ? sanitizeStringArray(value.trackedEntryIds)
      : [...fallback.trackedEntryIds],
    displayMode: value.displayMode === 'icons' || value.displayMode === 'bars' ? value.displayMode : fallback.displayMode,
    iconsPerRow: typeof value.iconsPerRow === 'number' && Number.isFinite(value.iconsPerRow)
      ? Math.min(12, Math.max(1, Math.floor(value.iconsPerRow)))
      : fallback.iconsPerRow,
    entryOptions: sanitizeTrackerEntryOptions(value.entryOptions),
  };
}

function sanitizeTrackerEntryOptions(value: unknown): Record<string, TrackerEntrySettings> {
  if (!isRecord(value)) {
    return {};
  }

  const next: Record<string, TrackerEntrySettings> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isRecord(raw)) {
      continue;
    }

    next[key] = {
      glowWhenReady: typeof raw.glowWhenReady === 'boolean' ? raw.glowWhenReady : false,
      disableProcGlow: typeof raw.disableProcGlow === 'boolean' ? raw.disableProcGlow : false,
      cooldownGroup: raw.cooldownGroup === 'essential' || raw.cooldownGroup === 'utility' ? raw.cooldownGroup : undefined,
    };
  }

  return next;
}

function sanitizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
}

function sanitizeHudSettings(value: unknown, fallback: HudSettings): HudSettings {
  if (!isRecord(value)) {
      return {
        layout: sanitizeHudLayoutSettings(undefined, fallback.layout),
        general: {
          showEnemyIcon: fallback.general.showEnemyIcon,
          showMeleeSwingDamage: fallback.general.showMeleeSwingDamage,
          showDamageText: fallback.general.showDamageText,
          layoutScale: fallback.general.layoutScale ?? 1,
        },
        cooldowns: {
        essential: sanitizeTrackerGroupSettings(undefined, fallback.cooldowns.essential),
        utility: sanitizeTrackerGroupSettings(undefined, fallback.cooldowns.utility),
      },
      buffs: {
        iconTracker: sanitizeTrackerGroupSettings(undefined, fallback.buffs.iconTracker),
        barTracker: sanitizeTrackerGroupSettings(undefined, fallback.buffs.barTracker),
      },
      targetDebuffs: sanitizeTrackerGroupSettings(undefined, fallback.targetDebuffs),
      consumables: sanitizeTrackerGroupSettings(undefined, fallback.consumables),
    };
  }

  const cooldowns = isRecord(value.cooldowns) ? value.cooldowns : {};
  const buffs = isRecord(value.buffs) ? value.buffs : {};
  const normalizedBuffs = sanitizeBuffTrackerSettings(
    {
      iconTracker: sanitizeTrackerGroupSettings(buffs.iconTracker, fallback.buffs.iconTracker),
      barTracker: sanitizeTrackerGroupSettings(buffs.barTracker, fallback.buffs.barTracker),
    },
    fallback.buffs,
  );
  return {
    layout: sanitizeHudLayoutSettings(value.layout, fallback.layout),
    general: isRecord(value.general)
      ? {
        showEnemyIcon: typeof value.general.showEnemyIcon === 'boolean' ? value.general.showEnemyIcon : fallback.general.showEnemyIcon,
        showMeleeSwingDamage: typeof value.general.showMeleeSwingDamage === 'boolean'
          ? value.general.showMeleeSwingDamage
          : fallback.general.showMeleeSwingDamage,
        showDamageText: typeof value.general.showDamageText === 'boolean' ? value.general.showDamageText : fallback.general.showDamageText,
        layoutScale: typeof value.general.layoutScale === 'number' && Number.isFinite(value.general.layoutScale)
          ? Math.min(1.5, Math.max(0.75, value.general.layoutScale))
          : fallback.general.layoutScale ?? 1,
      }
      : {
        showEnemyIcon: fallback.general.showEnemyIcon,
        showMeleeSwingDamage: fallback.general.showMeleeSwingDamage,
        showDamageText: fallback.general.showDamageText,
        layoutScale: fallback.general.layoutScale ?? 1,
      },
    cooldowns: {
      essential: sanitizeTrackerGroupSettings(cooldowns.essential, fallback.cooldowns.essential),
      utility: sanitizeTrackerGroupSettings(cooldowns.utility, fallback.cooldowns.utility),
    },
    buffs: normalizedBuffs,
    targetDebuffs: sanitizeTrackerGroupSettings(value.targetDebuffs, fallback.targetDebuffs),
    consumables: sanitizeTrackerGroupSettings(value.consumables, fallback.consumables),
  };
}

function sanitizeBuffTrackerSettings(
  value: HudSettings['buffs'],
  fallback: HudSettings['buffs'],
): HudSettings['buffs'] {
  const iconTracker = {
    ...value.iconTracker,
    trackedEntryIds: sanitizeTrackedEntryIds(value.iconTracker.trackedEntryIds),
  };
  const barTracker = {
    ...value.barTracker,
    trackedEntryIds: sanitizeTrackedEntryIds(value.barTracker.trackedEntryIds),
  };

  const sameAssignments = arraysEqual(iconTracker.trackedEntryIds, barTracker.trackedEntryIds);
  if (sameAssignments && iconTracker.trackedEntryIds.length > 0) {
    if (barTracker.enabled && !iconTracker.enabled) {
      iconTracker.trackedEntryIds = [];
    } else if (iconTracker.enabled && !barTracker.enabled) {
      barTracker.trackedEntryIds = [];
    } else if (!iconTracker.enabled && !barTracker.enabled) {
      barTracker.trackedEntryIds = [];
      iconTracker.trackedEntryIds = sanitizeTrackedEntryIds(fallback.iconTracker.trackedEntryIds);
    }
  }

  return {
    iconTracker,
    barTracker,
  };
}

function sanitizeTrackedEntryIds(value: string[]): string[] {
  return [...new Set(value)];
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

function sanitizeHudLayoutSettings(value: unknown, fallback: HudLayoutSettings): HudLayoutSettings {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  const legacyActionBar = sanitizeHudGroupLayout(value.actionBar, fallback.actionBar1);
  const challengePlayfield = sanitizeHudGroupLayout(value.challengePlayfield, fallback.challengePlayfield);

  return {
    enemyIcon: sanitizeHudGroupLayout(value.enemyIcon, fallback.enemyIcon),
    essentialCooldowns: sanitizeHudGroupLayout(value.essentialCooldowns, fallback.essentialCooldowns),
    utilityCooldowns: sanitizeHudGroupLayout(value.utilityCooldowns, fallback.utilityCooldowns),
    buffIcons: sanitizeHudGroupLayout(value.buffIcons, fallback.buffIcons),
    buffBars: sanitizeHudGroupLayout(value.buffBars, fallback.buffBars),
    consumables: sanitizeHudGroupLayout(value.consumables, fallback.consumables),
    challengePlayfield: shouldResetLegacyChallengePlayfield(challengePlayfield)
      ? { ...fallback.challengePlayfield }
      : challengePlayfield,
    playerFrame: sanitizeHudGroupLayout(value.playerFrame, fallback.playerFrame),
    resourceFrame: sanitizeHudGroupLayout(value.resourceFrame, fallback.resourceFrame),
    targetFrame: sanitizeHudGroupLayout(value.targetFrame, fallback.targetFrame),
    castBar: sanitizeHudGroupLayout(value.castBar, fallback.castBar),
    actionBar1: sanitizeHudGroupLayout(value.actionBar1, legacyActionBar),
    actionBar2: sanitizeHudGroupLayout(value.actionBar2, fallback.actionBar2),
    actionBar3: sanitizeHudGroupLayout(value.actionBar3, fallback.actionBar3),
    actionBar4: sanitizeHudGroupLayout(value.actionBar4, fallback.actionBar4),
    actionBar5: sanitizeHudGroupLayout(value.actionBar5, fallback.actionBar5),
  };
}

function sanitizeHudGroupLayout(value: unknown, fallback: HudGroupLayout): HudGroupLayout {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    xPct: clampLayoutPct(value.xPct, fallback.xPct),
    yPct: clampLayoutPct(value.yPct, fallback.yPct),
    scale: clampLayoutScale(value.scale, fallback.scale),
  };
}

function clampLayoutScale(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(2.5, Math.max(0.5, value));
}

function clampLayoutPct(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(95, Math.max(5, value));
}

function shouldResetLegacyChallengePlayfield(layout: HudGroupLayout): boolean {
  return (
    nearlyEqual(layout.xPct, 50)
    && nearlyEqual(layout.yPct, 21.920087624397656)
    && nearlyEqual(layout.scale, 1.9181818181818182)
  );
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}

function sanitizeActionBarButtons(
  value: unknown,
  fallback: readonly ActionBarButtonSettings[],
): ActionBarButtonSettings[] {
  if (!Array.isArray(value)) {
    return fallback.map((button) => ({ spellIds: [...button.spellIds], keybind: button.keybind }));
  }

  return Array.from({ length: 12 }, (_, index) => {
    const raw: unknown = value[index];
    if (!isRecord(raw) || !Array.isArray(raw.spellIds)) {
      return {
        spellIds: [...(fallback[index]?.spellIds ?? [])],
        keybind: fallback[index]?.keybind ?? '',
      };
    }

    return {
      spellIds: raw.spellIds.filter((entry): entry is string => typeof entry === 'string'),
      keybind: typeof raw.keybind === 'string' ? raw.keybind : fallback[index]?.keybind ?? '',
    };
  });
}

function sanitizeActionBarConfig(value: unknown, fallback: ActionBarConfig): ActionBarConfig {
  if (!isRecord(value)) {
    return {
      ...fallback,
      buttons: fallback.buttons.map((button) => ({ spellIds: [...button.spellIds], keybind: button.keybind })),
    };
  }

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
    buttonCount: typeof value.buttonCount === 'number' && Number.isFinite(value.buttonCount)
      ? Math.min(12, Math.max(1, Math.floor(value.buttonCount)))
      : fallback.buttonCount,
    buttonsPerRow: typeof value.buttonsPerRow === 'number' && Number.isFinite(value.buttonsPerRow)
      ? Math.min(12, Math.max(1, Math.floor(value.buttonsPerRow)))
      : fallback.buttonsPerRow,
    buttons: sanitizeActionBarButtons(value.buttons, fallback.buttons),
  };
}

function sanitizeActionBarSettings(value: unknown, fallback: ActionBarSettings): ActionBarSettings {
  if (!isRecord(value)) {
    return {
      bars: Object.fromEntries(
        ACTION_BAR_IDS.map((barId) => [barId, sanitizeActionBarConfig(undefined, fallback.bars[barId])]),
      ) as Record<ActionBarId, ActionBarConfig>,
    };
  }

  const rawBars = value.bars;
  if (isRecord(rawBars)) {
    return {
      bars: Object.fromEntries(
        ACTION_BAR_IDS.map((barId) => [barId, sanitizeActionBarConfig(rawBars[barId], fallback.bars[barId])]),
      ) as Record<ActionBarId, ActionBarConfig>,
    };
  }

  const migrated = createDefaultActionBarSettings();
  const legacyEnabled = typeof value.enabled === 'boolean' ? value.enabled : true;
  const legacySlotsPerRow = typeof value.slotsPerRow === 'number' && Number.isFinite(value.slotsPerRow)
    ? Math.min(12, Math.max(1, Math.floor(value.slotsPerRow)))
    : migrated.bars.bar1.buttonsPerRow;
  const legacyRows = typeof value.rows === 'number' && Number.isFinite(value.rows)
    ? Math.max(1, Math.floor(value.rows))
    : 1;
  let remainingButtons = legacyEnabled ? legacySlotsPerRow * legacyRows : 0;

  ACTION_BAR_IDS.forEach((barId) => {
    const nextCount = Math.min(12, Math.max(0, remainingButtons));
    migrated.bars[barId].enabled = nextCount > 0;
    migrated.bars[barId].buttonCount = nextCount > 0 ? nextCount : migrated.bars[barId].buttonCount;
    migrated.bars[barId].buttonsPerRow = nextCount > 0 ? Math.min(nextCount, legacySlotsPerRow) : migrated.bars[barId].buttonsPerRow;
    remainingButtons = Math.max(0, remainingButtons - 12);
  });

  return sanitizeActionBarSettings(migrated, fallback);
}

function sanitizeLoadout(value: unknown, fallback: CharacterLoadout): CharacterLoadout {
  const next = cloneLoadout(fallback);
  if (!isRecord(value)) {
    return next;
  }

  const consumables = isRecord(value.consumables) ? value.consumables : {};
  next.consumables.potion = typeof consumables.potion === 'string' || consumables.potion === null ? consumables.potion : next.consumables.potion;
  next.consumables.flask = typeof consumables.flask === 'string' || consumables.flask === null ? consumables.flask : next.consumables.flask;
  next.consumables.food = typeof consumables.food === 'string' || consumables.food === null ? consumables.food : next.consumables.food;
  next.consumables.augmentation = typeof consumables.augmentation === 'string' || consumables.augmentation === null
    ? consumables.augmentation
    : next.consumables.augmentation;
  if (Array.isArray(consumables.temporaryEnchants)) {
    next.consumables.temporaryEnchants = consumables.temporaryEnchants
      .filter(isRecord)
      .flatMap((entry) => {
        if ((entry.slot !== 'main_hand' && entry.slot !== 'off_hand') || typeof entry.enchantName !== 'string') {
          return [];
        }
        return [{ slot: entry.slot, enchantName: entry.enchantName }];
      });
  }

  const externalBuffs = isRecord(value.externalBuffs) ? value.externalBuffs : {};
  for (const key of Object.keys(next.externalBuffs) as (keyof CharacterLoadout['externalBuffs'])[]) {
    if (typeof externalBuffs[key] === 'boolean') {
      next.externalBuffs[key] = externalBuffs[key];
    }
  }

  if (Array.isArray(value.gear)) {
    next.gear = value.gear
      .filter(isRecord)
      .flatMap((entry) => {
        if (typeof entry.slot !== 'string' || typeof entry.itemName !== 'string' || typeof entry.raw !== 'string') {
          return [];
        }
        return [{
          slot: entry.slot as CharacterLoadout['gear'][number]['slot'],
          itemName: entry.itemName,
          itemId: typeof entry.itemId === 'number' ? entry.itemId : undefined,
          enchantId: typeof entry.enchantId === 'number' ? entry.enchantId : undefined,
          gemIds: sanitizeNumberArray(entry.gemIds),
          bonusIds: sanitizeNumberArray(entry.bonusIds),
          craftedStats: sanitizeNumberArray(entry.craftedStats),
          raw: entry.raw,
        }];
      });
  }

  return next;
}

/**
 * Normalizes a partially valid storage payload into a complete `TrainerSettings` object.
 */
export function normalizeTrainerSettings(value: unknown): TrainerSettings {
  const fallback = getDefaultTrainerSettings();
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    selectedSpec: value.selectedSpec === 'monk-windwalker' ? value.selectedSpec : fallback.selectedSpec,
    mode: value.mode === 'practice' || value.mode === 'test' || value.mode === 'tutorial' || value.mode === 'challenge'
      ? value.mode
      : fallback.mode,
    practiceSpeedMultiplier: normalizePracticeSpeedMultiplier(value.practiceSpeedMultiplier, fallback.practiceSpeedMultiplier),
    challenge: normalizeChallengeSettings(value.challenge, fallback.challenge),
    encounterPreset: normalizeEncounterPreset(value.encounterPreset, fallback.encounterPreset),
    audio: sanitizeAudioSettings(value.audio, fallback.audio),
    talents: sanitizeStringArray(value.talents).length > 0 ? sanitizeStringArray(value.talents) : [...fallback.talents],
    talentRanks: sanitizeTalentRanks(value.talentRanks, fallback.talentRanks),
    loadout: sanitizeLoadout(value.loadout, fallback.loadout),
    hud: sanitizeHudSettings(value.hud, fallback.hud),
    actionBars: sanitizeActionBarSettings(value.actionBars, fallback.actionBars),
  };
}

function normalizeChallengeSettings(value: unknown, fallback: ChallengeSettings): ChallengeSettings {
  if (!isRecord(value)) {
    return fallback;
  }

  const validKeys = sanitizeChallengeValidKeys(value.validKeys);

  return {
    difficulty: value.difficulty === 'easy' || value.difficulty === 'hard'
      ? value.difficulty
      : fallback.difficulty,
    validKeys: validKeys.length > 0 ? validKeys : [...fallback.validKeys],
    disappearSpeedMultiplier: normalizeChallengeDisappearSpeedMultiplier(
      value.disappearSpeedMultiplier,
      fallback.disappearSpeedMultiplier,
    ),
  };
}

function normalizePracticeSpeedMultiplier(value: unknown, fallback: PracticeSpeedMultiplier): PracticeSpeedMultiplier {
  return value === 0.25 || value === 0.5 || value === 0.75 || value === 1 ? value : fallback;
}

function normalizeChallengeDisappearSpeedMultiplier(
  value: unknown,
  fallback: ChallengeDisappearSpeedMultiplier,
): ChallengeDisappearSpeedMultiplier {
  return value === 0.5 || value === 1 || value === 2 || value === 3 ? value : fallback;
}

function normalizeEncounterPreset(value: unknown, fallback: EncounterPreset): EncounterPreset {
  switch (value) {
    case 'fight30':
    case 'fight90':
    case 'fight180':
    case 'fight300':
    case 'fight600':
      return value;
    case 'opener30':
      return 'fight30';
    case 'fullFight':
      return 'fight90';
    default:
      return fallback;
  }
}

function sanitizeChallengeValidKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => /^[a-z0-9]$/.test(entry)),
  )];
}

function clampMusicVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function readFromStorage(): TrainerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return applyLegacyBrowserDefaults(getDefaultTrainerSettings());
    }
    return normalizeTrainerSettings(JSON.parse(raw) as unknown);
  } catch {
    return applyLegacyBrowserDefaults(getDefaultTrainerSettings());
  }
}

function applyLegacyBrowserDefaults(settings: TrainerSettings): TrainerSettings {
  try {
    const raw = localStorage.getItem(LEGACY_KEYBINDS_STORAGE_KEY);
    if (raw === null) {
      return settings;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bars = { ...settings.actionBars.bars };

    for (const [spellId, value] of Object.entries(parsed)) {
      const chord = typeof value === 'string'
        ? value
        : (isRecord(value) && typeof value.chord === 'string' ? value.chord : null);
      if (!chord) {
        continue;
      }

      for (const barId of ACTION_BAR_IDS) {
        const buttons = bars[barId].buttons.map((button) => (
          button.spellIds.includes(spellId) ? { ...button, keybind: chord } : button
        ));
        bars[barId] = { ...bars[barId], buttons };
      }
    }

    return {
      ...settings,
      actionBars: { bars },
    };
  } catch {
    return settings;
  }
}

/**
 * Persists trainer settings to localStorage while keeping React state in sync.
 */
export function useTrainerSettings(): [TrainerSettings, (next: TrainerSettingsUpdater) => void] {
  const [settings, setSettingsState] = useState<TrainerSettings>(readFromStorage);

  const setSettings = useCallback((next: TrainerSettingsUpdater): void => {
    setSettingsState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved));
      } catch {
        // Storage unavailable — keep using in-memory state.
      }
      return resolved;
    });
  }, []);

  return [settings, setSettings];
}

/**
 * Converts the persisted talent array into the runtime `Set` shape expected by the simulation.
 */
export function toTalentSet(settings: TrainerSettings): ReadonlySet<string> {
  return new Set(settings.talents);
}

/**
 * Converts persisted talent ranks into the runtime `Map` shape expected by the simulation.
 */
export function toTalentRankMap(settings: TrainerSettings): ReadonlyMap<string, number> {
  return new Map(Object.entries(settings.talentRanks));
}

/**
 * Resolves the encounter duration from the selected trainer settings.
 */
export function resolveEncounterDuration(settings: Pick<TrainerSettings, 'encounterPreset' | 'mode'>): number {
  switch (settings.encounterPreset) {
    case 'fight30':
      return 30;
    case 'fight90':
      return 90;
    case 'fight180':
      return 180;
    case 'fight300':
      return 300;
    case 'fight600':
      return 600;
    default:
      return 90;
  }
}

/**
 * Returns true for modes that should share the competitive no-hints ruleset.
 */
export function usesCompetitiveTrainerRules(mode: TrainerMode): boolean {
  return mode === 'test' || mode === 'challenge';
}
