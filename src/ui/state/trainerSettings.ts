import { useCallback, useState } from 'react';
import { cloneLoadout, type CharacterLoadout } from '@core/data/loadout';
import { getDefaultProfileForSpec } from '@core/data/defaultProfile';
import {
  getDefaultPlayableTrainerSpecId,
  getTrainerSpecDefinition,
  getTrainerSpecUiDefaults,
  getPlayableTrainerSpecs,
  isTrainerSpecId,
  isTrainerSpecPlayable,
  type TrainerSpecId,
  type SpecActionBarConfigDefault,
  type SpecTrackerGroupDefaults,
} from '@ui/specs/specCatalog';

export type TrainerMode = 'practice' | 'test' | 'tutorial' | 'challenge';
export type ChallengeDifficulty = 'easy' | 'hard';
export type PracticeSpeedMultiplier = 0.25 | 0.5 | 0.75 | 1;
export type ChallengeSpawnCadenceMultiplier = 0.5 | 1 | 2 | 3;
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
  spawnCadenceMultiplier: ChallengeSpawnCadenceMultiplier;
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

export interface TrainerSpecProfileSettings {
  talents: string[];
  talentRanks: Record<string, number>;
  loadout: CharacterLoadout;
  hud: HudSettings;
  actionBars: ActionBarSettings;
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
  /** Number of active enemies (1–8). Defaults to 1 (single-target patchwerk). */
  nTargets: number;
  audio: AudioSettings;
  specProfiles: Partial<Record<TrainerSpecId, TrainerSpecProfileSettings>>;
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
    enemyIcon: { xPct: 50, yPct: 26.10478046718211, scale: 1 },
    essentialCooldowns: { xPct: 50, yPct: 69.35866983372921, scale: 1 },
    utilityCooldowns: { xPct: 50, yPct: 79.33338749842035, scale: 1 },
    buffIcons: { xPct: 50, yPct: 57.232406004769565, scale: 1 },
    buffBars: { xPct: 64.24742005167691, yPct: 52.591819628753086, scale: 1 },
    consumables: { xPct: 34.489801903539444, yPct: 69.35866983372921, scale: 1 },
    challengePlayfield: { xPct: 52.01462697577773, yPct: 24.919701764575457, scale: 1.2726279003053582 },
    playerFrame: { xPct: 36.256785977113054, yPct: 62.871222552358866, scale: 1 },
    resourceFrame: { xPct: 50, yPct: 62.871222552358866, scale: 1 },
    targetFrame: { xPct: 64.24742005167691, yPct: 62.871222552358866, scale: 1 },
    castBar: { xPct: 50, yPct: 75.48662946590332, scale: 1 },
    actionBar1: { xPct: 50, yPct: 95, scale: 1 },
    actionBar2: { xPct: 50, yPct: 90.12810576874419, scale: 1 },
    actionBar3: { xPct: 74.95329598522025, yPct: 80.75769060353252, scale: 1.0636363636363637 },
    actionBar4: { xPct: 76.81102362204724, yPct: 75.48662946590332, scale: 1 },
    actionBar5: { xPct: 76.81102362204724, yPct: 69.35866983372921, scale: 1 },
  };
}

function cloneActionBarConfigDefaults(defaults: SpecActionBarConfigDefault): ActionBarConfig {
  return {
    enabled: defaults.enabled,
    buttonCount: defaults.buttonCount,
    buttonsPerRow: defaults.buttonsPerRow,
    buttons: defaults.buttons.map((button) => ({
      spellIds: [...button.spellIds],
      keybind: button.keybind,
    })),
  };
}

function cloneTrackerEntryOptions(
  entryOptions: SpecTrackerGroupDefaults['entryOptions'],
): Record<string, TrackerEntrySettings> {
  return Object.fromEntries(
    Object.entries(entryOptions).map(([key, value]) => [
      key,
      {
        glowWhenReady: value.glowWhenReady,
        disableProcGlow: value.disableProcGlow,
        cooldownGroup: value.cooldownGroup,
      },
    ]),
  );
}

function createTrackerGroupFromDefaults(
  defaults: SpecTrackerGroupDefaults,
  displayMode: 'icons' | 'bars',
): TrackerGroupSettings {
  return {
    ...createDefaultTrackerGroupSettings(displayMode, true, [...defaults.trackedEntryIds], defaults.iconsPerRow),
    entryOptions: cloneTrackerEntryOptions(defaults.entryOptions),
  };
}

function createDefaultActionBarSettings(selectedSpec: TrainerSpecId): ActionBarSettings {
  const defaults = getTrainerSpecUiDefaults(selectedSpec).actionBars;
  return {
    bars: {
      bar1: cloneActionBarConfigDefaults(defaults.bar1),
      bar2: cloneActionBarConfigDefaults(defaults.bar2),
      bar3: cloneActionBarConfigDefaults(defaults.bar3),
      bar4: cloneActionBarConfigDefaults(defaults.bar4),
      bar5: cloneActionBarConfigDefaults(defaults.bar5),
    },
  };
}

function cloneTrackerEntrySettings(value: TrackerEntrySettings): TrackerEntrySettings {
  return {
    glowWhenReady: value.glowWhenReady,
    disableProcGlow: value.disableProcGlow,
    cooldownGroup: value.cooldownGroup,
  };
}

function cloneTrackerGroupSettings(value: TrackerGroupSettings): TrackerGroupSettings {
  return {
    enabled: value.enabled,
    blacklistSpellIds: [...value.blacklistSpellIds],
    trackedSpellIds: [...value.trackedSpellIds],
    trackedEntryIds: [...value.trackedEntryIds],
    displayMode: value.displayMode,
    iconsPerRow: value.iconsPerRow,
    entryOptions: Object.fromEntries(
      Object.entries(value.entryOptions).map(([key, entry]) => [key, cloneTrackerEntrySettings(entry)]),
    ),
  };
}

function cloneHudLayoutSettings(value: HudLayoutSettings): HudLayoutSettings {
  return {
    enemyIcon: { ...value.enemyIcon },
    essentialCooldowns: { ...value.essentialCooldowns },
    utilityCooldowns: { ...value.utilityCooldowns },
    buffIcons: { ...value.buffIcons },
    buffBars: { ...value.buffBars },
    consumables: { ...value.consumables },
    challengePlayfield: { ...value.challengePlayfield },
    playerFrame: { ...value.playerFrame },
    resourceFrame: { ...value.resourceFrame },
    targetFrame: { ...value.targetFrame },
    castBar: { ...value.castBar },
    actionBar1: { ...value.actionBar1 },
    actionBar2: { ...value.actionBar2 },
    actionBar3: { ...value.actionBar3 },
    actionBar4: { ...value.actionBar4 },
    actionBar5: { ...value.actionBar5 },
  };
}

function cloneHudSettings(value: HudSettings): HudSettings {
  return {
    layout: cloneHudLayoutSettings(value.layout),
    general: { ...value.general },
    cooldowns: {
      essential: cloneTrackerGroupSettings(value.cooldowns.essential),
      utility: cloneTrackerGroupSettings(value.cooldowns.utility),
    },
    buffs: {
      iconTracker: cloneTrackerGroupSettings(value.buffs.iconTracker),
      barTracker: cloneTrackerGroupSettings(value.buffs.barTracker),
    },
    targetDebuffs: cloneTrackerGroupSettings(value.targetDebuffs),
    consumables: cloneTrackerGroupSettings(value.consumables),
  };
}

function cloneActionBarSettings(value: ActionBarSettings): ActionBarSettings {
  return {
    bars: Object.fromEntries(
      ACTION_BAR_IDS.map((barId) => [
        barId,
        {
          enabled: value.bars[barId].enabled,
          buttonCount: value.bars[barId].buttonCount,
          buttonsPerRow: value.bars[barId].buttonsPerRow,
          buttons: value.bars[barId].buttons.map((button) => ({
            spellIds: [...button.spellIds],
            keybind: button.keybind,
          })),
        },
      ]),
    ) as Record<ActionBarId, ActionBarConfig>,
  };
}

function cloneTrainerSpecProfileSettings(value: TrainerSpecProfileSettings): TrainerSpecProfileSettings {
  return {
    talents: [...value.talents],
    talentRanks: { ...value.talentRanks },
    loadout: cloneLoadout(value.loadout),
    hud: cloneHudSettings(value.hud),
    actionBars: cloneActionBarSettings(value.actionBars),
  };
}

function createDefaultTrainerSpecProfileSettings(selectedSpec: TrainerSpecId): TrainerSpecProfileSettings {
  const uiDefaults = getTrainerSpecUiDefaults(selectedSpec);
  const profileSpec = getTrainerSpecDefinition(selectedSpec).profileSpec;
  const defaultProfile = getDefaultProfileForSpec(profileSpec);
  const sortedTalents = [...defaultProfile.talents].sort();
  const talentRanks = Object.fromEntries(
    [...defaultProfile.talentRanks.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    talents: sortedTalents,
    talentRanks,
    loadout: cloneLoadout(defaultProfile.loadout),
    hud: {
      layout: getDefaultHudLayoutSettings(),
      general: {
        showEnemyIcon: false,
        showMeleeSwingDamage: false,
        showDamageText: true,
        layoutScale: 1,
      },
      cooldowns: {
        essential: createTrackerGroupFromDefaults(uiDefaults.cooldowns.essential, 'icons'),
        utility: createTrackerGroupFromDefaults(uiDefaults.cooldowns.utility, 'icons'),
      },
      buffs: {
        iconTracker: createTrackerGroupFromDefaults(uiDefaults.buffs.iconTracker, 'icons'),
        barTracker: createTrackerGroupFromDefaults(uiDefaults.buffs.barTracker, 'bars'),
      },
      targetDebuffs: createDefaultTrackerGroupSettings('icons'),
      consumables: createDefaultTrackerGroupSettings('icons', true, [...uiDefaults.consumables.trackedEntryIds]),
    },
    actionBars: createDefaultActionBarSettings(selectedSpec),
  };
}

function createDefaultSpecProfiles(): Partial<Record<TrainerSpecId, TrainerSpecProfileSettings>> {
  return Object.fromEntries(
    getPlayableTrainerSpecs().map((spec) => [spec.id, createDefaultTrainerSpecProfileSettings(spec.id)]),
  ) as Partial<Record<TrainerSpecId, TrainerSpecProfileSettings>>;
}

function resolveSelectedSpecProfile(
  settings: Pick<TrainerSettings, 'selectedSpec' | 'specProfiles'>,
): TrainerSpecProfileSettings {
  const selected = settings.specProfiles[settings.selectedSpec];
  return selected
    ? cloneTrainerSpecProfileSettings(selected)
    : createDefaultTrainerSpecProfileSettings(settings.selectedSpec);
}

function syncActiveSpecIntoProfiles(settings: TrainerSettings): TrainerSettings {
  const specProfiles: Partial<Record<TrainerSpecId, TrainerSpecProfileSettings>> = {
    ...settings.specProfiles,
    [settings.selectedSpec]: {
      talents: [...settings.talents],
      talentRanks: { ...settings.talentRanks },
      loadout: cloneLoadout(settings.loadout),
      hud: cloneHudSettings(settings.hud),
      actionBars: cloneActionBarSettings(settings.actionBars),
    },
  };

  return {
    ...settings,
    specProfiles,
  };
}

function applySelectedSpecProfile(settings: TrainerSettings): TrainerSettings {
  const selectedProfile = resolveSelectedSpecProfile(settings);

  return {
    ...settings,
    talents: [...selectedProfile.talents],
    talentRanks: { ...selectedProfile.talentRanks },
    loadout: cloneLoadout(selectedProfile.loadout),
    hud: cloneHudSettings(selectedProfile.hud),
    actionBars: cloneActionBarSettings(selectedProfile.actionBars),
  };
}

/**
 * Returns the shipped default trainer settings.
 */
export function getDefaultTrainerSettings(selectedSpec: TrainerSpecId = getDefaultPlayableTrainerSpecId()): TrainerSettings {
  const effectiveSelectedSpec = isTrainerSpecPlayable(selectedSpec)
    ? selectedSpec
    : getDefaultPlayableTrainerSpecId();
  const specProfiles = createDefaultSpecProfiles();
  const activeProfile = specProfiles[effectiveSelectedSpec] ?? createDefaultTrainerSpecProfileSettings(effectiveSelectedSpec);

  return {
    selectedSpec: effectiveSelectedSpec,
    mode: 'test',
    practiceSpeedMultiplier: 1,
    challenge: {
      difficulty: 'hard',
      validKeys: [...DEFAULT_CHALLENGE_VALID_KEYS],
      spawnCadenceMultiplier: 0.5,
    },
    encounterPreset: 'fight30',
    nTargets: 1,
    audio: {
      musicVolume: 1,
    },
    specProfiles,
    talents: [...activeProfile.talents],
    talentRanks: { ...activeProfile.talentRanks },
    loadout: cloneLoadout(activeProfile.loadout),
    hud: cloneHudSettings(activeProfile.hud),
    actionBars: cloneActionBarSettings(activeProfile.actionBars),
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

function sanitizeActionBarSettings(
  value: unknown,
  fallback: ActionBarSettings,
  selectedSpec: TrainerSpecId,
): ActionBarSettings {
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

  const migrated = createDefaultActionBarSettings(selectedSpec);
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

  return sanitizeActionBarSettings(migrated, fallback, selectedSpec);
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

function sanitizeSpecProfileSettings(
  value: unknown,
  fallback: TrainerSpecProfileSettings,
  selectedSpec: TrainerSpecId,
): TrainerSpecProfileSettings {
  return {
    talents: sanitizeStringArray(isRecord(value) ? value.talents : undefined).length > 0
      ? sanitizeStringArray(isRecord(value) ? value.talents : undefined)
      : [...fallback.talents],
    talentRanks: sanitizeTalentRanks(isRecord(value) ? value.talentRanks : undefined, fallback.talentRanks),
    loadout: sanitizeLoadout(isRecord(value) ? value.loadout : undefined, fallback.loadout),
    hud: sanitizeHudSettings(isRecord(value) ? value.hud : undefined, fallback.hud),
    actionBars: sanitizeActionBarSettings(isRecord(value) ? value.actionBars : undefined, fallback.actionBars, selectedSpec),
  };
}

function sanitizeSpecProfiles(
  value: unknown,
  fallback: Partial<Record<TrainerSpecId, TrainerSpecProfileSettings>>,
): Partial<Record<TrainerSpecId, TrainerSpecProfileSettings>> {
  const rawProfiles = isRecord(value) ? value : {};
  const next: Partial<Record<TrainerSpecId, TrainerSpecProfileSettings>> = {};

  for (const spec of getPlayableTrainerSpecs()) {
    const fallbackProfile = fallback[spec.id] ?? createDefaultTrainerSpecProfileSettings(spec.id);
    next[spec.id] = sanitizeSpecProfileSettings(rawProfiles[spec.id], fallbackProfile, spec.id);
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

  const selectedSpec = isTrainerSpecId(value.selectedSpec) && isTrainerSpecPlayable(value.selectedSpec)
    ? value.selectedSpec
    : fallback.selectedSpec;

  const specProfiles = sanitizeSpecProfiles(value.specProfiles, fallback.specProfiles);
  specProfiles[selectedSpec] = sanitizeSpecProfileSettings(
    {
      talents: value.talents,
      talentRanks: value.talentRanks,
      loadout: value.loadout,
      hud: value.hud,
      actionBars: value.actionBars,
    },
    specProfiles[selectedSpec] ?? fallback.specProfiles[selectedSpec] ?? createDefaultTrainerSpecProfileSettings(selectedSpec),
    selectedSpec,
  );
  const activeProfile = specProfiles[selectedSpec] ?? createDefaultTrainerSpecProfileSettings(selectedSpec);

  return {
    selectedSpec,
    mode: value.mode === 'practice' || value.mode === 'test' || value.mode === 'tutorial' || value.mode === 'challenge'
      ? value.mode
      : fallback.mode,
    practiceSpeedMultiplier: normalizePracticeSpeedMultiplier(value.practiceSpeedMultiplier, fallback.practiceSpeedMultiplier),
    challenge: normalizeChallengeSettings(value.challenge, fallback.challenge),
    encounterPreset: normalizeEncounterPreset(value.encounterPreset, fallback.encounterPreset),
    nTargets: typeof value.nTargets === 'number' && Number.isInteger(value.nTargets) && value.nTargets >= 1 && value.nTargets <= 8
      ? value.nTargets
      : fallback.nTargets,
    audio: sanitizeAudioSettings(value.audio, fallback.audio),
    specProfiles,
    talents: [...activeProfile.talents],
    talentRanks: { ...activeProfile.talentRanks },
    loadout: sanitizeLoadout(activeProfile.loadout, activeProfile.loadout),
    hud: sanitizeHudSettings(activeProfile.hud, activeProfile.hud),
    actionBars: sanitizeActionBarSettings(activeProfile.actionBars, activeProfile.actionBars, selectedSpec),
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
    spawnCadenceMultiplier: normalizeChallengeSpawnCadenceMultiplier(
      value.spawnCadenceMultiplier ?? value.disappearSpeedMultiplier,
      fallback.spawnCadenceMultiplier,
    ),
  };
}

function normalizePracticeSpeedMultiplier(value: unknown, fallback: PracticeSpeedMultiplier): PracticeSpeedMultiplier {
  return value === 0.25 || value === 0.5 || value === 0.75 || value === 1 ? value : fallback;
}

function normalizeChallengeSpawnCadenceMultiplier(
  value: unknown,
  fallback: ChallengeSpawnCadenceMultiplier,
): ChallengeSpawnCadenceMultiplier {
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

    return syncActiveSpecIntoProfiles({
      ...settings,
      actionBars: { bars },
    });
  } catch {
    return settings;
  }
}

export function switchTrainerSpec(settings: TrainerSettings, nextSpec: TrainerSpecId): TrainerSettings {
  if (!isTrainerSpecPlayable(nextSpec)) {
    return settings;
  }

  const synced = syncActiveSpecIntoProfiles(settings);
  const nextProfile = synced.specProfiles[nextSpec] ?? createDefaultTrainerSpecProfileSettings(nextSpec);

  return {
    ...synced,
    selectedSpec: nextSpec,
    talents: [...nextProfile.talents],
    talentRanks: { ...nextProfile.talentRanks },
    loadout: cloneLoadout(nextProfile.loadout),
    hud: cloneHudSettings(nextProfile.hud),
    actionBars: cloneActionBarSettings(nextProfile.actionBars),
  };
}

export function copyActionBarLayoutAndKeybindsFromSpec(
  settings: TrainerSettings,
  sourceSpec: TrainerSpecId,
): TrainerSettings {
  if (!isTrainerSpecPlayable(sourceSpec) || sourceSpec === settings.selectedSpec) {
    return settings;
  }

  const synced = syncActiveSpecIntoProfiles(settings);
  const sourceProfile = synced.specProfiles[sourceSpec];
  if (!sourceProfile) {
    return settings;
  }

  const nextActionBars = cloneActionBarSettings(synced.actionBars);
  for (const barId of ACTION_BAR_IDS) {
    const sourceBar = sourceProfile.actionBars.bars[barId];
    const targetBar = nextActionBars.bars[barId];
    nextActionBars.bars[barId] = {
      ...targetBar,
      enabled: sourceBar.enabled,
      buttonCount: sourceBar.buttonCount,
      buttonsPerRow: sourceBar.buttonsPerRow,
      buttons: targetBar.buttons.map((button, index) => ({
        spellIds: [...button.spellIds],
        keybind: sourceBar.buttons[index]?.keybind ?? button.keybind,
      })),
    };
  }

  const nextHud = cloneHudSettings(synced.hud);
  nextHud.layout.actionBar1 = { ...sourceProfile.hud.layout.actionBar1 };
  nextHud.layout.actionBar2 = { ...sourceProfile.hud.layout.actionBar2 };
  nextHud.layout.actionBar3 = { ...sourceProfile.hud.layout.actionBar3 };
  nextHud.layout.actionBar4 = { ...sourceProfile.hud.layout.actionBar4 };
  nextHud.layout.actionBar5 = { ...sourceProfile.hud.layout.actionBar5 };

  return applySelectedSpecProfile(syncActiveSpecIntoProfiles({
    ...synced,
    hud: nextHud,
    actionBars: nextActionBars,
  }));
}

/**
 * Persists trainer settings to localStorage while keeping React state in sync.
 */
export function useTrainerSettings(): [TrainerSettings, (next: TrainerSettingsUpdater) => void] {
  const [settings, setSettingsState] = useState<TrainerSettings>(readFromStorage);

  const setSettings = useCallback((next: TrainerSettingsUpdater): void => {
    setSettingsState((current) => {
      const updated = typeof next === 'function' ? next(current) : next;
      const resolved = normalizeTrainerSettings(syncActiveSpecIntoProfiles(updated));
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
