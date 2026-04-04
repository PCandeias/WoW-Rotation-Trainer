import type { ActionBarSlotDef } from '@ui/specs/actionBarTypes';
import { WW_ACTION_BAR } from '@ui/specs/monk/actionBar';
import { ENHANCEMENT_ACTION_BAR } from '@ui/specs/shaman/actionBar';
import { TARGET_DEBUFF_SPELL_IDS, TRACKED_BUFF_SPELL_IDS } from '@ui/components/trackerSpellIds';
import { T } from '@ui/theme/elvui';

export const TRAINER_SPEC_IDS = [
  'monk-windwalker',
  'shaman-enhancement',
  'paladin-retribution',
  'demonhunter-devourer',
  'mage-arcane',
] as const;

export type TrainerSpecId = (typeof TRAINER_SPEC_IDS)[number];
export type TrainerSpecStatus = 'playable' | 'coming-soon';

export interface SpecActionBarButtonDefault {
  readonly spellIds: readonly string[];
  readonly keybind: string;
}

export interface SpecActionBarConfigDefault {
  readonly enabled: boolean;
  readonly buttonCount: number;
  readonly buttonsPerRow: number;
  readonly buttons: readonly SpecActionBarButtonDefault[];
}

export interface SpecTrackerEntryDefault {
  readonly glowWhenReady: boolean;
  readonly disableProcGlow: boolean;
  readonly cooldownGroup?: 'essential' | 'utility';
}

export interface SpecTrackerGroupDefaults {
  readonly trackedEntryIds: readonly string[];
  readonly iconsPerRow: number;
  readonly entryOptions: Readonly<Record<string, SpecTrackerEntryDefault>>;
}

export interface TrainerSpecUiDefaults {
  readonly actionBarSlots: readonly ActionBarSlotDef[];
  readonly actionBars: Readonly<Record<'bar1' | 'bar2' | 'bar3' | 'bar4' | 'bar5', SpecActionBarConfigDefault>>;
  readonly cooldowns: {
    readonly essential: SpecTrackerGroupDefaults;
    readonly utility: SpecTrackerGroupDefaults;
  };
  readonly buffs: {
    readonly iconTracker: SpecTrackerGroupDefaults;
    readonly barTracker: SpecTrackerGroupDefaults;
  };
  readonly consumables: {
    readonly trackedEntryIds: readonly string[];
  };
  readonly buffSpellIds: Readonly<Record<string, number>>;
  readonly targetDebuffSpellIds: Readonly<Record<string, number>>;
}

export interface TrainerSpecDefinition {
  readonly id: TrainerSpecId;
  /** SimC/profile parser class key used by runtime/profile plumbing, e.g. `monk`. */
  readonly profileSpec: string;
  /** Stable analysis/report identifier, e.g. `monk_windwalker`. */
  readonly analysisSpecId: string;
  readonly status: TrainerSpecStatus;
  readonly className: string;
  readonly specName: string;
  readonly heroTreeLabel: string;
  readonly iconName: string;
  readonly emoji: string;
  readonly accentColor: string;
  readonly description: string;
  readonly footerLabel: string;
  readonly stampLabel?: string;
  readonly uiDefaults?: TrainerSpecUiDefaults;
}

function buildDefaultButtons(spellIds: readonly string[]): SpecActionBarButtonDefault[] {
  return Array.from({ length: 12 }, (_, index) => ({
    spellIds: spellIds[index] ? [spellIds[index]] : [],
    keybind: WW_ACTION_BAR[index]?.defaultKey ?? '',
  }));
}

const WW_COOLDOWN_ENTRY_OPTIONS: Record<string, SpecTrackerEntryDefault> = {
  slicing_winds: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'utility' },
  touch_of_death: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
};

const WW_BUFF_ENTRY_OPTIONS: Record<string, SpecTrackerEntryDefault> = {
  combo_strikes: { glowWhenReady: false, disableProcGlow: false },
  combo_breaker: { glowWhenReady: false, disableProcGlow: false },
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
};

const ENHANCEMENT_COOLDOWN_ENTRY_OPTIONS: Record<string, SpecTrackerEntryDefault> = {
  stormstrike: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  lava_lash: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  crash_lightning: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  chain_lightning: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  lightning_bolt: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  voltaic_blaze: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  sundering: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  surging_totem: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  doom_winds: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  feral_lunge: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  bloodlust: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'essential' },
  feral_spirit: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'utility' },
  ascendance: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'utility' },
  astral_shift: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'utility' },
  wind_rush_totem: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'utility' },
  totemic_projection: { glowWhenReady: false, disableProcGlow: false, cooldownGroup: 'utility' },
};

const ENHANCEMENT_BUFF_ENTRY_OPTIONS: Record<string, SpecTrackerEntryDefault> = {
  maelstrom_weapon: { glowWhenReady: false, disableProcGlow: false },
  hot_hand: { glowWhenReady: false, disableProcGlow: false },
  raging_maelstrom: { glowWhenReady: false, disableProcGlow: false },
  molten_weapon: { glowWhenReady: false, disableProcGlow: false },
  crackling_surge: { glowWhenReady: false, disableProcGlow: false },
  surging_totem: { glowWhenReady: false, disableProcGlow: false },
  storm_unleashed: { glowWhenReady: false, disableProcGlow: false },
  whirling_fire: { glowWhenReady: false, disableProcGlow: false },
  whirling_air: { glowWhenReady: false, disableProcGlow: false },
  whirling_earth: { glowWhenReady: false, disableProcGlow: false },
};

const MONK_WINDWALKER_UI_DEFAULTS: TrainerSpecUiDefaults = {
  actionBarSlots: WW_ACTION_BAR,
  actionBars: {
    bar1: {
      enabled: true,
      buttonCount: 10,
      buttonsPerRow: 10,
      buttons: [
        { spellIds: ['tiger_palm'], keybind: '1' },
        { spellIds: ['blackout_kick'], keybind: '2' },
        { spellIds: ['rising_sun_kick'], keybind: '3' },
        { spellIds: ['fists_of_fury'], keybind: '4' },
        { spellIds: ['whirling_dragon_punch'], keybind: '5' },
        { spellIds: ['spinning_crane_kick'], keybind: '6' },
        { spellIds: [], keybind: '7' },
        { spellIds: [], keybind: '8' },
        { spellIds: [], keybind: '9' },
        { spellIds: [], keybind: '0' },
        { spellIds: ['touch_of_karma'], keybind: 'shift+r' },
        { spellIds: [], keybind: 'ctrl+4' },
      ],
    },
    bar2: {
      enabled: true,
      buttonCount: 10,
      buttonsPerRow: 10,
      buttons: [
        { spellIds: ['berserking', 'zenith'], keybind: 'shift+1' },
        { spellIds: ['potion', 'algethar_puzzle_box'], keybind: 'shift+2' },
        { spellIds: ['touch_of_death'], keybind: 'shift+3' },
        { spellIds: [], keybind: 'shift+4' },
        { spellIds: [], keybind: 'shift+5' },
        { spellIds: [], keybind: 'shift+6' },
        { spellIds: [], keybind: 'shift+7' },
        { spellIds: [], keybind: 'shift+8' },
        { spellIds: [], keybind: '9' },
        { spellIds: [], keybind: 'shift+0' },
        { spellIds: [], keybind: '=' },
        { spellIds: [], keybind: '0' },
      ],
    },
    bar3: {
      enabled: true,
      buttonCount: 10,
      buttonsPerRow: 10,
      buttons: [
        { spellIds: [], keybind: '1' },
        { spellIds: [], keybind: '2' },
        { spellIds: [], keybind: '3' },
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
    bar4: {
      enabled: false,
      buttonCount: 12,
      buttonsPerRow: 12,
      buttons: buildDefaultButtons([]),
    },
    bar5: {
      enabled: false,
      buttonCount: 12,
      buttonsPerRow: 12,
      buttons: buildDefaultButtons([]),
    },
  },
  cooldowns: {
    essential: {
      trackedEntryIds: [
        'tiger_palm',
        'blackout_kick',
        'rising_sun_kick',
        'fists_of_fury',
        'whirling_dragon_punch',
        'touch_of_death',
        'zenith',
        'spinning_crane_kick',
      ],
      iconsPerRow: 5,
      entryOptions: WW_COOLDOWN_ENTRY_OPTIONS,
    },
    utility: {
      trackedEntryIds: ['touch_of_karma'],
      iconsPerRow: 12,
      entryOptions: WW_COOLDOWN_ENTRY_OPTIONS,
    },
  },
  buffs: {
    iconTracker: {
      trackedEntryIds: [
        'berserking',
        'algethar_puzzle',
        'flurry_charge',
        'teachings_of_the_monastery',
        'momentum_boost',
        'hit_combo',
        'combo_breaker',
        'dance_of_chi_ji',
      ],
      iconsPerRow: 12,
      entryOptions: WW_BUFF_ENTRY_OPTIONS,
    },
    barTracker: {
      trackedEntryIds: ['berserking', 'algethar_puzzle'],
      iconsPerRow: 12,
      entryOptions: WW_BUFF_ENTRY_OPTIONS,
    },
  },
  consumables: {
    trackedEntryIds: [],
  },
  buffSpellIds: TRACKED_BUFF_SPELL_IDS,
  targetDebuffSpellIds: TARGET_DEBUFF_SPELL_IDS,
};

const SHAMAN_ENHANCEMENT_UI_DEFAULTS: TrainerSpecUiDefaults = {
  actionBarSlots: ENHANCEMENT_ACTION_BAR,
  actionBars: {
    bar1: {
      enabled: true,
      buttonCount: 10,
      buttonsPerRow: 10,
      buttons: [
        { spellIds: ['stormstrike'], keybind: '1' },
        { spellIds: ['lava_lash'], keybind: '2' },
        { spellIds: ['flame_shock'], keybind: '3' },
        { spellIds: ['lightning_bolt'], keybind: '4' },
        { spellIds: ['crash_lightning'], keybind: '5' },
        { spellIds: ['chain_lightning'], keybind: '6' },
        { spellIds: ['sundering'], keybind: '7' },
        { spellIds: ['feral_spirit'], keybind: '8' },
        { spellIds: ['surging_totem'], keybind: '9' },
        { spellIds: ['doom_winds'], keybind: '0' },
        { spellIds: ['feral_lunge'], keybind: '-' },
      ],
    },
    bar2: {
      enabled: true,
      buttonCount: 10,
      buttonsPerRow: 10,
      buttons: [
        { spellIds: ['bloodlust'], keybind: 'shift+1' },
        { spellIds: ['astral_shift'], keybind: 'shift+2' },
        { spellIds: ['wind_rush_totem'], keybind: 'shift+3' },
        { spellIds: ['totemic_projection'], keybind: 'shift+4' },
        { spellIds: ['ascendance'], keybind: 'shift+5' },
        { spellIds: ['blood_fury'], keybind: 'shift+6' },
        { spellIds: ['algethar_puzzle_box'], keybind: 'shift+7' },
        { spellIds: ['potion'], keybind: 'shift+8' },
        { spellIds: ['windfury_weapon'], keybind: 'shift+9' },
        { spellIds: ['flametongue_weapon'], keybind: 'shift+0' },
        { spellIds: [], keybind: 'shift+-' },
        { spellIds: [], keybind: 'shift+=' },
      ],
    },
    bar3: {
      enabled: false,
      buttonCount: 10,
      buttonsPerRow: 10,
      buttons: buildDefaultButtons([]),
    },
    bar4: {
      enabled: false,
      buttonCount: 12,
      buttonsPerRow: 12,
      buttons: buildDefaultButtons([]),
    },
    bar5: {
      enabled: false,
      buttonCount: 12,
      buttonsPerRow: 12,
      buttons: buildDefaultButtons([]),
    },
  },
  cooldowns: {
    essential: {
      trackedEntryIds: [
        'stormstrike',
        'lava_lash',
        'lightning_bolt',
        'chain_lightning',
        'voltaic_blaze',
        'crash_lightning',
        'sundering',
        'surging_totem',
        'doom_winds',
        'feral_lunge',
        'bloodlust',
      ],
      iconsPerRow: 5,
      entryOptions: ENHANCEMENT_COOLDOWN_ENTRY_OPTIONS,
    },
    utility: {
      trackedEntryIds: ['astral_shift', 'wind_rush_totem', 'totemic_projection'],
      iconsPerRow: 5,
      entryOptions: ENHANCEMENT_COOLDOWN_ENTRY_OPTIONS,
    },
  },
  buffs: {
    iconTracker: {
      trackedEntryIds: [
        'maelstrom_weapon',
        'hot_hand',
        'raging_maelstrom',
        'molten_weapon',
        'crackling_surge',
        'surging_totem',
        'storm_unleashed',
        'whirling_fire',
        'whirling_air',
        'whirling_earth',
      ],
      iconsPerRow: 6,
      entryOptions: ENHANCEMENT_BUFF_ENTRY_OPTIONS,
    },
    barTracker: {
      trackedEntryIds: ['surging_totem', 'storm_unleashed', 'molten_weapon', 'crackling_surge'],
      iconsPerRow: 6,
      entryOptions: ENHANCEMENT_BUFF_ENTRY_OPTIONS,
    },
  },
  consumables: {
    trackedEntryIds: [],
  },
  buffSpellIds: TRACKED_BUFF_SPELL_IDS,
  targetDebuffSpellIds: TARGET_DEBUFF_SPELL_IDS,
};

const TRAINER_SPEC_CATALOG: readonly TrainerSpecDefinition[] = [
  {
    id: 'monk-windwalker',
    profileSpec: 'monk',
    analysisSpecId: 'monk_windwalker',
    status: 'playable',
    className: 'Monk',
    specName: 'Windwalker',
    heroTreeLabel: 'Shado-Pan',
    iconName: 'spell_monk_windwalker_spec',
    emoji: '🐉',
    accentColor: T.classMonk,
    description: 'Agile melee training with the current Windwalker combat model.',
    footerLabel: 'Hero Tree · Shado-Pan',
    stampLabel: 'Under construction',
    uiDefaults: MONK_WINDWALKER_UI_DEFAULTS,
  },
  {
    id: 'shaman-enhancement',
    profileSpec: 'shaman',
    analysisSpecId: 'shaman_enhancement',
    status: 'playable',
    className: 'Shaman',
    specName: 'Enhancement',
    heroTreeLabel: 'Totemic / Stormbringer',
    iconName: 'spell_shaman_improvedstormstrike',
    emoji: '⚡',
    accentColor: '#0070de',
    description: 'Playable Enhancement Shaman training slice for SimC-parity validation and manual testing.',
    footerLabel: 'Hero Tree · Totemic / Stormbringer',
    stampLabel: 'Under construction',
    uiDefaults: SHAMAN_ENHANCEMENT_UI_DEFAULTS,
  },
  {
    id: 'paladin-retribution',
    profileSpec: 'paladin',
    analysisSpecId: 'paladin_retribution',
    status: 'coming-soon',
    className: 'Paladin',
    specName: 'Retribution',
    heroTreeLabel: 'Herald of the Sun / Templar',
    iconName: 'spell_holy_auraoflight',
    emoji: '⚔️',
    accentColor: '#f58cba',
    description: 'Midnight implementation planned from SimC-first spec docs.',
    footerLabel: 'Status · Coming Soon',
  },
  {
    id: 'demonhunter-devourer',
    profileSpec: 'demonhunter',
    analysisSpecId: 'demonhunter_devourer',
    status: 'coming-soon',
    className: 'Demon Hunter',
    specName: 'Devourer',
    heroTreeLabel: 'Midnight Devourer',
    iconName: 'ability_demonhunter_spectank',
    emoji: '🕳️',
    accentColor: '#a330c9',
    description: 'Midnight implementation planned from SimC-first spec docs.',
    footerLabel: 'Status · Coming Soon',
  },
  {
    id: 'mage-arcane',
    profileSpec: 'mage',
    analysisSpecId: 'mage_arcane',
    status: 'coming-soon',
    className: 'Mage',
    specName: 'Arcane',
    heroTreeLabel: 'Spellslinger / Sunfury',
    iconName: 'spell_holy_magicalsentry',
    emoji: '🔮',
    accentColor: '#69ccf0',
    description: 'Midnight implementation planned from SimC-first spec docs.',
    footerLabel: 'Status · Coming Soon',
  },
] as const;

const TRAINER_SPEC_BY_ID = new Map<TrainerSpecId, TrainerSpecDefinition>(
  TRAINER_SPEC_CATALOG.map((spec) => [spec.id, spec]),
);

export function getTrainerSpecCatalog(): readonly TrainerSpecDefinition[] {
  return TRAINER_SPEC_CATALOG;
}

export function getPlayableTrainerSpecs(): readonly TrainerSpecDefinition[] {
  return TRAINER_SPEC_CATALOG.filter((spec) => spec.status === 'playable');
}

export function getTrainerSpecDefinition(specId: TrainerSpecId): TrainerSpecDefinition {
  const spec = TRAINER_SPEC_BY_ID.get(specId);
  if (!spec) {
    throw new Error(`Unknown trainer spec '${specId}'`);
  }
  return spec;
}

export function getTrainerAnalysisSpecId(specId: TrainerSpecId): string {
  return getTrainerSpecDefinition(specId).analysisSpecId;
}

export function isTrainerSpecId(value: unknown): value is TrainerSpecId {
  return typeof value === 'string' && TRAINER_SPEC_BY_ID.has(value as TrainerSpecId);
}

export function isTrainerSpecPlayable(specId: TrainerSpecId): boolean {
  return getTrainerSpecDefinition(specId).status === 'playable';
}

export function getDefaultPlayableTrainerSpecId(): TrainerSpecId {
  const defaultSpec = TRAINER_SPEC_CATALOG.find((spec) => spec.status === 'playable');
  if (!defaultSpec) {
    throw new Error('No playable trainer spec is registered');
  }
  return defaultSpec.id;
}

export function getTrainerSpecUiDefaults(specId: TrainerSpecId): TrainerSpecUiDefaults {
  const spec = getTrainerSpecDefinition(specId);
  if (spec.status === 'playable' && spec.uiDefaults) {
    return spec.uiDefaults;
  }

  const fallbackSpec = getTrainerSpecDefinition(getDefaultPlayableTrainerSpecId());
  if (!fallbackSpec.uiDefaults) {
    throw new Error(`Playable trainer spec '${fallbackSpec.id}' is missing uiDefaults`);
  }
  return fallbackSpec.uiDefaults;
}
