import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AbilityIcon } from './AbilityIcon';
import { SearchableTextInput, type SearchSuggestion } from './SearchableTextInput';
import { ActionBar, SPELL_ICONS, WW_ACTION_BAR, type ActionBarButtonAssignment, type ActionBarSlotDef } from './ActionBar';
import { PlayerFrame } from './PlayerFrame';
import { EnergyChiDisplay } from './EnergyChiDisplay';
import { CooldownManager } from './CooldownManager';
import { CastBar } from './CastBar';
import { BuffTracker } from './BuffTracker';
import { BuffBarTracker } from './BuffBarTracker';
import { ConsumableTracker } from './ConsumableTracker';
import { ChallengeOverlay } from './ChallengeOverlay';
import { ChallengeHud } from './ChallengeHud';
import { FONTS, T } from '@ui/theme/elvui';
import { buildControlStyle, buildHudFrameStyle, buildPanelStyle } from '@ui/theme/stylePrimitives';
import type { GameStateSnapshot } from '@core/engine/gameState';
import type { SpellInputStatus } from '@core/engine/spell_input';
import { MONK_BUFF_REGISTRY, resolveMonkBuffIconName } from '@core/class_modules/monk/monk_buff_registry';
import {
  ACTION_BAR_IDS,
  type ActionBarId,
  type ActionBarButtonSettings,
  type ActionBarSettings,
  getDefaultHudLayoutSettings,
  type HudGroupLayout,
  type HudLayoutSettings,
  type TrackerGroupSettings,
  type TrainerSettingsUpdater,
} from '@ui/state/trainerSettings';
import { MONK_WW_SPELLS } from '@data/spells/monk_windwalker';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';
import { createEmptyChallengeStats, type ChallengeNoteRuntime, type ChallengePlayfield } from '@ui/challenge/noteTypes';
import { TRACKED_BUFF_SPELL_IDS, buildTrackerBlacklist } from './trackerSpellIds';
import { SYSTEM_KEYS, normalizeKey, normalizeMouseButton } from '@ui/utils/keyUtils';
import { FIXED_SCENE_HEIGHT, FIXED_SCENE_WIDTH, useFixedSceneScale } from '@ui/utils/layoutScaling';

type HudLayoutGroupKey = keyof HudLayoutSettings;

interface LayoutGroup {
  key: HudLayoutGroupKey;
  label: string;
  accent: string;
  visible: boolean;
}

interface DragState {
  key: HudLayoutGroupKey;
  mode: 'move' | 'resize';
  startClientX: number;
  startClientY: number;
  startPosition: HudGroupLayout;
  baseWidth: number;
  baseHeight: number;
}

interface PositionEditorState {
  key: HudLayoutGroupKey;
  xDraft: string;
  yDraft: string;
  scaleDraft: string;
  anchorX: number;
  anchorY: number;
  enabledDraft?: boolean;
  buttonCountDraft?: string;
  buttonsPerRowDraft?: string;
  iconsPerRowDraft?: string;
}

type TrackerRowGroupKey = 'essentialCooldowns' | 'utilityCooldowns' | 'buffIcons' | 'consumables';
const noopPointerHandler = (): void => undefined;

interface ButtonEditorState {
  actionBarId: ActionBarId;
  buttonIndex: number;
  spellSequenceDraft: string[];
  addSpellDraft: string;
  keybindDraft: string;
  anchorX: number;
  anchorY: number;
}

export interface HudLayoutPreviewProps {
  layout: HudLayoutSettings;
  layoutScale?: number;
  actionBars: ActionBarSettings;
  trackerRows: Record<TrackerRowGroupKey, number>;
  visibility: Record<HudLayoutGroupKey, boolean>;
  cooldownTracking?: {
    essential: Pick<TrackerGroupSettings, 'trackedEntryIds'>;
    utility: Pick<TrackerGroupSettings, 'trackedEntryIds'>;
  };
  buffTracking?: {
    iconTracker: Pick<TrackerGroupSettings, 'trackedEntryIds' | 'blacklistSpellIds'>;
    barTracker: Pick<TrackerGroupSettings, 'trackedEntryIds' | 'blacklistSpellIds'>;
    targetDebuffs: Pick<TrackerGroupSettings, 'blacklistSpellIds'>;
  };
  consumableTracking?: Pick<TrackerGroupSettings, 'trackedEntryIds'>;
  onChange: (settings: TrainerSettingsUpdater) => void;
  showLauncher?: boolean;
  launchRequest?: {
    mode: 'layout' | 'keybind';
    nonce: number;
  } | null;
  onEditorClose?: () => void;
  onOpenEditor?: (mode: 'layout' | 'keybind') => void;
}

const GROUPS: readonly Omit<LayoutGroup, 'visible'>[] = [
  { key: 'enemyIcon', label: 'Enemy Icon', accent: '#ffb866' },
  { key: 'essentialCooldowns', label: 'Essential CDs', accent: T.classMonk },
  { key: 'utilityCooldowns', label: 'Utility CDs', accent: T.accent },
  { key: 'buffIcons', label: 'WW Buff Icons', accent: T.gold },
  { key: 'buffBars', label: 'WW Buff Bars', accent: '#44aaff' },
  { key: 'consumables', label: 'Consumables', accent: '#cc88ff' },
  { key: 'challengePlayfield', label: 'Challenge Playfield', accent: T.red },
  { key: 'playerFrame', label: 'Player Frame', accent: '#53d38c' },
  { key: 'resourceFrame', label: 'Resources', accent: '#d9a63d' },
  { key: 'targetFrame', label: 'Target Frame', accent: '#ff7f7f' },
  { key: 'castBar', label: 'Cast Bar', accent: '#73c7ff' },
  { key: 'actionBar1', label: 'Action Bar 1', accent: '#b69cff' },
  { key: 'actionBar2', label: 'Action Bar 2', accent: '#b69cff' },
  { key: 'actionBar3', label: 'Action Bar 3', accent: '#b69cff' },
  { key: 'actionBar4', label: 'Action Bar 4', accent: '#b69cff' },
  { key: 'actionBar5', label: 'Action Bar 5', accent: '#b69cff' },
];

const SNAP_THRESHOLD_PCT = 1.25;
const CENTER_GUIDE_PCT = 50;
const MIN_LAYOUT_SCALE = 0.5;
const MAX_LAYOUT_SCALE = 2.5;
const POPOVER_MARGIN_PX = 12;
const POSITION_EDITOR_WIDTH_PX = 220;
const POSITION_EDITOR_HEIGHT_PX = 420;
const BUTTON_EDITOR_WIDTH_PX = 340;
const BUTTON_EDITOR_HEIGHT_PX = 560;
const PREVIEW_CURRENT_TIME = 42;
const PREVIEW_CHALLENGE_PLAYFIELD: ChallengePlayfield = {
  width: 760,
  height: 420,
};
const PREVIEW_CHALLENGE_NOTES: ChallengeNoteRuntime[] = [
  {
    note: {
      id: 'preview-note-tap',
      type: 'tap',
      startTime: PREVIEW_CURRENT_TIME - 0.4,
      endTime: PREVIEW_CURRENT_TIME + 0.8,
      position: { x: 112, y: 92 },
      radius: 28,
      damageOnMiss: 4,
    },
    status: 'active',
    progress: 0.3,
    clickCount: 0,
    pointerActive: false,
  },
  {
    note: {
      id: 'preview-note-slider',
      type: 'slider',
      startTime: PREVIEW_CURRENT_TIME - 0.1,
      endTime: PREVIEW_CURRENT_TIME + 1.2,
      position: { x: 232, y: 206 },
      radius: 24,
      damageOnMiss: 6,
      travelDuration: 1.1,
      path: [
        { x: 232, y: 206 },
        { x: 352, y: 206 },
        { x: 448, y: 160 },
      ],
    },
    status: 'active',
    progress: 0.55,
    clickCount: 0,
    pointerActive: true,
  },
  {
    note: {
      id: 'preview-note-hover',
      type: 'hover-key',
      startTime: PREVIEW_CURRENT_TIME + 0.2,
      endTime: PREVIEW_CURRENT_TIME + 1.7,
      position: { x: 620, y: 304 },
      radius: 30,
      damageOnMiss: 5,
      requiredKey: 'w',
    },
    status: 'pending',
    progress: 0,
    clickCount: 0,
    pointerActive: false,
  },
];

interface CanvasMetrics {
  width: number;
  height: number;
  left: number;
  top: number;
}

const FALLBACK_GROUP_BASE_SIZES: Partial<Record<HudLayoutGroupKey, { width: number; height: number }>> = {
  enemyIcon: { width: 72, height: 96 },
  challengePlayfield: { width: PREVIEW_CHALLENGE_PLAYFIELD.width, height: PREVIEW_CHALLENGE_PLAYFIELD.height },
  targetFrame: { width: 280, height: 34 },
  consumables: { width: 132, height: 44 },
};
const PREVIEW_GAME_STATE: GameStateSnapshot = {
  chi: 4,
  chiMax: 6,
  energyMax: 100,
  energyAtLastUpdate: 82,
  energyRegenRate: 10,
  energyRegenMultiplier: 1,
  energyLastUpdated: PREVIEW_CURRENT_TIME - 0.3,
  currentTime: PREVIEW_CURRENT_TIME,
  encounterDuration: 90,
  activeEnemies: 1,
  assumeMysticTouch: true,
  targetHealthPct: 100,
  targetMaxHealth: 10_000_000,
  prevGcdAbility: 'blackout_kick',
  prevGcdAbilities: ['tiger_palm', 'blackout_kick'],
  buffs: new Map([
    ['zenith', { expiresAt: PREVIEW_CURRENT_TIME + 8.2, stacks: 1, stackTimers: [PREVIEW_CURRENT_TIME + 8.2] }],
    ['teachings_of_the_monastery', { expiresAt: PREVIEW_CURRENT_TIME + 10.4, stacks: 2, stackTimers: [PREVIEW_CURRENT_TIME + 10.4, PREVIEW_CURRENT_TIME + 8.6] }],
    ['dance_of_chi_ji', { expiresAt: PREVIEW_CURRENT_TIME + 5.1, stacks: 1, stackTimers: [PREVIEW_CURRENT_TIME + 5.1] }],
    ['blackout_reinforcement', { expiresAt: PREVIEW_CURRENT_TIME + 4.3, stacks: 1, stackTimers: [PREVIEW_CURRENT_TIME + 4.3] }],
    ['hit_combo', { expiresAt: PREVIEW_CURRENT_TIME + 12, stacks: 4, stackTimers: [PREVIEW_CURRENT_TIME + 12, PREVIEW_CURRENT_TIME + 12, PREVIEW_CURRENT_TIME + 12, PREVIEW_CURRENT_TIME + 12] }],
    ['rushing_wind_kick', { expiresAt: PREVIEW_CURRENT_TIME + 2.4, stacks: 1, stackTimers: [PREVIEW_CURRENT_TIME + 2.4] }],
  ]),
  cooldowns: new Map([
    ['fists_of_fury', { readyAt: PREVIEW_CURRENT_TIME + 6.4 }],
    ['rising_sun_kick', { readyAt: PREVIEW_CURRENT_TIME + 1.2 }],
    ['whirling_dragon_punch', { readyAt: PREVIEW_CURRENT_TIME + 7.8 }],
    ['strike_of_the_windlord', { readyAt: PREVIEW_CURRENT_TIME + 15.1 }],
    ['slicing_winds', { readyAt: PREVIEW_CURRENT_TIME + 11.6 }],
    ['zenith', { readyAt: PREVIEW_CURRENT_TIME + 38 }],
    ['touch_of_death', { readyAt: PREVIEW_CURRENT_TIME + 62 }],
    ['touch_of_karma', { readyAt: PREVIEW_CURRENT_TIME + 21 }],
    ['berserking', { readyAt: PREVIEW_CURRENT_TIME + 54 }],
    ['algethar_puzzle_box', { readyAt: PREVIEW_CURRENT_TIME + 41 }],
    ['potion', { readyAt: PREVIEW_CURRENT_TIME + 150 }],
  ]),
  talents: new Set([
    'whirling_dragon_punch',
    'strike_of_the_windlord',
    'slicing_winds',
    'zenith',
    'touch_of_death',
  ]),
  talentRanks: new Map(),
  trinkets: [],
  stats: {
    attackPower: 18_450,
    critPercent: 21,
    hastePercent: 18,
    versatilityPercent: 8,
    masteryPercent: 22,
    mainHandMinDmg: 6_200,
    mainHandMaxDmg: 7_000,
    mainHandSpeed: 2.6,
    offHandMinDmg: 6_200,
    offHandMaxDmg: 7_000,
    offHandSpeed: 2.6,
    maxHealth: 1_850_000,
    targetArmor: 1_470,
    characterLevel: 80,
    targetLevel: 83,
    hitPercent: 7.5,
    expertisePercent: 7.5,
  },
  totalDamage: 8_420_000,
  lastCastAbility: 'blackout_kick',
  lastComboStrikeAbility: 'blackout_kick',
  chiWasted: 0,
  energyWasted: 3,
  mhSwingTimer: 1.4,
  ohSwingTimer: 1.4,
  flurryCharges: 0,
  hitComboStacks: 4,
  nextCombatWisdomAt: 0,
  dualThreatMhAllowed: true,
  dualThreatOhAllowed: true,
  queuedAbility: null,
  queuedAt: 0,
  queuedWindow: 0.4,
  gcdReady: PREVIEW_CURRENT_TIME + 0.35,
};
const PREVIEW_SPELL_INPUT_STATUS: ReadonlyMap<string, SpellInputStatus> = new Map([
  ['fists_of_fury', { canPress: false, visuallyUsable: true, failReason: 'on_cooldown' }],
  ['rising_sun_kick', { canPress: false, visuallyUsable: true, failReason: 'on_cooldown' }],
  ['whirling_dragon_punch', { canPress: false, visuallyUsable: true, failReason: 'on_cooldown' }],
  ['tiger_palm', { canPress: true, visuallyUsable: true }],
  ['blackout_kick', { canPress: true, visuallyUsable: true }],
  ['touch_of_karma', { canPress: false, visuallyUsable: true, failReason: 'on_cooldown' }],
]);

/**
 * Layout editor launcher plus a full-screen encounter-style preview for HUD groups.
 */
export function HudLayoutPreview({
  layout,
  layoutScale = 1,
  actionBars,
  trackerRows,
  visibility,
  cooldownTracking,
  buffTracking,
  consumableTracking,
  onChange,
  showLauncher = true,
  launchRequest = null,
  onEditorClose,
  onOpenEditor,
}: HudLayoutPreviewProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(() => launchRequest !== null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [keybindMode, setKeybindMode] = useState(() => launchRequest?.mode === 'keybind');
  const [draftLayout, setDraftLayout] = useState<HudLayoutSettings>(layout);
  const [draftActionBars, setDraftActionBars] = useState<ActionBarSettings>(actionBars);
  const [draftTrackerRows, setDraftTrackerRows] = useState<Record<TrackerRowGroupKey, number>>(trackerRows);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [guideState, setGuideState] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [positionEditor, setPositionEditor] = useState<PositionEditorState | null>(null);
  const [buttonEditor, setButtonEditor] = useState<ButtonEditorState | null>(null);
  const [listeningForKeybind, setListeningForKeybind] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const launchNonceRef = useRef<number | null>(launchRequest?.nonce ?? null);
  const editorSceneScale = useFixedSceneScale({ paddingX: 20, paddingY: 116 });
  const defaultLayout = useMemo(() => getDefaultHudLayoutSettings(), []);

  useEffect(() => {
    if (!isEditing) {
      setDraftLayout(layout);
      setDraftActionBars(actionBars);
      setDraftTrackerRows(trackerRows);
      setGuideState({ x: null, y: null });
      setDragState(null);
      setPositionEditor(null);
      setButtonEditor(null);
      setListeningForKeybind(false);
      setKeybindMode(false);
    }
  }, [actionBars, isEditing, layout, trackerRows]);

  const visibleGroups = useMemo(() => GROUPS.map((group) => ({
    ...group,
    visible: visibility[group.key],
  })), [visibility]);
  const previewBuffBlacklist = useMemo(() => {
    const combined = [
      ...(buffTracking?.iconTracker.blacklistSpellIds ?? []),
      ...(buffTracking?.barTracker.blacklistSpellIds ?? []),
    ];

    return buildTrackerBlacklist(TRACKED_BUFF_SPELL_IDS, [...new Set(combined)]);
  }, [buffTracking?.barTracker.blacklistSpellIds, buffTracking?.iconTracker.blacklistSpellIds]);

  const shellStyle: CSSProperties = {
    ...buildPanelStyle({ elevated: true, density: 'compact' }),
    borderRadius: 18,
    padding: 14,
    background: 'linear-gradient(180deg, rgba(15, 21, 34, 0.95), rgba(8, 12, 22, 0.92))',
    display: 'grid',
    gap: 12,
  };

  const summaryGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 8,
  };

  const openEditor = useCallback((mode: 'layout' | 'keybind' = 'layout'): void => {
    setDraftLayout(layout);
    setDraftActionBars(actionBars);
    setDraftTrackerRows(trackerRows);
    setGuideState({ x: null, y: null });
    setDragState(null);
    setPositionEditor(null);
    setButtonEditor(null);
    setListeningForKeybind(false);
    setKeybindMode(mode === 'keybind');
    setIsEditing(true);
  }, [actionBars, layout, trackerRows]);

  useEffect(() => {
    if (!launchRequest || launchNonceRef.current === launchRequest.nonce) {
      return;
    }

    launchNonceRef.current = launchRequest.nonce;
    openEditor(launchRequest.mode);
  }, [launchRequest, openEditor]);

  const closeEditor = useCallback((): void => {
    setIsEditing(false);
    onEditorClose?.();
  }, [onEditorClose]);

  const applyDraftLayout = (): void => {
    onChange((current) => ({
      ...current,
      hud: {
        ...current.hud,
        layout: draftLayout,
        cooldowns: {
          ...current.hud.cooldowns,
          essential: { ...current.hud.cooldowns.essential, iconsPerRow: draftTrackerRows.essentialCooldowns },
          utility: { ...current.hud.cooldowns.utility, iconsPerRow: draftTrackerRows.utilityCooldowns },
        },
        buffs: {
          ...current.hud.buffs,
          iconTracker: { ...current.hud.buffs.iconTracker, iconsPerRow: draftTrackerRows.buffIcons },
        },
        consumables: {
          ...current.hud.consumables,
          iconsPerRow: draftTrackerRows.consumables,
        },
      },
      actionBars: draftActionBars,
    }));
    closeEditor();
  };

  const resetDraftLayout = (): void => {
    setDraftLayout(layout);
    setDraftActionBars(actionBars);
    setDraftTrackerRows(trackerRows);
    setGuideState({ x: null, y: null });
    setPositionEditor(null);
    setButtonEditor(null);
    setListeningForKeybind(false);
  };

  const resetDraftToDefaults = (): void => {
    setDraftLayout(defaultLayout);
    setGuideState({ x: null, y: null });
    setPositionEditor(null);
    setButtonEditor(null);
    setListeningForKeybind(false);
  };

  const resetSavedLayout = (): void => {
    onChange((current) => ({
      ...current,
      hud: {
        ...current.hud,
        layout: getDefaultHudLayoutSettings(),
      },
    }));
  };

  const appendSpellToButtonEditor = (spellId: string): void => {
    setButtonEditor((current) => current ? {
      ...current,
      spellSequenceDraft: current.spellSequenceDraft.includes(spellId)
        ? current.spellSequenceDraft
        : [...current.spellSequenceDraft, spellId],
      addSpellDraft: '',
    } : current);
  };

  const updateDraftPosition = (groupKey: HudLayoutGroupKey, position: HudGroupLayout): void => {
    setDraftLayout((current) => ({
      ...current,
      [groupKey]: position,
    }));
  };

  const handleDragMove = (groupKey: HudLayoutGroupKey, clientX: number, clientY: number): void => {
    if (!dragState) {
      return;
    }

    const metrics = getCanvasMetrics(canvasRef.current);

    const baseX = clampPct(((clientX - metrics.left) / metrics.width) * 100);
    const baseY = clampPct(((clientY - metrics.top) / metrics.height) * 100);

    const otherPositions = (Object.entries(draftLayout) as [HudLayoutGroupKey, HudGroupLayout][])
      .filter(([key]) => key !== groupKey)
      .map(([, position]) => position);

    const snappedX = snapEnabled ? snapPct(baseX, otherPositions.map((position) => position.xPct)) : baseX;
    const snappedY = snapEnabled ? snapPct(baseY, otherPositions.map((position) => position.yPct)) : baseY;

    setGuideState({
      x: snapEnabled && snappedX !== baseX ? snappedX : null,
      y: snapEnabled && snappedY !== baseY ? snappedY : null,
    });

    updateDraftPosition(
      groupKey,
      clampLayoutPositionToCanvas(
        {
          xPct: snappedX,
          yPct: snappedY,
          scale: draftLayout[groupKey].scale,
        },
        metrics,
        dragState.baseWidth,
        dragState.baseHeight,
      ),
    );
  };

  const handleResizeMove = (drag: DragState, clientX: number, clientY: number): void => {
    const deltaX = clientX - drag.startClientX;
    const deltaY = clientY - drag.startClientY;
    const deltaScale = Math.max(deltaX, deltaY) / 220;
    const metrics = getCanvasMetrics(canvasRef.current);
    const nextScale = clampScaleToCanvasBounds(
      drag.startPosition.scale + deltaScale,
      drag.startPosition,
      metrics,
      drag.baseWidth,
      drag.baseHeight,
    );

    updateDraftPosition(
      drag.key,
      clampLayoutPositionToCanvas(
        {
          ...drag.startPosition,
          scale: nextScale,
        },
        metrics,
        drag.baseWidth,
        drag.baseHeight,
      ),
    );
  };

  useEffect(() => {
    if (!isEditing || !listeningForKeybind || !buttonEditor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setListeningForKeybind(false);
        return;
      }

      if (SYSTEM_KEYS.has(event.key.toLowerCase()) || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
        return;
      }

      const chord = normalizeKey(event);
      setButtonEditor((current) => current ? { ...current, keybindDraft: chord } : current);
      setListeningForKeybind(false);
    };

    const handleMouseDown = (event: MouseEvent): void => {
      if (event.button === 0) {
        setListeningForKeybind(false);
        return;
      }

      if (event.button === 1 || event.button === 2) {
        event.preventDefault();
        setListeningForKeybind(false);
        return;
      }

      const chord = normalizeMouseButton(event);
      if (chord === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setButtonEditor((current) => current ? { ...current, keybindDraft: chord } : current);
      setListeningForKeybind(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('mousedown', handleMouseDown, { capture: true });
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('mousedown', handleMouseDown, { capture: true });
    };
  }, [buttonEditor, isEditing, listeningForKeybind]);

  const spellSuggestions = useMemo<SearchSuggestion[]>(() => WW_ACTION_BAR.map((slot) => {
    const spell = MONK_WW_SPELLS.get(slot.spellId) ?? SHARED_PLAYER_SPELLS.get(slot.spellId);
    const displayName = spell?.displayName ?? slot.spellId;
    return {
      id: `action-bar-spell-${slot.spellId}`,
      value: slot.spellId,
      label: `${displayName} (${slot.spellId})`,
      keywords: [displayName, slot.defaultKey],
    };
  }), []);

  return (
    <>
      {showLauncher && (
        <section style={shellStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '1rem' }}>HUD Layout</div>
              <div style={{ color: T.textDim, fontFamily: FONTS.body, fontSize: '0.82rem', marginTop: 4, maxWidth: 620 }}>
                Open Edit Layout to move the encounter HUD inside a fake combat scene. Groups snap to the screen center and each other, and you can right-click a group to fine-tune X/Y coordinates before saving.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={(): void => {
                  if (onOpenEditor) {
                    onOpenEditor('layout');
                    return;
                  }
                  openEditor('layout');
                }}
                style={controlButton(true)}
              >
                Edit Layout
              </button>
              <button
                type="button"
                onClick={resetSavedLayout}
                style={controlButton(false)}
              >
                Reset Layout
              </button>
            </div>
          </div>

          <div style={summaryGridStyle}>
            {visibleGroups.map((group) => (
              <div
                key={group.key}
                data-testid={`hud-layout-summary-${group.key}`}
                style={{
                  ...buildHudFrameStyle({ compact: true }),
                  border: `1px solid ${group.visible ? group.accent : T.border}`,
                  borderRadius: 12,
                  background: group.visible
                    ? `linear-gradient(180deg, ${group.accent}14, rgba(255,255,255,0.02))`
                    : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <span style={{ fontFamily: FONTS.ui, fontSize: '0.72rem', color: group.visible ? T.textBright : T.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {group.label}
                </span>
                <span style={{ fontFamily: FONTS.ui, fontSize: '0.8rem', color: group.visible ? T.textBright : T.textDim }}>
                  {Math.round(layout[group.key].xPct)}% / {Math.round(layout[group.key].yPct)}% • {formatScale(layout[group.key].scale)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {isEditing && (
        <div
          data-testid="hud-layout-editor"
          style={editorOverlayStyle}
          onMouseMove={(event): void => {
            if (!dragState) {
              return;
            }

            if (dragState.mode === 'resize') {
              handleResizeMove(dragState, event.clientX, event.clientY);
              return;
            }

            handleDragMove(dragState.key, event.clientX, event.clientY);
          }}
          onMouseUp={(): void => {
            setDragState(null);
            setGuideState({ x: null, y: null });
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="HUD Layout Editor"
            data-testid="hud-layout-editor-dialog"
            style={editorModalStyle}
          >
            <div style={editorHeaderStyle}>
              <div>
                <div style={{ fontFamily: FONTS.display, fontSize: '1.05rem', color: T.textBright }}>Edit Layout</div>
                <div style={{ fontFamily: FONTS.body, fontSize: '0.82rem', color: T.textDim, marginTop: 4 }}>
                  Drag the live HUD groups around the fake encounter scene, then save when you like the alignment.
                  {keybindMode ? ' Click action-bar buttons to edit spell sequences and shared keybinds.' : ''}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={toggleLabelStyle}>
                  <input type="checkbox" checked={showGrid} onChange={(event): void => setShowGrid(event.target.checked)} />
                  Show Grid
                </label>
                <label style={toggleLabelStyle}>
                  <input type="checkbox" checked={snapEnabled} onChange={(event): void => setSnapEnabled(event.target.checked)} />
                  Enable Snap
                </label>
                <label style={toggleLabelStyle}>
                  <input
                    type="checkbox"
                    checked={keybindMode}
                    onChange={(event): void => {
                      setKeybindMode(event.target.checked);
                      setButtonEditor(null);
                      setListeningForKeybind(false);
                    }}
                  />
                  Keybind Mode
                </label>
                <button type="button" onClick={resetDraftLayout} style={controlButton(false)}>
                  Revert Draft
                </button>
                <button type="button" onClick={resetDraftToDefaults} style={controlButton(false)}>
                  Reset Layout
                </button>
              </div>
            </div>

            <div
              data-testid="hud-layout-editor-canvas"
              style={buildCanvasStyle(showGrid)}
              onMouseLeave={(): void => {
                setDragState(null);
                setGuideState({ x: null, y: null });
              }}
            >
              <div
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `${FIXED_SCENE_WIDTH}px`,
                  height: `${FIXED_SCENE_HEIGHT}px`,
                  transform: `translate(-50%, -50%) scale(${editorSceneScale * layoutScale})`,
                  transformOrigin: 'center center',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    border: `1px solid ${T.borderBright}`,
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                    borderRadius: 18,
                    pointerEvents: 'none',
                  }}
                />
                {showGrid && (
                  <>
                    <div style={buildGuideLineStyle('vertical', CENTER_GUIDE_PCT, 'rgba(255,255,255,0.16)')} />
                    <div style={buildGuideLineStyle('horizontal', CENTER_GUIDE_PCT, 'rgba(255,255,255,0.16)')} />
                  </>
                )}

                {guideState.x !== null && (
                  <div data-testid="hud-layout-guide-x" style={buildGuideLineStyle('vertical', guideState.x, 'rgba(53, 200, 155, 0.55)')} />
                )}
                {guideState.y !== null && (
                  <div data-testid="hud-layout-guide-y" style={buildGuideLineStyle('horizontal', guideState.y, 'rgba(53, 200, 155, 0.55)')} />
                )}

                <MockEncounterBackdrop />

                {visibility.challengePlayfield && (
                  <ChallengeHud
                    difficulty="hard"
                    validKeys={['w', 'a', 's', 'd']}
                    stats={createEmptyChallengeStats()}
                    showStats={false}
                  />
                )}

                {visibleGroups.map((group) => renderGroupCard({
                  group,
                  position: draftLayout[group.key],
                  actionBars: draftActionBars,
                  trackerRows: draftTrackerRows,
                  cooldownTracking,
                  buffTracking,
                  consumableTracking,
                  previewBuffBlacklist,
                  keybindMode,
                  onMouseDown: (event): void => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const scale = Math.max(MIN_LAYOUT_SCALE, draftLayout[group.key].scale);
                    const baseSize = resolveBaseGroupSize(group.key, rect.width / scale, rect.height / scale);
                    setDragState({
                      key: group.key,
                      mode: 'move',
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      startPosition: draftLayout[group.key],
                      baseWidth: baseSize.width,
                      baseHeight: baseSize.height,
                    });
                    setPositionEditor(null);
                    setButtonEditor(null);
                  },
                  onResizeMouseDown: (event): void => {
                    event.stopPropagation();
                    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                    const scale = Math.max(MIN_LAYOUT_SCALE, draftLayout[group.key].scale);
                    const baseSize = resolveBaseGroupSize(group.key, (rect?.width ?? 0) / scale, (rect?.height ?? 0) / scale);
                    setDragState({
                      key: group.key,
                      mode: 'resize',
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      startPosition: draftLayout[group.key],
                      baseWidth: baseSize.width,
                      baseHeight: baseSize.height,
                    });
                    setPositionEditor(null);
                    setButtonEditor(null);
                  },
                  onContextMenu: (event): void => {
                    event.preventDefault();
                    setDragState(null);
                    setButtonEditor(null);
                    const actionBarId = getActionBarIdFromLayoutKey(group.key);
                    const trackerRowGroupKey = getTrackerRowGroupKey(group.key);
                    setPositionEditor({
                      key: group.key,
                      xDraft: draftLayout[group.key].xPct.toFixed(1),
                      yDraft: draftLayout[group.key].yPct.toFixed(1),
                      scaleDraft: draftLayout[group.key].scale.toFixed(2),
                      anchorX: event.clientX,
                      anchorY: event.clientY,
                      enabledDraft: actionBarId ? draftActionBars.bars[actionBarId].enabled : undefined,
                      buttonCountDraft: actionBarId ? String(draftActionBars.bars[actionBarId].buttonCount) : undefined,
                      buttonsPerRowDraft: actionBarId ? String(draftActionBars.bars[actionBarId].buttonsPerRow) : undefined,
                      iconsPerRowDraft: trackerRowGroupKey ? String(draftTrackerRows[trackerRowGroupKey]) : undefined,
                    });
                  },
                  onActionBarButtonClick: (actionBarId, buttonIndex, button, event): void => {
                    if (!keybindMode) {
                      return;
                    }

                    event.stopPropagation();
                    setDragState(null);
                    setPositionEditor(null);
                    setButtonEditor({
                      actionBarId,
                      buttonIndex,
                      spellSequenceDraft: [...button.spellIds],
                      addSpellDraft: '',
                      keybindDraft: button.keybind,
                      anchorX: event.clientX,
                      anchorY: event.clientY,
                    });
                  },
                }))}
              </div>

              {positionEditor && (
                <div
                  data-testid="hud-layout-position-editor"
                  style={{
                    ...positionEditorStyle,
                    ...clampViewportPopoverPosition(
                      positionEditor.anchorX,
                      positionEditor.anchorY,
                      POSITION_EDITOR_WIDTH_PX,
                      POSITION_EDITOR_HEIGHT_PX,
                    ),
                  }}
                >
                  <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '0.9rem' }}>
                    {GROUPS.find((group) => group.key === positionEditor.key)?.label}
                  </div>

                  <label style={inputLabelStyle}>
                    X coordinate
                    <input
                      aria-label="X coordinate"
                      value={positionEditor.xDraft}
                      onChange={(event): void => setPositionEditor((current) => current ? {
                        ...current,
                        xDraft: event.target.value,
                      } : current)}
                      style={inputStyle}
                    />
                  </label>

                  <label style={inputLabelStyle}>
                    Y coordinate
                    <input
                      aria-label="Y coordinate"
                      value={positionEditor.yDraft}
                      onChange={(event): void => setPositionEditor((current) => current ? {
                        ...current,
                        yDraft: event.target.value,
                      } : current)}
                      style={inputStyle}
                    />
                  </label>

                  <label style={inputLabelStyle}>
                    Scale
                    <input
                      aria-label="Scale"
                      type="number"
                      min={MIN_LAYOUT_SCALE}
                      max={MAX_LAYOUT_SCALE}
                      step={0.05}
                      value={positionEditor.scaleDraft}
                      onChange={(event): void => setPositionEditor((current) => current ? {
                        ...current,
                        scaleDraft: event.target.value,
                      } : current)}
                      style={inputStyle}
                    />
                  </label>

                  {positionEditor.enabledDraft !== undefined && (
                    <label style={inputLabelStyle}>
                      <span>Bar enabled</span>
                      <input
                        aria-label="Bar enabled"
                        type="checkbox"
                        checked={positionEditor.enabledDraft}
                        onChange={(event): void => setPositionEditor((current) => current ? {
                          ...current,
                          enabledDraft: event.target.checked,
                        } : current)}
                      />
                    </label>
                  )}

                  {positionEditor.buttonCountDraft !== undefined && (
                    <label style={inputLabelStyle}>
                      Button count
                      <input
                        aria-label="Button count"
                        type="number"
                        min={1}
                        max={12}
                        value={positionEditor.buttonCountDraft}
                        onChange={(event): void => setPositionEditor((current) => current ? {
                          ...current,
                          buttonCountDraft: event.target.value,
                        } : current)}
                        style={inputStyle}
                      />
                    </label>
                  )}

                  {positionEditor.buttonsPerRowDraft !== undefined && (
                    <label style={inputLabelStyle}>
                      Buttons per row
                      <input
                        aria-label="Buttons per row"
                        type="number"
                        min={1}
                        max={12}
                        value={positionEditor.buttonsPerRowDraft}
                        onChange={(event): void => setPositionEditor((current) => current ? {
                          ...current,
                          buttonsPerRowDraft: event.target.value,
                        } : current)}
                        style={inputStyle}
                      />
                    </label>
                  )}

                  {positionEditor.iconsPerRowDraft !== undefined && (
                    <label style={inputLabelStyle}>
                      Icons per row
                      <input
                        aria-label="Icons per row"
                        type="number"
                        min={1}
                        max={12}
                        value={positionEditor.iconsPerRowDraft}
                        onChange={(event): void => setPositionEditor((current) => current ? {
                          ...current,
                          iconsPerRowDraft: event.target.value,
                        } : current)}
                        style={inputStyle}
                      />
                    </label>
                  )}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" style={controlButton(false)} onClick={(): void => setPositionEditor(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      style={controlButton(true)}
                      onClick={(): void => {
                        if (!positionEditor) {
                          return;
                        }

                        const metrics = getCanvasMetrics(canvasRef.current);
                        const groupElement = canvasRef.current?.querySelector<HTMLElement>(
                          `[data-testid="hud-layout-group-${positionEditor.key}"]`,
                        );
                        const currentScale = Math.max(MIN_LAYOUT_SCALE, draftLayout[positionEditor.key].scale);
                        const scale = clampScale(Number(positionEditor.scaleDraft));
                        const baseSize = resolveBaseGroupSize(
                          positionEditor.key,
                          groupElement ? groupElement.getBoundingClientRect().width / currentScale : 0,
                          groupElement ? groupElement.getBoundingClientRect().height / currentScale : 0,
                        );

                        updateDraftPosition(
                          positionEditor.key,
                          clampLayoutPositionToCanvas(
                            {
                              xPct: clampPct(Number(positionEditor.xDraft)),
                              yPct: clampPct(Number(positionEditor.yDraft)),
                              scale,
                            },
                            metrics,
                            baseSize.width,
                            baseSize.height,
                          ),
                        );

                        const actionBarId = getActionBarIdFromLayoutKey(positionEditor.key);
                        if (actionBarId) {
                          setDraftActionBars((current) => ({
                            bars: {
                              ...current.bars,
                              [actionBarId]: {
                                ...current.bars[actionBarId],
                                enabled: positionEditor.enabledDraft ?? current.bars[actionBarId].enabled,
                                buttonCount: clampActionBarCount(positionEditor.buttonCountDraft, current.bars[actionBarId].buttonCount),
                                buttonsPerRow: clampActionBarCount(positionEditor.buttonsPerRowDraft, current.bars[actionBarId].buttonsPerRow),
                              },
                            },
                          }));
                        }

                        const trackerRowGroupKey = getTrackerRowGroupKey(positionEditor.key);
                        if (trackerRowGroupKey) {
                          setDraftTrackerRows((current) => ({
                            ...current,
                            [trackerRowGroupKey]: clampActionBarCount(positionEditor.iconsPerRowDraft, current[trackerRowGroupKey]),
                          }));
                        }
                        setPositionEditor(null);
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}

              {buttonEditor && (
                <div
                  data-testid="hud-layout-button-editor"
                  style={{
                    ...positionEditorStyle,
                    ...clampViewportPopoverPosition(
                      buttonEditor.anchorX,
                      buttonEditor.anchorY,
                      BUTTON_EDITOR_WIDTH_PX,
                      BUTTON_EDITOR_HEIGHT_PX,
                    ),
                    width: BUTTON_EDITOR_WIDTH_PX,
                  }}
                >
                  <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '0.9rem' }}>
                    {getActionBarLabel(buttonEditor.actionBarId)} • Button {buttonEditor.buttonIndex + 1}
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    <span style={inputLabelStyle}>Spell sequence</span>
                    {buttonEditor.spellSequenceDraft.length > 0 ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {buttonEditor.spellSequenceDraft.map((spellId, index) => {
                          const spell = MONK_WW_SPELLS.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId);
                          const displayName = spell?.displayName ?? spellId;
                          const icons = SPELL_ICONS[spellId] ?? { iconName: 'inv_misc_questionmark', emoji: '?' };
                          return (
                            <div
                              key={`sequence-${spellId}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '34px minmax(0, 1fr) 64px 32px',
                                gap: 8,
                                alignItems: 'center',
                                border: `1px solid ${T.border}`,
                                borderRadius: 10,
                                padding: 6,
                                background: 'rgba(255,255,255,0.03)',
                              }}
                            >
                              <AbilityIcon iconName={icons.iconName} emoji={icons.emoji} size={30} alt={displayName} style={{ borderRadius: 8 }} />
                              <span style={{ fontFamily: FONTS.ui, fontSize: '0.74rem', color: T.textBright }}>{displayName}</span>
                              <select
                                aria-label={`Spell order ${displayName}`}
                                value={index + 1}
                                onChange={(event): void => {
                                  const nextIndex = Number(event.target.value) - 1;
                                  setButtonEditor((current) => current ? {
                                    ...current,
                                    spellSequenceDraft: reorderSpellSequence(current.spellSequenceDraft, index, nextIndex),
                                  } : current);
                                }}
                                style={inputStyle}
                              >
                                {buttonEditor.spellSequenceDraft.map((_, orderIndex) => (
                                  <option key={`sequence-order-${orderIndex + 1}`} value={orderIndex + 1}>
                                    {orderIndex + 1}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                aria-label={`Remove ${displayName}`}
                                style={controlButton(false)}
                                onClick={(): void => setButtonEditor((current) => current ? {
                                  ...current,
                                  spellSequenceDraft: current.spellSequenceDraft.filter((candidate) => candidate !== spellId),
                                } : current)}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontFamily: FONTS.ui, fontSize: '0.72rem', color: T.textDim }}>
                        No spells assigned yet.
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
                      <SearchableTextInput
                        ariaLabel="Add action bar spell"
                        value={buttonEditor.addSpellDraft}
                        placeholder="Search spell name or ID"
                        suggestions={spellSuggestions}
                        onChange={(nextValue): void => setButtonEditor((current) => current ? {
                          ...current,
                          addSpellDraft: nextValue,
                        } : current)}
                        onSuggestionSelect={(suggestion): void => {
                          const spellId = resolveActionBarSpellId(suggestion.value);
                          if (spellId) {
                            appendSpellToButtonEditor(spellId);
                          }
                        }}
                        inputStyle={inputStyle}
                      />
                      <button
                        type="button"
                        aria-label="Add spell to keybind"
                        style={{ ...controlButton(true), width: 36, height: 36, padding: 0, fontSize: '1.05rem', lineHeight: 1 }}
                        onClick={(): void => {
                          const spellId = resolveActionBarSpellId(buttonEditor.addSpellDraft);
                          if (!spellId) {
                            return;
                          }

                          appendSpellToButtonEditor(spellId);
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <label style={inputLabelStyle}>
                    Keybind
                    <button
                      type="button"
                      style={controlButton(listeningForKeybind)}
                      onClick={(): void => setListeningForKeybind((current) => !current)}
                    >
                      {listeningForKeybind ? 'Press a key…' : buttonEditor.keybindDraft || 'Set keybind'}
                    </button>
                  </label>

                  <div style={{ fontFamily: FONTS.ui, fontSize: '0.72rem', color: T.textDim }}>
                    Shared-keybind spells fire in order on the same chord, respecting cooldowns, GCD, and resources.
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      style={controlButton(false)}
                      onClick={(): void => {
                        setButtonEditor(null);
                        setListeningForKeybind(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      style={controlButton(true)}
                      onClick={(): void => {
                        const nextActionBars = {
                          bars: {
                            ...draftActionBars.bars,
                            [buttonEditor.actionBarId]: {
                              ...draftActionBars.bars[buttonEditor.actionBarId],
                              buttons: draftActionBars.bars[buttonEditor.actionBarId].buttons.map((button, index) => (
                                index === buttonEditor.buttonIndex
                                  ? {
                                    ...button,
                                    spellIds: buttonEditor.spellSequenceDraft,
                                    keybind: buttonEditor.keybindDraft,
                                  }
                                  : button
                              )),
                            },
                          },
                        };
                        setDraftActionBars(nextActionBars);
                        setButtonEditor(null);
                        setListeningForKeybind(false);
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontFamily: FONTS.ui, fontSize: '0.76rem', color: T.textDim }}>
                Tip: right-click a HUD group to edit exact coordinates. Drag the bottom-right handle to resize while keeping the same aspect ratio.
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={controlButton(false)} onClick={closeEditor}>
                  Cancel
                </button>
                <button type="button" style={controlButton(true)} onClick={applyDraftLayout}>
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function renderGroupCard({
  group,
  position,
  actionBars,
  trackerRows,
  cooldownTracking,
  buffTracking,
  consumableTracking,
  previewBuffBlacklist,
  keybindMode,
  onMouseDown,
  onResizeMouseDown,
  onContextMenu,
  onActionBarButtonClick,
}: {
  group: LayoutGroup;
  position: HudGroupLayout;
  actionBars: ActionBarSettings;
  trackerRows: Record<TrackerRowGroupKey, number>;
  cooldownTracking?: HudLayoutPreviewProps['cooldownTracking'];
  buffTracking?: HudLayoutPreviewProps['buffTracking'];
  consumableTracking?: HudLayoutPreviewProps['consumableTracking'];
  previewBuffBlacklist: string[];
  keybindMode: boolean;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onResizeMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onActionBarButtonClick: (
    actionBarId: ActionBarId,
    buttonIndex: number,
    button: ActionBarButtonSettings,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
}): React.ReactElement {
  return (
    <div
      key={group.key}
      data-testid={`hud-layout-group-${group.key}`}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      style={{
        position: 'absolute',
        left: `${position.xPct}%`,
        top: `${position.yPct}%`,
        transform: `translate(-50%, -50%) scale(${position.scale})`,
        transformOrigin: 'center center',
        width: 'fit-content',
        border: `1px solid ${group.visible ? group.accent : T.border}`,
        borderRadius: 10,
        background: 'linear-gradient(180deg, rgba(10, 16, 28, 0.74), rgba(5, 10, 18, 0.68))',
        color: group.visible ? T.textBright : T.textDim,
        cursor: 'grab',
        display: 'grid',
        gap: 0,
        boxShadow: group.visible ? `0 10px 22px ${group.accent}1f` : T.shadow,
        overflow: 'visible',
        backdropFilter: 'blur(6px)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -18,
          left: 0,
          fontFamily: FONTS.ui,
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          textAlign: 'left',
          padding: '2px 7px',
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.98), rgba(7, 11, 20, 0.96))',
          border: `1px solid ${group.visible ? group.accent : T.border}`,
        }}
      >
        {group.label}
      </span>
      <MockGroupContent
        groupKey={group.key}
        actionBars={actionBars}
        trackerRows={trackerRows}
        cooldownTracking={cooldownTracking}
        buffTracking={buffTracking}
        consumableTracking={consumableTracking}
        previewBuffBlacklist={previewBuffBlacklist}
        keybindMode={keybindMode}
        onActionBarButtonClick={onActionBarButtonClick}
      />
      <span
        style={{
          position: 'absolute',
          bottom: -16,
          left: 0,
          fontFamily: FONTS.ui,
          fontSize: '0.58rem',
          color: group.visible ? T.textBright : T.textDim,
          textAlign: 'left',
          padding: '1px 6px',
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.98), rgba(7, 11, 20, 0.96))',
          border: `1px solid ${group.visible ? `${group.accent}55` : T.border}`,
        }}
      >
        {Math.round(position.xPct)}% / {Math.round(position.yPct)}% • {formatScale(position.scale)}
      </span>
      <button
        type="button"
        aria-label={`Resize ${group.label}`}
        data-testid={`hud-layout-resize-handle-${group.key}`}
        onMouseDown={onResizeMouseDown}
        style={resizeHandleStyle}
      />
    </div>
  );
}

function clampPopoverCoordinate(value: number, size: number, viewportSize: number): number {
  const max = Math.max(POPOVER_MARGIN_PX, viewportSize - size - POPOVER_MARGIN_PX);
  return Math.min(max, Math.max(POPOVER_MARGIN_PX, value));
}

function clampViewportPopoverPosition(anchorX: number, anchorY: number, width: number, height: number): { left: number; top: number } {
  return {
    left: clampPopoverCoordinate(anchorX, width, window.innerWidth),
    top: clampPopoverCoordinate(anchorY, height, window.innerHeight),
  };
}

function MockEncounterBackdrop(): React.ReactElement {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.05), transparent 18%)',
          pointerEvents: 'none',
        }}
      />
      <div style={mockCenterDummyStyle}>🪆</div>
      <div
        style={{
          position: 'absolute',
          left: '12%',
          right: '12%',
          bottom: '14%',
          height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

function MockTargetFrame(): React.ReactElement {
  return (
    <div
      style={{
        width: 280,
        padding: '6px 8px',
        borderRadius: 12,
        border: `1px solid ${T.borderBright}`,
        background: 'linear-gradient(180deg, rgba(12, 16, 24, 0.96), rgba(8, 11, 18, 0.94))',
        boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 18,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'rgba(22, 27, 34, 0.95)',
          border: `1px solid ${T.border}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '68%',
            background: 'linear-gradient(90deg, rgba(175, 36, 36, 0.92), rgba(233, 93, 93, 0.88))',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            color: T.textBright,
            fontFamily: FONTS.ui,
            fontSize: '0.66rem',
            letterSpacing: '0.03em',
          }}
        >
          <span>Raider&apos;s Training Dummy</span>
          <span>68%</span>
        </div>
      </div>
    </div>
  );
}

function MockGroupContent({
  groupKey,
  actionBars,
  trackerRows,
  cooldownTracking,
  buffTracking,
  consumableTracking,
  previewBuffBlacklist,
  keybindMode,
  onActionBarButtonClick,
}: {
  groupKey: HudLayoutGroupKey;
  actionBars: ActionBarSettings;
  trackerRows: Record<TrackerRowGroupKey, number>;
  cooldownTracking?: HudLayoutPreviewProps['cooldownTracking'];
  buffTracking?: HudLayoutPreviewProps['buffTracking'];
  consumableTracking?: HudLayoutPreviewProps['consumableTracking'];
  previewBuffBlacklist: string[];
  keybindMode: boolean;
  onActionBarButtonClick: (
    actionBarId: ActionBarId,
    buttonIndex: number,
    button: ActionBarButtonSettings,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
}): React.ReactElement {
  const previewShellStyle: CSSProperties = {
    pointerEvents: 'none',
  };

  if (groupKey === 'playerFrame') {
    return (
      <div style={previewShellStyle}>
        <PlayerFrame gameState={PREVIEW_GAME_STATE} currentTime={PREVIEW_CURRENT_TIME} showResources={false} />
      </div>
    );
  }

  if (groupKey === 'resourceFrame') {
    return (
      <div style={previewShellStyle}>
        <EnergyChiDisplay gameState={PREVIEW_GAME_STATE} currentTime={PREVIEW_CURRENT_TIME} />
      </div>
    );
  }

  if (groupKey === 'targetFrame') {
    return (
      <div style={previewShellStyle}>
        <MockTargetFrame />
      </div>
    );
  }

  if (groupKey === 'enemyIcon') {
    return (
      <div style={{ ...mockCenterDummyStyle, position: 'static', width: 72, height: 96, fontSize: '3.4rem', opacity: 0.85 }}>
        🪆
      </div>
    );
  }

  if (groupKey === 'castBar') {
    return (
      <div style={previewShellStyle}>
        <CastBar
          spellId="fists_of_fury"
          spellName="Fists of Fury"
          remainingTime={2.6}
          totalTime={4}
          progress={0.35}
          isChanneling
        />
      </div>
    );
  }

  if (groupKey === 'challengePlayfield') {
    return (
      <div style={previewShellStyle}>
        <ChallengeOverlay
          difficulty="hard"
          playfield={PREVIEW_CHALLENGE_PLAYFIELD}
          currentTime={PREVIEW_CURRENT_TIME}
          notes={PREVIEW_CHALLENGE_NOTES}
          onPointerMove={noopPointerHandler}
          onPointerDown={noopPointerHandler}
          onPointerUp={noopPointerHandler}
          onPointerLeave={noopPointerHandler}
        />
      </div>
    );
  }

  if (isActionBarLayoutKey(groupKey)) {
    const actionBarId = getActionBarIdFromLayoutKey(groupKey);
    const actionBar = actionBarId ? actionBars.bars[actionBarId] : null;
    if (!actionBarId || !actionBar) {
      return <></>;
    }

    const { buttons, slots } = buildPreviewActionBarAssignments(actionBar);
    const overlayColumnCount = Math.max(1, Math.min(actionBar.buttonCount, actionBar.buttonsPerRow));
    const overlayButtons = actionBar.buttons.slice(0, actionBar.buttonCount);

    return (
      <div style={{ position: 'relative', width: `${overlayColumnCount * 52 + Math.max(0, overlayColumnCount - 1) * 4}px` }}>
        <div style={previewShellStyle}>
          <ActionBar
            gameState={buildPreviewActionBarGameState(slots)}
            spellInputStatus={PREVIEW_SPELL_INPUT_STATUS}
            recommendedAbility="blackout_kick"
            showRecommendations
            slots={slots}
            buttons={buttons}
            totalButtons={actionBar.buttonCount}
            onAbilityPress={noopPointerHandler}
            enableGlobalKeybinds={false}
            enabled={actionBar.enabled}
            rows={Math.max(1, Math.ceil(actionBar.buttonCount / Math.max(1, actionBar.buttonsPerRow)))}
            slotsPerRow={actionBar.buttonsPerRow}
            ariaLabel={getActionBarLabel(actionBarId)}
          />
        </div>
        {keybindMode && (
          <div style={buildActionBarOverlayStyle(overlayColumnCount)}>
            {overlayButtons.map((button, index) => {
              const primarySpellId = button.spellIds[0];
              const spell = primarySpellId ? (MONK_WW_SPELLS.get(primarySpellId) ?? SHARED_PLAYER_SPELLS.get(primarySpellId)) : undefined;
              const displayName = spell?.displayName ?? primarySpellId ?? `Empty ${index + 1}`;

              return (
                <button
                  key={`actionbar-slot-${groupKey}-${index}`}
                  type="button"
                  data-testid={`hud-layout-action-button-${actionBarId}-${index}`}
                  aria-label={`Edit ${displayName}`}
                  onMouseDown={(event): void => event.stopPropagation()}
                  onClick={(event): void => onActionBarButtonClick(actionBarId, index, button, event)}
                  style={actionBarOverlayButtonStyle}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (groupKey === 'buffBars') {
    return (
      <div style={previewShellStyle}>
        <BuffBarTracker
          gameState={PREVIEW_GAME_STATE}
          currentTime={PREVIEW_CURRENT_TIME}
          blacklist={previewBuffBlacklist}
          whitelist={buffTracking?.barTracker.trackedEntryIds}
          containerStyle={{ width: 320 }}
        />
      </div>
    );
  }

  if (groupKey === 'buffIcons') {
    return (
      <div style={previewShellStyle}>
        <BuffTracker
          gameState={PREVIEW_GAME_STATE}
          currentTime={PREVIEW_CURRENT_TIME}
          registry={MONK_BUFF_REGISTRY}
          iconNameResolver={resolveMonkBuffIconName}
          blacklist={previewBuffBlacklist}
          whitelist={buffTracking?.iconTracker.trackedEntryIds}
          maxPerRow={trackerRows.buffIcons}
          containerStyle={{}}
        />
      </div>
    );
  }

  if (groupKey === 'essentialCooldowns') {
    return (
      <div style={previewShellStyle}>
        <CooldownManager
          gameState={PREVIEW_GAME_STATE}
          currentTime={PREVIEW_CURRENT_TIME}
          showEssential
          showUtility={false}
          essentialTrackedIds={cooldownTracking?.essential.trackedEntryIds}
          essentialIconsPerRow={trackerRows.essentialCooldowns}
          spellInputStatus={PREVIEW_SPELL_INPUT_STATUS}
        />
      </div>
    );
  }

  if (groupKey === 'utilityCooldowns') {
    return (
      <div style={previewShellStyle}>
        <CooldownManager
          gameState={PREVIEW_GAME_STATE}
          currentTime={PREVIEW_CURRENT_TIME}
          showEssential={false}
          showUtility
          utilityTrackedIds={cooldownTracking?.utility.trackedEntryIds}
          utilityIconsPerRow={trackerRows.utilityCooldowns}
          spellInputStatus={PREVIEW_SPELL_INPUT_STATUS}
        />
      </div>
    );
  }

  if (groupKey === 'consumables') {
    return (
      <div style={{ ...previewShellStyle, transform: 'scale(0.78)', transformOrigin: 'center center' }}>
        <ConsumableTracker
          gameState={PREVIEW_GAME_STATE}
          currentTime={PREVIEW_CURRENT_TIME}
          trackedIds={consumableTracking?.trackedEntryIds}
          iconsPerRow={trackerRows.consumables}
        />
      </div>
    );
  }

  return <></>;
}

function buildPreviewActionBarAssignments(actionBar: ActionBarSettings['bars'][ActionBarId]): {
  buttons: ActionBarButtonAssignment[];
  slots: typeof WW_ACTION_BAR;
} {
  const slotBySpellId = new Map(WW_ACTION_BAR.map((slot) => [slot.spellId, slot]));
  const preservedButtons = actionBar.buttons
    .slice(0, actionBar.buttonCount)
    .map((button) => {
      const primarySpellId = button.spellIds[0];
      const slot = primarySpellId ? slotBySpellId.get(primarySpellId) : undefined;

      return {
        spellIds: [...button.spellIds],
        keybind: button.keybind ?? slot?.defaultKey ?? '',
      };
    });

  const visibleSlots = preservedButtons.flatMap((button) => {
    const primarySpellId = button.spellIds[0];
    const slot = primarySpellId ? slotBySpellId.get(primarySpellId) : undefined;
    return slot ? [slot] : [];
  });

  return {
    buttons: preservedButtons,
    slots: visibleSlots,
  };
}

function buildPreviewActionBarGameState(slots: readonly ActionBarSlotDef[]): GameStateSnapshot {
  const previewTalents = new Set(PREVIEW_GAME_STATE.talents);

  slots.forEach((slot) => {
    const spell = MONK_WW_SPELLS.get(slot.spellId) ?? SHARED_PLAYER_SPELLS.get(slot.spellId);
    const requiredTalent = slot.talentRequired ?? spell?.talentRequired;
    if (requiredTalent) {
      previewTalents.add(requiredTalent);
    }
  });

  return {
    ...PREVIEW_GAME_STATE,
    talents: previewTalents,
  };
}

function buildActionBarOverlayStyle(columnCount: number): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    gridTemplateColumns: `repeat(${columnCount}, 52px)`,
    gap: 4,
    justifyContent: 'start',
    alignContent: 'start',
  };
}

const actionBarOverlayButtonStyle: CSSProperties = {
  width: 52,
  height: 52,
  padding: 0,
  borderRadius: 12,
  border: `1px solid ${T.accent}`,
  background: 'rgba(53, 200, 155, 0.1)',
  boxShadow: `inset 0 0 0 1px ${T.accentSoft}`,
  cursor: 'pointer',
};

function getActionBarLabel(actionBarId: ActionBarId): string {
  return `Action Bar ${Number.parseInt(actionBarId.replace('bar', ''), 10)}`;
}

function resolveActionBarSpellId(value: string): string | null {
  const needle = value.trim().toLowerCase();
  if (needle.length === 0) {
    return null;
  }

  const exactSlot = WW_ACTION_BAR.find((slot) => slot.spellId === needle);
  if (exactSlot) {
    return exactSlot.spellId;
  }

  const displayMatch = WW_ACTION_BAR.find((slot) => {
    const spell = MONK_WW_SPELLS.get(slot.spellId) ?? SHARED_PLAYER_SPELLS.get(slot.spellId);
    return spell?.displayName.toLowerCase() === needle;
  });

  return displayMatch?.spellId ?? null;
}

function reorderSpellSequence(spellIds: readonly string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= spellIds.length || toIndex >= spellIds.length) {
    return [...spellIds];
  }

  const next = [...spellIds];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function isActionBarLayoutKey(groupKey: HudLayoutGroupKey): groupKey is Extract<HudLayoutGroupKey, `actionBar${number}`> {
  return groupKey.startsWith('actionBar');
}

function getActionBarIdFromLayoutKey(groupKey: HudLayoutGroupKey): ActionBarId | null {
  if (!isActionBarLayoutKey(groupKey)) {
    return null;
  }

  const candidate = `bar${groupKey.replace('actionBar', '')}` as ActionBarId;
  return ACTION_BAR_IDS.includes(candidate) ? candidate : null;
}

function getTrackerRowGroupKey(groupKey: HudLayoutGroupKey): TrackerRowGroupKey | null {
  switch (groupKey) {
    case 'essentialCooldowns':
    case 'utilityCooldowns':
    case 'buffIcons':
    case 'consumables':
      return groupKey;
    default:
      return null;
  }
}

function clampActionBarCount(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(12, Math.max(1, Math.floor(parsed)));
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) {
    return CENTER_GUIDE_PCT;
  }

  return Math.min(100, Math.max(0, value));
}

function getCanvasMetrics(canvas: HTMLDivElement | null): CanvasMetrics {
  const rect = canvas?.getBoundingClientRect();
  return {
    width: rect?.width && rect.width > 0 ? rect.width : 1000,
    height: rect?.height && rect.height > 0 ? rect.height : 600,
    left: rect?.left ?? 0,
    top: rect?.top ?? 0,
  };
}

function resolveBaseGroupSize(groupKey: HudLayoutGroupKey, width: number, height: number): { width: number; height: number } {
  if (width > 0 && height > 0) {
    return { width, height };
  }

  const fallback = FALLBACK_GROUP_BASE_SIZES[groupKey];
  return {
    width: fallback?.width ?? width,
    height: fallback?.height ?? height,
  };
}

function clampPercentWithinBounds(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return CENTER_GUIDE_PCT;
  }

  if (min > max) {
    return (min + max) / 2;
  }

  return Math.min(max, Math.max(min, value));
}

function clampLayoutPositionToCanvas(
  position: HudGroupLayout,
  metrics: CanvasMetrics,
  baseWidth: number,
  baseHeight: number,
): HudGroupLayout {
  const halfWidthPct = ((baseWidth * position.scale) / 2 / metrics.width) * 100;
  const halfHeightPct = ((baseHeight * position.scale) / 2 / metrics.height) * 100;
  const minXPct = Math.max(0, halfWidthPct);
  const maxXPct = Math.min(100, 100 - halfWidthPct);
  const minYPct = Math.max(0, halfHeightPct);
  const maxYPct = Math.min(100, 100 - halfHeightPct);

  return {
    ...position,
    xPct: clampPercentWithinBounds(position.xPct, minXPct, maxXPct),
    yPct: clampPercentWithinBounds(position.yPct, minYPct, maxYPct),
  };
}

function clampScaleToCanvasBounds(
  scale: number,
  position: HudGroupLayout,
  metrics: CanvasMetrics,
  baseWidth: number,
  baseHeight: number,
): number {
  const centerX = (position.xPct / 100) * metrics.width;
  const centerY = (position.yPct / 100) * metrics.height;
  const horizontalRoom = Math.max(0, Math.min(centerX, metrics.width - centerX));
  const verticalRoom = Math.max(0, Math.min(centerY, metrics.height - centerY));
  const widthLimit = baseWidth > 0 ? (horizontalRoom * 2) / baseWidth : MAX_LAYOUT_SCALE;
  const heightLimit = baseHeight > 0 ? (verticalRoom * 2) / baseHeight : MAX_LAYOUT_SCALE;
  const boundedScale = Math.min(scale, widthLimit, heightLimit);

  return clampScale(boundedScale);
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(MAX_LAYOUT_SCALE, Math.max(MIN_LAYOUT_SCALE, value));
}

function snapPct(value: number, siblingGuides: readonly number[]): number {
  if (Math.abs(value - CENTER_GUIDE_PCT) <= SNAP_THRESHOLD_PCT) {
    return CENTER_GUIDE_PCT;
  }

  for (const guide of siblingGuides) {
    if (Math.abs(value - guide) <= SNAP_THRESHOLD_PCT) {
      return guide;
    }
  }

  return value;
}

function formatScale(value: number): string {
  return `${value.toFixed(2)}x`;
}

function controlButton(primary: boolean): CSSProperties {
  return primary
    ? {
      ...buildControlStyle({ tone: 'primary' }),
      color: '#04120d',
      fontFamily: FONTS.ui,
      padding: '8px 12px',
    }
    : {
      ...buildControlStyle({ tone: 'ghost' }),
      fontFamily: FONTS.ui,
      padding: '8px 12px',
    };
}

function buildCanvasStyle(showGrid: boolean): CSSProperties {
  return {
    position: 'relative',
    minHeight: 680,
    height: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    border: `1px solid ${T.borderBright}`,
    background: showGrid
      ? `
        radial-gradient(circle at 50% 18%, rgba(86, 221, 179, 0.08), transparent 24%),
        linear-gradient(180deg, rgba(7,10,15,0.96), rgba(4,6,10,0.98)),
        linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
      `
      : 'radial-gradient(circle at 50% 18%, rgba(86, 221, 179, 0.08), transparent 24%), linear-gradient(180deg, rgba(7,10,15,0.96), rgba(4,6,10,0.98))',
    backgroundSize: showGrid ? '100% 100%, 100% 100%, 40px 40px, 40px 40px' : '100% 100%, 100% 100%',
    backgroundPosition: '0 0',
  };
}

function buildGuideLineStyle(
  orientation: 'horizontal' | 'vertical',
  pct: number,
  color: string,
): CSSProperties {
  return orientation === 'vertical'
    ? {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: `${pct}%`,
      width: 1,
      background: color,
      pointerEvents: 'none',
    }
    : {
      position: 'absolute',
      left: 0,
      right: 0,
      top: `${pct}%`,
      height: 1,
      background: color,
      pointerEvents: 'none',
    };
}

const editorOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'radial-gradient(circle at top, rgba(96, 122, 168, 0.14), transparent 24%), rgba(4, 6, 10, 0.94)',
  backdropFilter: 'blur(3px)',
  display: 'block',
  padding: 0,
  zIndex: 2000,
  overflow: 'auto',
};

const editorModalStyle: CSSProperties = {
  width: '100%',
  minHeight: '100dvh',
  height: '100dvh',
  maxHeight: '100dvh',
  overflow: 'visible',
  boxSizing: 'border-box',
  borderRadius: 0,
  border: 'none',
  background: 'linear-gradient(180deg, rgba(13,16,24,0.99), rgba(6,8,12,0.98))',
  boxShadow: 'none',
  padding: '8px 8px calc(8px + env(safe-area-inset-bottom, 0px))',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  gap: 8,
};

const editorHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  alignItems: 'center',
};

const toggleLabelStyle: CSSProperties = {
  ...buildHudFrameStyle({ compact: true }),
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  color: T.textBright,
  fontFamily: FONTS.ui,
  fontSize: '0.78rem',
  padding: '6px 10px',
};

const positionEditorStyle: CSSProperties = {
  ...buildPanelStyle({ elevated: true, density: 'compact' }),
  position: 'fixed',
  width: 220,
  borderRadius: 14,
  border: `1px solid ${T.borderBright}`,
  background: 'linear-gradient(180deg, rgba(10, 15, 26, 0.98), rgba(5, 10, 18, 0.96))',
  padding: 12,
  display: 'grid',
  gap: 10,
  zIndex: 4,
  maxHeight: 'calc(100dvh - 24px)',
  overflowY: 'auto',
};

const inputLabelStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  color: T.textBright,
  fontFamily: FONTS.ui,
  fontSize: '0.76rem',
};

const inputStyle: CSSProperties = {
  borderRadius: 10,
  border: `1px solid ${T.borderBright}`,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
  color: T.textBright,
  padding: '8px 10px',
  fontFamily: FONTS.ui,
};

const mockCenterDummyStyle: CSSProperties = {
  position: 'absolute',
  top: '42%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  fontSize: '5rem',
  opacity: 0.18,
  userSelect: 'none',
};

const resizeHandleStyle: CSSProperties = {
  position: 'absolute',
  right: -8,
  bottom: -8,
  width: 18,
  height: 18,
  borderRadius: 999,
  border: `1px solid ${T.borderBright}`,
  background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.98), rgba(7, 11, 20, 0.96))',
  boxShadow: '0 6px 14px rgba(0,0,0,0.34)',
  cursor: 'nwse-resize',
};

export default HudLayoutPreview;
