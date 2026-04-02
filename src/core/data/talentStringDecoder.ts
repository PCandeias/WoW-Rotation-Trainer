import {
  MONK_WINDWALKER_SIMC_LAYOUT_POSITIONS,
  type SimcTalentLayoutPosition,
} from './monkWindwalkerSimcLayout';
import {
  DEFAULT_SHAMAN_ENHANCEMENT_SIMC_TALENT_METADATA_TALENT_STRING,
  SHAMAN_ENHANCEMENT_SIMC_TALENT_METADATA,
} from './generated/shamanEnhancementTalentMetadata';

const BASE64_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOADOUT_SERIALIZATION_VERSION = 2;
const WINDWALKER_SPEC_ID = 269;

const VERSION_BITS = 8;
const SPEC_BITS = 16;
const TREE_BITS = 128;
const RANK_BITS = 6;
const CHOICE_BITS = 2;
const BITS_PER_CHARACTER = 6;

const TREE_INDEX_CLASS = 1;
const TREE_INDEX_SPECIALIZATION = 2;
const TREE_INDEX_HERO = 3;
const TREE_INDEX_HERO_SELECTION = 4;

type DecodedTalentTreeInternal = 'class' | 'specialization' | 'hero';
type MonkWindwalkerTalentNode = readonly [
  treeIndex: number,
  nodeType: number,
  maxRank: number,
  appliesToWindwalker: boolean,
  names: readonly string[],
];

interface SerializedTalentNodeDefinition {
  order: number;
  treeIndex: number;
  tree: DecodedTalentTreeInternal | null;
  nodeType: number;
  maxRank: number;
  isVisibleToCurrentSpec: boolean;
  names: readonly string[];
  internalIds: readonly string[];
}

export interface TalentTreeDefinition {
  id: string;
  tree: DecodedTalentTree;
  title: string;
  subtitle: string;
  pointBudget: number;
  columns: number;
  rowPattern: readonly number[][];
  layoutRows?: readonly (readonly string[])[];
}

export interface HeroTalentChoiceDefinition {
  id: string;
  label: string;
  internalId: string;
  treeId: string;
}

export interface TalentLoadoutDefinition {
  id: string;
  version: number;
  specId: number;
  trees: readonly TalentTreeDefinition[];
  heroTreeChoices: readonly HeroTalentChoiceDefinition[];
  heroTreeSelectionOrder?: readonly string[];
  serializedNodes: readonly SerializedTalentNodeDefinition[];
  nodes: readonly TalentNodeDefinition[];
}

export interface GeneratedSimcTalentNodeEntry {
  entryId: number;
  name: string;
  selectionIndex: number;
  maxRank: number;
  spellId: number;
}

export interface GeneratedSimcTalentNodeGroup {
  order: number;
  nodeId: number;
  treeIndex: number;
  treeId: string | null;
  nodeType: number;
  maxRank: number;
  row: number;
  col: number;
  subTreeId: number;
  granted: boolean;
  entries: readonly GeneratedSimcTalentNodeEntry[];
}

export interface GeneratedSimcTalentLoadoutMetadata {
  id: string;
  version: number;
  specId: number;
  trees: readonly TalentTreeDefinition[];
  heroTreeChoices: readonly HeroTalentChoiceDefinition[];
  heroTreeSelectionOrder: readonly string[];
  rawNodeGroups: readonly GeneratedSimcTalentNodeGroup[];
  activeSpellIds: readonly number[];
}

/**
 * Public tree name type used by decoded talents and UI talent catalogs.
 */
export type DecodedTalentTree = DecodedTalentTreeInternal;

/**
 * Static metadata for a trainer talent node.
 * Choice nodes retain every branch name so UIs can resolve the active branch.
 */
export interface TalentNodeDefinition {
  order: number;
  tree: DecodedTalentTree;
  treeId: string;
  pointPool: DecodedTalentTree;
  nodeType: number;
  visualType: 'active' | 'passive' | 'choice';
  maxRank: number;
  names: readonly string[];
  internalIds: readonly string[];
  layoutPosition?: SimcTalentLayoutPosition;
  parentInternalIds?: readonly string[];
  detached?: boolean;
  granted?: boolean;
}

export type MonkWindwalkerTalentNodeDefinition = TalentNodeDefinition;

const MONK_WW_TALENT_NODES: readonly MonkWindwalkerTalentNode[] = [
  [2, 0, 2, true, ['Ferociousness']],
  [2, 0, 1, true, ['Sharp Reflexes']],
  [2, 0, 1, true, ['Ascension']],
  [2, 0, 1, true, ["Brawler's Intensity"]],
  [2, 0, 1, true, ['Glory of the Dawn']],
  [2, 0, 1, true, ['Thunderfist']],
  [2, 0, 1, true, ['Communion With Wind']],
  [2, 2, 1, true, ['Airborne Rhythm', "Hurricane's Vault"]],
  [2, 2, 1, true, ['Path of Jade', 'Singularly Focused Jade']],
  [2, 0, 1, true, ['Jadefire Stomp']],
  [2, 0, 1, true, ['Universal Energy']],
  [2, 0, 2, true, ['Hardened Soles']],
  [2, 0, 1, true, ['Momentum Boost']],
  [2, 0, 1, true, ['Touch of the Tiger']],
  [2, 0, 1, true, ['Jade Ignition']],
  [2, 0, 1, true, ['Obsidian Spiral']],
  [2, 2, 1, true, ['Drinking Horn Cover', 'Spiritual Focus']],
  [2, 0, 1, true, ['Zenith']],
  [2, 0, 1, true, ['Teachings of the Monastery']],
  [2, 0, 1, true, ['Dual Threat']],
  [2, 0, 1, true, ['Energy Burst']],
  [2, 2, 1, true, ["Cyclone's Drift", 'Crashing Fists']],
  [2, 0, 1, true, ['Sequenced Strikes']],
  [2, 0, 1, true, ['Dance of Chi-Ji']],
  [2, 0, 1, true, ['Meridian Strikes']],
  [2, 0, 1, true, ['Shadowboxing Treads']],
  [2, 0, 1, false, ['Swift as a Coursing River']],
  [2, 0, 1, false, ['Purifying Brew']],
  [2, 2, 1, false, ['Staggering Strikes', 'Quick Sip']],
  [2, 2, 1, false, ['Celestial Brew', 'Celestial Infusion']],
  [2, 0, 1, false, ['Fortifying Brew: Determination']],
  [2, 0, 1, false, ['Breath of Fire']],
  [2, 0, 1, false, ['Jade Flash']],
  [2, 0, 1, false, ['Gift of the Ox']],
  [2, 0, 1, false, ['Improved Blackout Kick']],
  [2, 0, 1, false, ['Mighty Stomp']],
  [2, 0, 2, false, ['Walk with the Ox']],
  [2, 0, 1, false, ['Invoke Niuzao, the Black Ox']],
  [2, 0, 1, false, ['Celestial Flames']],
  [2, 0, 1, false, ['Zen State']],
  [2, 2, 1, false, ['Shadowboxing Treads', 'Fluidity of Motion']],
  [2, 0, 1, false, ['Counterstrike']],
  [2, 0, 1, false, ['Face Palm']],
  [2, 0, 2, false, ['Anvil and Stave']],
  [2, 2, 1, false, ['Light Brewing', 'Training of Niuzao']],
  [2, 0, 1, false, ['Tranquil Spirit']],
  [2, 0, 1, false, ["Niuzao's Resolve"]],
  [2, 0, 1, false, ['Elixir of Determination']],
  [2, 0, 1, false, ['Spirit of the Ox']],
  [2, 0, 1, false, ['Shuffle']],
  [2, 0, 1, false, ['Keg Smash']],
  [1, 0, 1, false, ['Improved Detox']],
  [1, 0, 1, false, ['Detox']],
  [2, 0, 1, false, ['Uplifted Spirits']],
  [2, 0, 1, false, ['Mist Wrap', '0']],
  [2, 0, 1, false, ['Overflowing Mists']],
  [2, 2, 1, false, ['Calming Coalescence', 'Refreshment']],
  [2, 0, 1, false, ['Life Cocoon']],
  [2, 0, 1, false, ['Crane Style']],
  [2, 2, 1, false, ['Chrysalis', 'Burst of Life']],
  [2, 0, 1, false, ['Mists of Life']],
  [2, 0, 1, false, ["Yu'lon's Whisper"]],
  [2, 0, 1, false, ["Emperor's Elixir"]],
  [2, 2, 1, false, ['Jadefire Teachings', 'Rushing Wind Kick']],
  [2, 0, 1, false, ['Amplified Rush', '0']],
  [2, 2, 1, false, ['Way of the Serpent', 'Way of the Crane']],
  [2, 0, 1, false, ['Dance of Chi-Ji']],
  [2, 0, 1, false, ['Misty Coalescence']],
  [2, 0, 1, false, ['Zen Pulse']],
  [2, 0, 1, false, ['Healing Elixir']],
  [2, 0, 1, false, ['Invigorating Mists']],
  [2, 0, 2, false, ['Rapid Diffusion']],
  [2, 0, 1, false, ['Dancing Mists']],
  [2, 2, 1, false, ['Jade Bond', 'Gift of the Celestials']],
  [2, 0, 2, false, ['Misty Peaks']],
  [2, 0, 1, false, ['Focused Thunder']],
  [2, 0, 1, false, ['Peaceful Mending']],
  [2, 2, 1, false, ['Tear of Morning', 'Rising Mist']],
  [2, 2, 1, false, ['Legacy of Wisdom', "Emperor's Favor"]],
  [2, 2, 1, false, ['Veil of Pride', 'Tranquil Tea']],
  [2, 0, 1, false, ["Sheilun's Gift"]],
  [2, 0, 1, false, ['Lotus Infusion']],
  [2, 0, 1, false, ['Deep Clarity']],
  [2, 0, 1, false, ['Mistline']],
  [2, 0, 2, false, ['Secret Infusion']],
  [2, 2, 1, false, ['Jade Empowerment', 'Morning Breeze']],
  [2, 0, 2, false, ['Resplendent Mist']],
  [2, 0, 1, false, ['Pool of Mists']],
  [2, 0, 1, false, ['Celestial Harmony']],
  [2, 2, 1, false, ["Invoke Yu'lon, the Jade Serpent", 'Invoke Chi-Ji, the Red Crane']],
  [2, 2, 1, false, ['Energizing Brew', 'Lifecycles']],
  [2, 2, 1, false, ['Revival', 'Restoral']],
  [2, 0, 1, false, ['Mana Tea']],
  [2, 0, 1, false, ['Thunder Focus Tea']],
  [2, 0, 1, false, ['Enveloping Mist']],
  [1, 2, 1, false, ['Strength of Spirit', 'Profound Rebuttal']],
  [1, 2, 1, true, ['Ring of Peace', 'Song of Chi-Ji']],
  [1, 0, 1, true, ['Dance of the Wind']],
  [1, 0, 1, true, ["Spirit's Essence"]],
  [1, 0, 1, false, ['Dance of the Wind']],
  [1, 0, 1, true, ['Improved Touch of Death']],
  [1, 0, 1, true, ['Pressure Points']],
  [1, 0, 1, true, ['Paralysis']],
  [1, 0, 1, true, ['Soothing Mist']],
  [1, 0, 1, true, ['Elusive Mists']],
  [1, 0, 1, false, ['Vivacious Vivification']],
  [1, 0, 1, true, ['Grace of the Crane']],
  [1, 0, 1, true, ["Tiger's Lust"]],
  [1, 0, 1, true, ["Wind's Reach"]],
  [1, 2, 1, true, ['Crashing Momentum', 'Disable']],
  [1, 0, 1, true, ['Detox']],
  [1, 0, 1, false, ['Energy Transfer']],
  [1, 0, 1, false, ['Spear Hand Strike']],
  [1, 0, 1, true, ['Calming Presence']],
  [1, 0, 1, true, ['Rushing Reflexes']],
  [1, 0, 1, true, ['Swift Art']],
  [1, 0, 1, false, ['Vigorous Expulsion']],
  [1, 0, 1, true, ['Save Them All']],
  [1, 2, 1, true, ['Quick Footed', 'Hasty Provocation']],
  [1, 0, 1, true, ['Tiger Fang']],
  [1, 0, 1, true, ['Jade Walk']],
  [1, 0, 1, true, ['Bounding Agility']],
  [1, 0, 1, true, ['Zenith Stomp']],
  [1, 0, 1, true, ['Peace and Prosperity']],
  [1, 2, 1, false, ['Jade Infusion', 'Summon Jade Serpent Statue']],
  [1, 0, 1, true, ["Yu'lon's Grace"]],
  [1, 0, 2, true, ['Ferocity of Xuen']],
  [1, 0, 1, true, ['Transcendence']],
  [1, 0, 1, true, ['Lighter Than Air']],
  [1, 0, 2, true, ['Chi Proficiency']],
  [1, 0, 1, true, ['Flow of Chi']],
  [1, 0, 1, true, ['Healing Winds']],
  [1, 0, 1, false, ['Summon Black Ox Statue']],
  [1, 0, 1, true, ['Fortifying Brew']],
  [1, 2, 1, true, ['Ironshell Brew', 'Expeditious Fortification']],
  [1, 0, 1, true, ['Windwalking']],
  [1, 2, 1, true, ['Escape from Reality', 'Transcendence: Linked Spirits']],
  [1, 0, 1, true, ['Chi Transfer']],
  [1, 0, 1, true, ['Fatal Touch']],
  [1, 0, 2, true, ['Martial Instincts']],
  [1, 0, 1, true, ['Celestial Determination']],
  [1, 0, 1, false, ['Dance of the Wind']],
  [1, 0, 1, true, ['Tiger Tail Sweep']],
  [1, 2, 1, true, ['Celerity', 'Chi Torpedo']],
  [1, 0, 2, true, ['Ancient Arts']],
  [1, 0, 1, true, ['Fast Feet']],
  [1, 0, 1, true, ['Rising Sun Kick']],
  [2, 2, 1, false, ['Dragonfire Brew', 'Charred Passions']],
  [2, 2, 1, false, ['Scalding Brew', "Sal'salabim's Strength"]],
  [2, 0, 2, false, ['High Tolerance']],
  [2, 2, 1, false, ['Bob and Weave', 'Black Ox Brew']],
  [2, 2, 1, false, ['Press the Advantage', 'Blackout Combo']],
  [2, 0, 1, false, ["Stormstout's Last Keg"]],
  [2, 2, 1, false, ['Awakening Spirit', 'Vital Flame']],
  [2, 0, 1, false, ['Exploding Keg']],
  [2, 0, 1, false, ['Fuel on the Fire', 'Empty the Cellar']],
  [2, 0, 1, false, ['Ox Stance']],
  [2, 0, 1, false, ['Pretense of Instability']],
  [2, 2, 1, false, ['Special Delivery', 'Rushing Jade Wind']],
  [2, 2, 1, true, ['Revolving Whirl', 'Echo Technique']],
  [2, 0, 1, true, ['Flurry of Xuen']],
  [2, 0, 1, true, ['Rising Star']],
  [2, 0, 1, true, ['Weapon of Wind']],
  [2, 2, 1, true, ['Strike of the Windlord', 'Whirling Dragon Punch']],
  [2, 0, 1, true, ['Martial Agility']],
  [2, 0, 1, true, ['Memory of the Monastery']],
  [2, 0, 1, true, ["Xuen's Battlegear"]],
  [2, 0, 1, true, ['Crane Vortex']],
  [2, 0, 1, true, ['Knowledge of the Broken Temple']],
  [2, 0, 1, true, ['Sunfire Spiral']],
  [2, 0, 1, true, ['Inner Peace']],
  [2, 0, 1, true, ['Combo Breaker']],
  [2, 0, 1, true, ['Hit Combo']],
  [2, 0, 1, true, ['Combat Wisdom']],
  [2, 0, 1, true, ['Fists of Fury']],
  [4, 3, 1, false, ['0', '0']],
  [3, 0, 1, false, ['Overwhelming Force']],
  [3, 2, 1, false, ["Tiger's Vigor", 'Roar from the Heavens']],
  [3, 0, 1, false, ['Manifestation']],
  [3, 0, 1, false, ['Aspect of Harmony']],
  [3, 2, 1, false, ['Purified Spirit', 'Harmonic Gambit']],
  [3, 0, 1, false, ['Endless Draught']],
  [3, 2, 1, false, ['Path of Resurgence', 'Way of a Thousand Strikes']],
  [3, 0, 1, false, ['Coalescence']],
  [3, 0, 1, false, ['Clarity of Purpose']],
  [3, 2, 1, false, ['Mantra of Purity', 'Mantra of Tenacity']],
  [3, 0, 1, false, ['Balanced Stratagem']],
  [4, 3, 1, false, ['0', '0']],
  [4, 3, 1, true, ['0', '0']],
  [3, 2, 1, false, ['Restore Balance', "Yu'lon's Knowledge"]],
  [3, 0, 1, true, ['Path of the Falling Star']],
  [3, 0, 1, true, ['Inner Compass', '0']],
  [3, 2, 1, true, ['Temple Training', "Xuen's Guidance"]],
  [3, 0, 1, true, ["Chi-Ji's Swiftness"]],
  [3, 2, 1, true, ["Niuzao's Protection", 'Jade Sanctuary']],
  [3, 0, 1, true, ['Unity Within']],
  [3, 0, 1, false, ['Stampede of the Ancients']],
  [3, 0, 1, true, ['Courage of the White Tiger']],
  [3, 0, 1, true, ['Invoke Xuen, the White Tiger']],
  [3, 0, 1, true, ['Vigilant Watch']],
  [3, 2, 1, true, ['Whirling Steel', 'Predictive Training']],
  [3, 0, 1, true, ['Martial Precision']],
  [3, 2, 1, true, ['Pride of Pandaria', 'High Impact']],
  [3, 0, 1, true, ['Flurry Strikes']],
  [3, 0, 1, true, ["Veteran's Eye"]],
  [3, 0, 1, true, ['One Versus Many']],
  [3, 0, 1, true, ['Efficient Training']],
  [3, 0, 1, true, ['Wisdom of the Wall']],
  [3, 0, 1, true, ['Against All Odds']],
  [3, 2, 1, true, ['Combat Stance', "Initiator's Edge"]],
  [2, 0, 1, false, ['One With the Wind']],
  [2, 0, 1, false, ['Empty the Cellar']],
  [2, 0, 1, false, ["Gai Plin's Imperial Brew"]],
  [2, 0, 1, true, ['Slicing Winds']],
  [1, 0, 1, false, ['Chi Wave']],
  [1, 2, 1, false, ['Chi Wave', 'Chi Burst']],
  [2, 0, 1, true, ['Skyfire Heel']],
  [2, 0, 1, true, ['Harmonic Combo']],
  [1, 0, 1, true, ['Diffuse Magic']],
  [2, 0, 1, true, ['Rushing Wind Kick']],
  [2, 1, 4, false, ['Spiritfont', 'Spiritfont', 'Spiritfont']],
  [3, 0, 1, false, ['Harmonic Surge']],
  [3, 0, 1, false, ['Potential Energy']],
  [3, 0, 1, false, ['Meditative Focus']],
  [3, 0, 1, true, ['Shado Over the Battlefield']],
  [3, 0, 1, true, ['Stand Ready']],
  [3, 0, 1, true, ['Weapons of the Wall']],
  [3, 0, 1, true, ['Flowing Wisdom']],
  [3, 0, 1, true, ['Heart of the Jade Serpent']],
  [1, 0, 1, false, ['Fast Feet']],
  [1, 0, 1, false, ['Stagger']],
  [2, 0, 1, false, ['Elusive Footwork']],
  [2, 0, 1, false, ['August Blessing']],
  [2, 0, 1, false, ['Heart of the Ox']],
  [1, 0, 1, false, ['Mist Caller']],
  [1, 0, 1, true, ['Vigorous Expulsion']],
  [1, 0, 1, false, ['Vital Clarity']],
  [1, 2, 1, true, ['Strength of Spirit', 'Profound Rebuttal']],
  [1, 0, 1, true, ['Vivacious Vivification']],
  [1, 0, 1, true, ['Silent Sanctuary']],
  [1, 0, 1, true, ['Stillstep Coil']],
  [1, 2, 1, false, ['Vivacious Vivification', 'Serene Surge']],
  [1, 0, 1, true, ['Reinvigoration']],
  [3, 0, 1, false, ['Celestial Conduit']],
  [1, 0, 1, true, ['Energy Transfer']],
  [1, 0, 1, false, ['Chi Warding']],
  [1, 0, 1, true, ['Spear Hand Strike']],
  [3, 0, 1, true, ['Strength of the Black Ox']],
  [3, 0, 1, true, ["Yu'lon's Avatar"]],
  [3, 0, 1, true, ['Celestial Conduit']],
  [3, 2, 1, true, ['Restore Balance', "Xuen's Bond"]],
  [2, 1, 4, false, ['Bring Me Another', 'Bring Me Another', 'Bring Me Another']],
  [2, 1, 4, true, ['Tigereye Brew', 'Tigereye Brew', 'Tigereye Brew']],
] as const;

const TALENT_ID_OVERRIDES: Readonly<Record<string, string>> = {
  "Brawler's Intensity": 'brawlers_intensity',
  "Chi-Ji's Swiftness": 'chijis_swiftness',
  "Cyclone's Drift": 'cyclones_drift',
  'Dance of Chi-Ji': 'dance_of_chi_ji',
  "Hurricane's Vault": 'hurricanes_vault',
  'Glory of the Dawn': 'glory_of_the_dawn',
  'Improved Touch of Death': 'improved_touch_of_death',
  'Invoke Xuen, the White Tiger': 'invoke_xuen_the_white_tiger',
  'Knowledge of the Broken Temple': 'knowledge_of_the_broken_temple',
  "Niuzao's Protection": 'niuzaos_protection',
  'Path of the Falling Star': 'path_of_the_falling_star',
  'Ring of Peace': 'ring_of_peace',
  "Spirit's Essence": 'spirits_essence',
  'Stand Ready': 'stand_ready',
  'Teachings of the Monastery': 'teachings_of_the_monastery',
  "Tiger's Lust": 'tigers_lust',
  'Tigereye Brew': 'tigereye_brew',
  'Vivacious Vivification': 'vivacious_vivification',
  "Wind's Reach": 'winds_reach',
  "Xuen's Battlegear": 'xuens_battlegear',
  "Xuen's Bond": 'xuens_bond',
  "Xuen's Guidance": 'xuens_guidance',
  "Yu'lon's Avatar": 'yulons_avatar',
  "Yu'lon's Grace": 'yulons_grace',
};

/**
 * A decoded talent entry from a WoW loadout string.
 */
export interface DecodedTalent {
  name: string;
  internalId: string;
  rank: number;
  maxRank: number;
  tree: DecodedTalentTree;
  treeId: string;
  pointPool: DecodedTalentTree;
  order: number;
}

const DEFAULT_ROW_PATTERNS: Record<DecodedTalentTree, readonly number[][]> = {
  class: [[3], [2, 4], [1, 3, 5], [0, 2, 4, 6], [1, 3, 5], [2, 4], [3]],
  specialization: [[3], [2, 4], [1, 3, 5], [0, 2, 4, 6], [1, 3, 5], [2, 4], [3]],
  hero: [[1], [0, 2], [1, 2], [0, 1, 2, 3], [1, 2], [0, 2], [1]],
};

const MONK_WINDWALKER_TREE_DEFINITIONS: readonly TalentTreeDefinition[] = [
  {
    id: 'monk-class',
    tree: 'class',
    title: 'Monk',
    subtitle: 'Class Tree',
    pointBudget: 34,
    columns: 7,
    rowPattern: DEFAULT_ROW_PATTERNS.class,
    layoutRows: [
      ['soothing_mist', 'paralysis', 'rising_sun_kick'],
      ['elusive_mists', 'tigers_lust', 'disable', 'grace_of_the_crane'],
      ['winds_reach', 'detox', 'calming_presence', 'rushing_reflexes', 'swift_art'],
      ['spirits_essence', 'improved_touch_of_death', 'pressure_points', 'save_them_all', 'quick_footed'],
      ['tiger_fang', 'jade_walk', 'bounding_agility', 'zenith_stomp', 'peace_and_prosperity'],
      ['yulons_grace', 'ferocity_of_xuen', 'transcendence', 'lighter_than_air', 'chi_proficiency', 'flow_of_chi'],
      ['healing_winds', 'fortifying_brew', 'ironshell_brew', 'windwalking', 'escape_from_reality'],
      ['chi_transfer', 'fatal_touch', 'martial_instincts', 'celestial_determination', 'tiger_tail_sweep', 'celerity'],
      ['chi_torpedo', 'ancient_arts', 'fast_feet', 'diffuse_magic', 'strength_of_spirit', 'vigorous_expulsion'],
      ['ring_of_peace', 'song_of_chi_ji', 'vivacious_vivification', 'silent_sanctuary', 'stillstep_coil'],
      ['profound_rebuttal', 'reinvigoration', 'energy_transfer', 'spear_hand_strike'],
      ['transcendence_linked_spirits', 'expeditious_fortification', 'hasty_provocation'],
    ],
  },
  {
    id: 'windwalker-spec',
    tree: 'specialization',
    title: 'Windwalker',
    subtitle: 'Spec Tree',
    pointBudget: 34,
    columns: 9,
    rowPattern: DEFAULT_ROW_PATTERNS.specialization,
    layoutRows: [
      ['ferociousness', 'sharp_reflexes', 'ascension'],
      ['brawlers_intensity', 'glory_of_the_dawn', 'thunderfist', 'communion_with_wind'],
      ['path_of_jade', 'singularly_focused_jade', 'jadefire_stomp', 'universal_energy', 'momentum_boost'],
      ['touch_of_the_tiger', 'jade_ignition', 'obsidian_spiral', 'drinking_horn_cover', 'spiritual_focus', 'zenith'],
      ['teachings_of_the_monastery', 'dual_threat', 'energy_burst', 'cyclones_drift', 'crashing_fists', 'sequenced_strikes'],
      ['dance_of_chi_ji', 'meridian_strikes', 'shadowboxing_treads', 'revolving_whirl', 'echo_technique'],
      ['flurry_of_xuen', 'rising_star', 'weapon_of_wind', 'strike_of_the_windlord', 'whirling_dragon_punch'],
      ['martial_agility', 'memory_of_the_monastery', 'xuens_battlegear', 'crane_vortex', 'knowledge_of_the_broken_temple'],
      ['sunfire_spiral', 'inner_peace', 'combo_breaker', 'hit_combo', 'combat_wisdom', 'fists_of_fury'],
      ['slicing_winds', 'skyfire_heel', 'harmonic_combo', 'rushing_wind_kick'],
      ['hurricanes_vault', 'airborne_rhythm'],
    ],
  },
  {
    id: 'shado-pan-hero',
    tree: 'hero',
    title: 'Shado-Pan',
    subtitle: 'Hero Tree',
    pointBudget: 13,
    columns: 5,
    rowPattern: DEFAULT_ROW_PATTERNS.hero,
    layoutRows: [
      ['flurry_strikes'],
      ['pride_of_pandaria', 'high_impact', 'veterans_eye', 'martial_precision', 'shado_over_the_battlefield'],
      ['combat_stance', 'initiators_edge', 'one_versus_many', 'whirling_steel', 'predictive_training', 'stand_ready'],
      ['against_all_odds', 'efficient_training', 'vigilant_watch', 'weapons_of_the_wall'],
      ['wisdom_of_the_wall'],
    ],
  },
  {
    id: 'conduit-of-the-celestials-hero',
    tree: 'hero',
    title: 'Conduit of the Celestials',
    subtitle: 'Hero Tree',
    pointBudget: 13,
    columns: 5,
    rowPattern: DEFAULT_ROW_PATTERNS.hero,
    layoutRows: [
      ['invoke_xuen_the_white_tiger'],
      ['temple_training', 'xuens_guidance', 'courage_of_the_white_tiger', 'restore_balance', 'xuens_bond', 'heart_of_the_jade_serpent'],
      ['chijis_swiftness', 'strength_of_the_black_ox', 'path_of_the_falling_star', 'yulons_avatar'],
      ['niuzaos_protection', 'jade_sanctuary', 'celestial_conduit', 'inner_compass', 'flowing_wisdom'],
      ['unity_within'],
    ],
  },
];

const MONK_WINDWALKER_HERO_TREE_CHOICES: readonly HeroTalentChoiceDefinition[] = [
  {
    id: 'shado_pan',
    label: 'Shado-Pan',
    internalId: 'shado_pan',
    treeId: 'shado-pan-hero',
  },
  {
    id: 'conduit_of_the_celestials',
    label: 'Conduit of the Celestials',
    internalId: 'conduit_of_the_celestials',
    treeId: 'conduit-of-the-celestials-hero',
  },
];

const MONK_WINDWALKER_EXPLICIT_PARENT_IDS: Readonly<Record<string, readonly string[]>> = {
  'windwalker-spec:brawlers_intensity': ['glory_of_the_dawn'],
  'windwalker-spec:combo_breaker': ['brawlers_intensity'],
  'windwalker-spec:crashing_fists': ['crane_vortex', 'meridian_strikes', 'rising_star'],
  'windwalker-spec:dance_of_chi_ji': ['crashing_fists'],
  'windwalker-spec:shadowboxing_treads': ['crashing_fists'],
  'windwalker-spec:drinking_horn_cover': ['zenith'],
  'windwalker-spec:skyfire_heel': ['thunderfist'],
  'windwalker-spec:flurry_of_xuen': ['thunderfist'],
  'monk-class:transcendence': ['spear_hand_strike'],
  'monk-class:energy_transfer': ['spear_hand_strike'],
  'monk-class:peace_and_prosperity': ['ring_of_peace'],
  'monk-class:yulons_grace': ['ferocity_of_xuen', 'ring_of_peace', 'song_of_chi_ji'],
  'monk-class:strength_of_spirit': ['yulons_grace'],
  'monk-class:zenith_stomp': ['yulons_grace'],
  'monk-class:martial_instincts': ['ironshell_brew', 'celestial_determination'],
  'monk-class:fatal_touch': ['chi_transfer', 'martial_instincts'],
  'shado-pan-hero:flurry_strikes': [],
  'shado-pan-hero:pride_of_pandaria': ['flurry_strikes'],
  'shado-pan-hero:high_impact': ['flurry_strikes'],
  'shado-pan-hero:veterans_eye': ['flurry_strikes'],
  'shado-pan-hero:martial_precision': ['flurry_strikes'],
  'shado-pan-hero:shado_over_the_battlefield': ['flurry_strikes'],
  'shado-pan-hero:combat_stance': ['pride_of_pandaria'],
  'shado-pan-hero:initiators_edge': ['pride_of_pandaria'],
  'shado-pan-hero:one_versus_many': ['veterans_eye'],
  'shado-pan-hero:whirling_steel': ['martial_precision'],
  'shado-pan-hero:predictive_training': ['initiators_edge'],
  'shado-pan-hero:stand_ready': ['shado_over_the_battlefield'],
  'shado-pan-hero:against_all_odds': ['combat_stance'],
  'shado-pan-hero:efficient_training': ['one_versus_many'],
  'shado-pan-hero:vigilant_watch': ['whirling_steel'],
  'shado-pan-hero:weapons_of_the_wall': ['stand_ready'],
  'shado-pan-hero:wisdom_of_the_wall': [
    'against_all_odds',
    'efficient_training',
    'vigilant_watch',
    'weapons_of_the_wall',
  ],
};

/**
 * Return the full Windwalker Monk talent catalog in decoder order.
 *
 * The catalog includes all class, specialization, and hero nodes that can
 * apply to Windwalker, including both branches for choice nodes.
 */
export function getMonkWindwalkerTalentCatalog(): TalentNodeDefinition[] {
  return getTalentCatalog(MONK_WINDWALKER_TALENT_LOADOUT);
}

export function getTalentLoadoutForProfileSpec(spec: string): TalentLoadoutDefinition {
  switch (spec) {
    case 'monk':
      return MONK_WINDWALKER_TALENT_LOADOUT;
    case 'shaman':
      return SHAMAN_ENHANCEMENT_TALENT_LOADOUT;
    default:
      throw new Error(`No talent loadout registered for profile spec '${spec}'`);
  }
}

export function getTalentCatalogForProfileSpec(spec: string): TalentNodeDefinition[] {
  return getTalentCatalog(getTalentLoadoutForProfileSpec(spec));
}

export function getTalentCatalog(definition: TalentLoadoutDefinition): TalentNodeDefinition[] {
  return [...definition.nodes];
}

/**
 * Decode a SimC / WoW talent loadout string for Windwalker Monk.
 *
 * Returns the selected talents with their chosen branch and purchased rank.
 * Invalid strings or non-Windwalker strings return an empty array.
 */
export function decodeMonkWindwalkerTalentString(talentString: string): DecodedTalent[] {
  return decodeTalentLoadoutString(MONK_WINDWALKER_TALENT_LOADOUT, talentString);
}

export function decodeShamanEnhancementTalentString(talentString: string): DecodedTalent[] {
  return decodeTalentLoadoutString(SHAMAN_ENHANCEMENT_TALENT_LOADOUT, talentString);
}

export function decodeTalentStringForProfileSpec(spec: string, talentString: string): DecodedTalent[] {
  return decodeTalentLoadoutString(getTalentLoadoutForProfileSpec(spec), talentString);
}

export const DEFAULT_MONK_WINDWALKER_APL_TALENT_STRING =
  'C0QAAAAAAAAAAAAAAAAAAAAAAMzYw2wwsMzMbzAAAAAAAAAAAAsMMCzYbYAzYYmZmhZZYGmlZCAYzMbzMMmZGAAbAwsMLNzMzCAGYmBAWGDxAG';

export const DEFAULT_SHAMAN_ENHANCEMENT_APL_TALENT_STRING =
  DEFAULT_SHAMAN_ENHANCEMENT_SIMC_TALENT_METADATA_TALENT_STRING;

export function decodeTalentLoadoutString(
  definition: TalentLoadoutDefinition,
  talentString: string,
): DecodedTalent[] {
  if (!talentString || talentString.length === 0) {
    return [];
  }

  const bits = decodeTalentBits(talentString);
  if (!bits) {
    return [];
  }

  let offset = 0;
  const readBits = (count: number): number => {
    let value = 0;
    for (let bitIndex = 0; bitIndex < count; bitIndex += 1) {
      if (offset >= bits.length) {
        return value;
      }

      value |= bits[offset] << bitIndex;
      offset += 1;
    }
    return value;
  };

  const version = readBits(VERSION_BITS);
  const specId = readBits(SPEC_BITS);
  readBits(TREE_BITS);

  if (version !== definition.version || specId !== definition.specId) {
    return [];
  }

  const decodedTalents: DecodedTalent[] = [];
  const visibleNodesByOrder = new Map(definition.nodes.map((node) => [node.order, node]));
  let selectedHeroTreeId: string | null = null;

  for (const node of definition.serializedNodes) {
    const selected = readBits(1);
    if (selected === 0) {
      continue;
    }

    const purchased = readBits(1);
    let rank = purchased === 1 ? node.maxRank : 1;
    let choiceIndex = 0;

    if (purchased === 1) {
      const partiallyRanked = readBits(1);
      if (partiallyRanked === 1) {
        rank = readBits(RANK_BITS);
      }

      const hasChoice = readBits(1);
      if (hasChoice === 1) {
        choiceIndex = readBits(CHOICE_BITS);
      }
    }

    if (node.treeIndex === TREE_INDEX_HERO_SELECTION) {
      selectedHeroTreeId = definition.heroTreeSelectionOrder?.[choiceIndex] ?? selectedHeroTreeId;
      continue;
    }

    const visibleNode = visibleNodesByOrder.get(node.order);
    if (!visibleNode) {
      continue;
    }

    const name = visibleNode.names[Math.min(choiceIndex, visibleNode.names.length - 1)] ?? visibleNode.names[0];

    decodedTalents.push({
      name,
      internalId: toInternalTalentId(name),
      rank,
      maxRank: visibleNode.maxRank,
      tree: visibleNode.tree,
      treeId: visibleNode.treeId,
      pointPool: visibleNode.pointPool,
      order: visibleNode.order,
    });
  }

  if (!selectedHeroTreeId) {
    return decodedTalents;
  }

  return decodedTalents.filter((talent) => talent.tree !== 'hero' || talent.treeId === selectedHeroTreeId);
}

export function decodeTalentLoadoutState(
  definition: TalentLoadoutDefinition,
  talentString: string,
): { talents: Set<string>; talentRanks: Map<string, number> } | null {
  const decoded = decodeTalentLoadoutString(definition, talentString);
  if (decoded.length === 0) {
    return null;
  }

  return {
    talents: new Set(decoded.map((talent) => talent.internalId)),
    talentRanks: new Map(decoded.map((talent) => [talent.internalId, talent.rank])),
  };
}

function decodeTalentBits(talentString: string): number[] | null {
  const bits: number[] = [];

  for (const character of talentString) {
    const characterValue = BASE64_CHARACTERS.indexOf(character);
    if (characterValue === -1) {
      return null;
    }

    for (let bitIndex = 0; bitIndex < BITS_PER_CHARACTER; bitIndex += 1) {
      bits.push((characterValue >> bitIndex) & 1);
    }
  }

  return bits;
}

function getTreeName(treeIndex: number): DecodedTalentTreeInternal | null {
  if (treeIndex === TREE_INDEX_CLASS) {
    return 'class';
  }

  if (treeIndex === TREE_INDEX_SPECIALIZATION) {
    return 'specialization';
  }

  if (treeIndex === TREE_INDEX_HERO) {
    return 'hero';
  }

  return null;
}

function buildTalentLoadoutFromSimcMetadata(
  metadata: GeneratedSimcTalentLoadoutMetadata,
): TalentLoadoutDefinition {
  const activeSpellIds = new Set(metadata.activeSpellIds);
  const serializedNodes: SerializedTalentNodeDefinition[] = metadata.rawNodeGroups.map((group) => {
    const validNames = group.entries
      .map((entry) => entry.name)
      .filter((name) => name && name !== '0');

    return {
      order: group.order,
      treeIndex: group.treeIndex,
      tree: getTreeName(group.treeIndex),
      nodeType: group.nodeType,
      maxRank: group.maxRank,
      isVisibleToCurrentSpec: true,
      names: validNames,
      internalIds: validNames.map((name) => toInternalTalentId(name)),
    };
  });

  const nodes: TalentNodeDefinition[] = metadata.rawNodeGroups
    .filter((group) => group.treeIndex !== TREE_INDEX_HERO_SELECTION && group.treeId !== null)
    .map((group) => {
      const names = group.entries.map((entry) => entry.name).filter((name) => name && name !== '0');
      const internalIds = names.map((name) => toInternalTalentId(name));
      const tree = getTreeName(group.treeIndex);
      if (!tree || !group.treeId) {
        throw new Error(`Generated SimC metadata contains an invalid visible node for '${metadata.id}'`);
      }

      return {
        order: group.order,
        tree,
        treeId: group.treeId,
        pointPool: tree,
        nodeType: group.nodeType,
        visualType:
          group.nodeType === 2
            ? 'choice'
            : group.entries.some((entry) => activeSpellIds.has(entry.spellId))
              ? 'active'
              : 'passive',
        maxRank: group.maxRank,
        names,
        internalIds,
        layoutPosition: group.row > 0 && group.col > 0 ? { row: group.row, col: group.col } : undefined,
        granted: group.granted,
      };
    });

  return {
    id: metadata.id,
    version: metadata.version,
    specId: metadata.specId,
    trees: metadata.trees,
    heroTreeChoices: metadata.heroTreeChoices,
    heroTreeSelectionOrder: metadata.heroTreeSelectionOrder,
    serializedNodes,
    nodes,
  };
}

function buildMonkWindwalkerSerializedNodes(): SerializedTalentNodeDefinition[] {
  return MONK_WW_TALENT_NODES.map(([treeIndex, nodeType, maxRank, appliesToWindwalker, names], order) => {
    const validNames = names.filter((name) => name && name !== '0');
      return {
        order,
        treeIndex,
        tree: getTreeName(treeIndex),
        nodeType,
        maxRank,
        isVisibleToCurrentSpec: appliesToWindwalker,
        names: validNames,
        internalIds: validNames.map((name) => toInternalTalentId(name)),
      };
    });
}

function buildMonkWindwalkerTalentNodes(
  serializedNodes: readonly SerializedTalentNodeDefinition[],
): MonkWindwalkerTalentNodeDefinition[] {
  const nodes: MonkWindwalkerTalentNodeDefinition[] = [];

  for (const node of serializedNodes) {
    if (!node.isVisibleToCurrentSpec || !node.tree || node.names.length === 0) {
      continue;
    }

    const treeId = resolveWindwalkerTreeId(node.tree, node.internalIds);
    nodes.push({
      order: node.order,
      tree: node.tree,
      treeId,
      pointPool: node.tree,
      nodeType: node.nodeType,
      visualType: resolveMonkWindwalkerVisualType(node),
      maxRank: node.maxRank,
      names: node.names,
      internalIds: node.internalIds,
      layoutPosition: resolveMonkWindwalkerLayoutPosition(treeId, node.internalIds),
      parentInternalIds: resolveMonkWindwalkerParentIds(treeId, node.internalIds),
      detached: node.internalIds.includes('tigereye_brew'),
      granted: node.internalIds.some((internalId) => MONK_WINDWALKER_GRANTED_TALENTS.has(internalId)),
    });
  }

  return nodes;
}

function resolveWindwalkerTreeId(
  tree: DecodedTalentTree,
  internalIds: readonly string[],
): string {
  if (tree === 'class') {
    return 'monk-class';
  }

  if (tree === 'specialization') {
    return 'windwalker-spec';
  }

  for (const internalId of internalIds) {
    if (WINDWALKER_CONDUIT_HERO_TALENTS.has(internalId)) {
      return 'conduit-of-the-celestials-hero';
    }
  }

  return 'shado-pan-hero';
}

function resolveMonkWindwalkerVisualType(
  node: SerializedTalentNodeDefinition,
): MonkWindwalkerTalentNodeDefinition['visualType'] {
  if (node.nodeType === 2) {
    return 'choice';
  }

  return node.internalIds.some((internalId) => MONK_WINDWALKER_ACTIVE_TALENTS.has(internalId))
    ? 'active'
    : 'passive';
}

function resolveMonkWindwalkerLayoutPosition(
  treeId: string,
  internalIds: readonly string[],
): SimcTalentLayoutPosition | undefined {
  for (const internalId of internalIds) {
    const position = MONK_WINDWALKER_SIMC_LAYOUT_POSITIONS[`${treeId}:${internalId}`];
    if (position) {
      return position;
    }
  }

  return undefined;
}

function resolveMonkWindwalkerParentIds(
  treeId: string,
  internalIds: readonly string[],
): readonly string[] | undefined {
  for (const internalId of internalIds) {
    const parentIds = MONK_WINDWALKER_EXPLICIT_PARENT_IDS[`${treeId}:${internalId}`];
    if (parentIds !== undefined) {
      return parentIds;
    }
  }

  return undefined;
}

const WINDWALKER_CONDUIT_HERO_TALENTS = new Set([
  'path_of_the_falling_star',
  'inner_compass',
  'temple_training',
  'xuens_guidance',
  'chijis_swiftness',
  'niuzaos_protection',
  'jade_sanctuary',
  'unity_within',
  'courage_of_the_white_tiger',
  'invoke_xuen_the_white_tiger',
  'flowing_wisdom',
  'heart_of_the_jade_serpent',
  'strength_of_the_black_ox',
  'yulons_avatar',
  'celestial_conduit',
  'restore_balance',
  'xuens_bond',
]);

const MONK_WINDWALKER_GRANTED_TALENTS = new Set([
  'paralysis',
  'rising_sun_kick',
  'flurry_strikes',
  'invoke_xuen_the_white_tiger',
]);

const MONK_WINDWALKER_ACTIVE_TALENTS = new Set([
  'soothing_mist',
  'paralysis',
  'rising_sun_kick',
  'tigers_lust',
  'disable',
  'detox',
  'transcendence',
  'fortifying_brew',
  'chi_torpedo',
  'ring_of_peace',
  'song_of_chi_ji',
  'diffuse_magic',
  'spear_hand_strike',
  'fists_of_fury',
  'tigereye_brew',
  'jadefire_stomp',
  'zenith',
  'rushing_wind_kick',
  'slicing_winds',
  'whirling_dragon_punch',
  'strike_of_the_windlord',
  'invoke_xuen_the_white_tiger',
  'celestial_conduit',
]);

const MONK_WINDWALKER_SERIALIZED_NODES = buildMonkWindwalkerSerializedNodes();

export const SHAMAN_ENHANCEMENT_TALENT_LOADOUT = buildTalentLoadoutFromSimcMetadata(
  SHAMAN_ENHANCEMENT_SIMC_TALENT_METADATA,
);

export const MONK_WINDWALKER_TALENT_LOADOUT: TalentLoadoutDefinition = {
  id: 'monk-windwalker',
  version: LOADOUT_SERIALIZATION_VERSION,
  specId: WINDWALKER_SPEC_ID,
  trees: MONK_WINDWALKER_TREE_DEFINITIONS,
  heroTreeChoices: MONK_WINDWALKER_HERO_TREE_CHOICES,
  heroTreeSelectionOrder: ['conduit-of-the-celestials-hero', 'shado-pan-hero'],
  serializedNodes: MONK_WINDWALKER_SERIALIZED_NODES,
  nodes: buildMonkWindwalkerTalentNodes(MONK_WINDWALKER_SERIALIZED_NODES),
};

function toInternalTalentId(name: string): string {
  const override = TALENT_ID_OVERRIDES[name];
  if (override) {
    return override;
  }

  return name
    .toLowerCase()
    .replace(/['.,]/g, '')
    .replace(/-/g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
