import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { buildControlStyle, buildHudFrameStyle } from '@ui/theme/stylePrimitives';
import {
  PlayerFrame,
  TargetFrame,
  EnergyChiDisplay,
  ActionBar,
  CooldownManager,
  CastBar,
  FloatingCombatText,
  RecommendationQueue,
  BuffTracker,
  BuffBarTracker,
  ConsumableTracker,
  ChallengeOverlay,
  ChallengeHud,
} from '@ui/components';
import {
  augmentActionBarSlots,
  getVisibleActionBarSlots,
  resolveActionBarButtonSpellIds,
  type ActionBarSlotDef,
} from '@ui/components/ActionBar';
import { getDefaultProfileForSpec } from '@core/data/defaultProfile';
import { getBuffbookForProfileSpec } from '@core/data/specBuffbook';
import { getSpellbookForProfileSpec } from '@core/data/specSpellbook';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';
import { getTalentLoadoutForProfileSpec } from '@core/data/talentStringDecoder';
import { useSimulation, type CountdownValue } from '@ui/sim/useSimulation';
import type { CharacterLoadout } from '@core/data/loadout';
import type { GameStateSnapshot } from '@core/engine/gameState';
import {
  ACTION_BAR_IDS,
  DEFAULT_CHALLENGE_VALID_KEYS,
  type ChallengeSettings,
  getDefaultTrainerSettings,
  type ActionBarConfig,
  type ActionBarId,
  type ActionBarSettings,
  type HudLayoutSettings,
  type HudSettings,
  type TrainerMode,
  usesCompetitiveTrainerRules,
} from '@ui/state/trainerSettings';
import { buildTrackerBlacklist } from '@ui/components/trackerSpellIds';
import { LoadoutPanel } from './LoadoutPanel';
import { normalizeKey, normalizeMouseButton, normalizeMouseWheel } from '@ui/utils/keyUtils';
import { useChallengeMode } from '@ui/challenge/useChallengeMode';
import type { RunAnalysisReport } from '@core/analysis';
import { getProfileSpecForAnalysisSpecId } from '@core/analysis';
import { usePostRunAnalysis } from '@ui/analysis/usePostRunAnalysis';
import { useEncounterMusic } from '@ui/audio/useEncounterMusic';
import { FIXED_SCENE_HEIGHT, FIXED_SCENE_WIDTH, useFixedSceneScale } from '@ui/utils/layoutScaling';
import {
  getDefaultPlayableTrainerSpecId,
  getTrainerSpecDefinition,
  getTrainerSpecUiDefaults,
  type TrainerSpecId,
} from '@ui/specs/specCatalog';
import {
  getBuffIconNameResolverForProfileSpec,
  getBuffPresentationRegistryForProfileSpec,
} from '@ui/specs/specBuffPresentation';
import { getCooldownTrackerDefinitionsForProfileSpec } from '@ui/specs/specCooldownPresentation';

const LazyEndScreen = React.lazy(() => import('./EndScreen'));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EncounterScreenProps {
  selectedSpec?: TrainerSpecId;
  mode: TrainerMode;
  speedMultiplier?: number;
  challengeSettings?: ChallengeSettings;
  onExit: () => void;
  onAnalysisReady?: (result: {
    mode: TrainerMode;
    duration: number;
    endReason: string | null;
    report: RunAnalysisReport;
  }) => void;
  encounterDuration?: number;
  /** Number of active enemies for multi-target encounters (1–8). Defaults to 1. */
  nTargets?: number;
  musicVolume?: number;
  initialTalents?: ReadonlySet<string>;
  initialTalentRanks?: ReadonlyMap<string, number>;
  initialLoadout?: CharacterLoadout;
  onMusicVolumeChange?: (volume: number) => void;
  onTalentsChange?: (talents: ReadonlySet<string>, talentRanks: ReadonlyMap<string, number>) => void;
  onLoadoutChange?: (loadout: CharacterLoadout) => void;
  actionBarSettings?: ActionBarSettings;
  hudSettings?: HudSettings;
  /**
   * When true, chi and energy render inline inside the PlayerFrame.
   * When false (default), they appear as a detached center panel.
   */
  resourcesAnchored?: boolean;
}

// ---------------------------------------------------------------------------
// Encounter Screen
// ---------------------------------------------------------------------------

/**
 * EncounterScreen — the live combat view.
 *
 * Lays out all HUD components and wires them to the simulation via useSimulation.
 * Layout (from bottom):
 *   - Action bar (bottom center)
 *   - Cooldown manager (above action bar)
 *   - PlayerFrame (bottom-left) / TargetFrame (bottom-right)
 *   - RecommendationQueue (top-left corner)
 *   - CastBar (center, above action bar)
 *   - FloatingCombatText (over the target dummy area)
 *   - DPS / timer overlay (top center)
 */
export function EncounterScreen({
  selectedSpec = getDefaultPlayableTrainerSpecId(),
  mode,
  speedMultiplier,
  challengeSettings,
  onExit,
  onAnalysisReady,
  encounterDuration = usesCompetitiveTrainerRules(mode) ? 90 : 120,
  nTargets = 1,
  musicVolume = getDefaultTrainerSettings().audio.musicVolume,
  initialTalents,
  initialTalentRanks,
  initialLoadout,
  onMusicVolumeChange,
  onTalentsChange,
  onLoadoutChange,
  actionBarSettings,
  hudSettings,
  resourcesAnchored = false,
}: EncounterScreenProps): React.ReactElement {
  const specDefinition = getTrainerSpecDefinition(selectedSpec);
  const profileSpec = specDefinition.profileSpec;
  const specUiDefaults = getTrainerSpecUiDefaults(selectedSpec);
  const talentDefinition = getTalentLoadoutForProfileSpec(profileSpec);
  const defaultProfile = getDefaultProfileForSpec(profileSpec);
  const spellbook = getSpellbookForProfileSpec(profileSpec);
  const buffbook = getBuffbookForProfileSpec(profileSpec);
  const buffRegistry = getBuffPresentationRegistryForProfileSpec(profileSpec);
  const buffIconNameResolver = getBuffIconNameResolverForProfileSpec(profileSpec);
  const cooldownDefinitions = getCooldownTrackerDefinitionsForProfileSpec(profileSpec);
  const legacyBuffBlacklist = ['mystic_touch', 'chaos_brand', 'hunters_mark'];
  const {
    simState,
    talents,
    talentRanks,
    loadout,
    injectInput,
    cancelChannel,
    updateTalents,
    updateLoadout,
    dismissTutorialPrompt,
    pause,
    resume,
    togglePause,
    restart,
    finishEncounterEarly,
  } = useSimulation({
    selectedSpec,
    mode,
    speedMultiplier,
    encounterDuration,
    nTargets,
    initialTalents,
    initialTalentRanks,
    initialLoadout,
  });

  const {
    snapshot,
    analysisTrace,
    spellInputStatus,
    simTime,
    dps,
    countdownValue,
    hasStarted,
    isPaused,
    isEnded,
    recommendations,
    channelInfo,
    damageEvents,
    procHighlight,
    tutorialPrompt,
    endReason,
    finalDuration,
  } = simState;

  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [debugRec, setDebugRec] = useState(false);
  const showDebugControls = import.meta.env.DEV;
  const [procHighlightStyle, setProcHighlightStyle] = useState<'pulse' | 'shake'>('pulse');
  const [challengeSeed] = useState(() => Math.floor(Date.now() % 1_000_000_000));
  const pausedByLoadoutRef = useRef(false);
  const challengeEnabled = mode === 'challenge';
  const canManualPause = !usesCompetitiveTrainerRules(mode);
  const canEditEncounterBuild = !hasStarted || isEnded;
  const showEssentialCooldowns = hudSettings?.cooldowns.essential.enabled ?? true;
  const showUtilityCooldowns = hudSettings?.cooldowns.utility.enabled ?? true;
  const showBuffIcons = hudSettings?.buffs.iconTracker.enabled ?? true;
  const showBuffBars = hudSettings?.buffs.barTracker.enabled ?? false;
  const showTargetDebuffs = hudSettings?.targetDebuffs.enabled ?? true;
  const showConsumables = hudSettings?.consumables.enabled ?? true;
  const showEnemyIcon = hudSettings?.general.showEnemyIcon ?? true;
  const showDamageText = hudSettings?.general.showDamageText ?? true;
  const showMeleeSwingDamage = hudSettings?.general.showMeleeSwingDamage ?? true;
  const combinedBuffBlacklistSpellIds = [
    ...(hudSettings?.buffs.iconTracker.blacklistSpellIds ?? []),
    ...(hudSettings?.buffs.barTracker.blacklistSpellIds ?? []),
  ];
  const buffBlacklist = buildTrackerBlacklist(specUiDefaults.buffSpellIds, [...new Set(combinedBuffBlacklistSpellIds)]);
  const hudLayout = hudSettings?.layout;
  const actionBarConfigs = actionBarSettings ?? getDefaultTrainerSettings().actionBars;
  const visibleActionBarSlots = useMemo(
    () => (snapshot ? getVisibleActionBarSlots(snapshot, specUiDefaults.actionBarSlots, spellbook) : []),
    [snapshot, specUiDefaults.actionBarSlots, spellbook],
  );
  const renderedActionBars = useMemo(
    () => (snapshot ? buildRenderedActionBars(actionBarConfigs, visibleActionBarSlots) : []),
    [actionBarConfigs, snapshot, visibleActionBarSlots],
  );
  const encounterInputMap = useMemo(
    () => (snapshot ? buildEncounterInputMap(renderedActionBars, snapshot, visibleActionBarSlots) : {}),
    [renderedActionBars, snapshot, visibleActionBarSlots],
  );
  const tutorialExpectedSpellId = tutorialPrompt?.expectedSpellId ?? null;
  const tutorialActive = mode === 'tutorial' && tutorialPrompt !== null;
  const tutorialExpectedSpellSequence = useMemo(
    () => (
      tutorialExpectedSpellId === null || snapshot === null
        ? null
        : findSpellSequenceForTutorial(renderedActionBars, visibleActionBarSlots, snapshot, tutorialExpectedSpellId)
    ),
    [renderedActionBars, snapshot, tutorialExpectedSpellId, visibleActionBarSlots],
  );
  const handleSpellInput = (spellId: string): void => {
    if (!tutorialActive || tutorialExpectedSpellId === null) {
      injectInput(spellId);
      return;
    }

    if (spellId !== tutorialExpectedSpellId) {
      return;
    }

    dismissTutorialPrompt();
    resume();
    injectInput(spellId);
  };
  const handleSpellSequence = (spellIds: readonly string[]): void => {
    if (spellIds.length === 0) {
      return;
    }

    if (!tutorialActive || tutorialExpectedSpellId === null) {
      spellIds.forEach((spellId) => injectInput(spellId));
      return;
    }

    if (!spellIds.includes(tutorialExpectedSpellId)) {
      return;
    }

    dismissTutorialPrompt();
    resume();
    spellIds.forEach((spellId) => injectInput(spellId));
  };
  const handleResumeTutorial = (): void => {
    dismissTutorialPrompt();
    resume();
  };
  const challengeValidKeys = useMemo(
    () => [...(challengeSettings?.validKeys ?? DEFAULT_CHALLENGE_VALID_KEYS)],
    [challengeSettings?.validKeys],
  );
  const challenge = useChallengeMode({
    enabled: challengeEnabled,
    difficulty: challengeSettings?.difficulty ?? 'easy',
    validKeys: challengeValidKeys,
    spawnCadenceMultiplier: challengeSettings?.spawnCadenceMultiplier ?? 1,
    duration: encounterDuration,
    simTime,
    countdownValue,
    hasStarted,
    isPaused,
    isEnded,
    seed: challengeSeed,
    onFailure: () => finishEncounterEarly('challenge_failure'),
  });

  const { skipToNextTrack } = useEncounterMusic({
    mode,
    encounterDuration,
    simTime,
    countdownValue,
    hasStarted,
    isPaused,
    isEnded,
    musicVolume,
  });
  const musicControlsEnabled = mode === 'test' || mode === 'challenge';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (tutorialActive && event.code === 'Space') {
        event.preventDefault();
        handleResumeTutorial();
        return;
      }

      if (event.code === 'Space' && canManualPause && !loadoutOpen) {
        event.preventDefault();
        togglePause();
        return;
      }

      if (event.key === 'Escape' && !loadoutOpen) {
        event.preventDefault();
        cancelChannel();
        return;
      }

      const chord = normalizeKey(event);
      if (challengeEnabled && challenge.handleKeyChord(chord)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const spellIds = encounterInputMap[chord] ?? [];
      if (spellIds.length > 0) {
        event.preventDefault();
        handleSpellSequence(spellIds);
        return;
      }

      const loweredKey = event.key.toLowerCase();
      if (loweredKey === 'f5') {
        event.preventDefault();
        restart();
        return;
      }

      if (loweredKey === 'f1') {
        event.preventDefault();
        skipToNextTrack();
      }
    };

    const handleMouseDown = (event: MouseEvent): void => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const chord = normalizeMouseButton(event);
      if (chord === null) {
        return;
      }

      const spellIds = encounterInputMap[chord] ?? [];
      if (spellIds.length === 0) {
        return;
      }

      event.preventDefault();
      handleSpellSequence(spellIds);
    };

    const handleWheel = (event: WheelEvent): void => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const chord = normalizeMouseWheel(event);
      if (chord === null) {
        return;
      }

      const spellIds = encounterInputMap[chord] ?? [];
      if (spellIds.length === 0) {
        return;
      }

      event.preventDefault();
      handleSpellSequence(spellIds);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [
    cancelChannel,
    canManualPause,
    challenge,
    challengeEnabled,
    encounterInputMap,
    handleResumeTutorial,
    handleSpellInput,
    handleSpellSequence,
    loadoutOpen,
    restart,
    skipToNextTrack,
    tutorialActive,
    togglePause,
  ]);

  useEffect(() => {
    if (loadoutOpen) {
      if (!isPaused) {
        pause();
        pausedByLoadoutRef.current = true;
      }
      return;
    }

    if (pausedByLoadoutRef.current) {
      resume();
      pausedByLoadoutRef.current = false;
    }
  }, [isPaused, loadoutOpen, pause, resume]);

  const showRecommendations = !usesCompetitiveTrainerRules(mode) && hasStarted && countdownValue === null;
  const showChallengePlayfield = challengeEnabled && countdownValue === null && hasStarted && !isEnded;
  const reportedAnalysisRef = useRef<RunAnalysisReport | null>(null);
  const postRunAnalysis = usePostRunAnalysis({
    enabled: isEnded && analysisTrace !== null,
    selectedSpec,
    encounterDuration: finalDuration ?? encounterDuration,
    activeEnemies: nTargets,
    talents,
    talentRanks,
    loadout,
    playerTrace: analysisTrace,
  });

  useEffect(() => {
    if (!isEnded) {
      reportedAnalysisRef.current = null;
      return;
    }

    if (postRunAnalysis.status !== 'ready' || postRunAnalysis.report === null || reportedAnalysisRef.current === postRunAnalysis.report) {
      return;
    }

    reportedAnalysisRef.current = postRunAnalysis.report;
    onAnalysisReady?.({
      mode,
      duration: finalDuration ?? encounterDuration,
      endReason,
      report: postRunAnalysis.report,
    });
  }, [encounterDuration, endReason, finalDuration, isEnded, mode, onAnalysisReady, postRunAnalysis]);

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const root: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100dvh',
    maxHeight: '100dvh',
    background: `radial-gradient(circle at top, rgba(96, 122, 168, 0.14), transparent 26%), ${T.bg}`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  // Main play area — paddingBottom reserves space for the fixed HUD
  const playArea: CSSProperties = {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: 'radial-gradient(circle at center, rgba(255,255,255,0.03), transparent 42%)',
  };

  const viewportScale = useFixedSceneScale({ paddingY: 48 });
  const layoutScale = hudSettings?.general.layoutScale ?? 1;
  const encounterSceneScale = viewportScale * layoutScale;

  const encounterStage: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: 'calc(50% + 28px)',
    width: `${FIXED_SCENE_WIDTH}px`,
    height: `${FIXED_SCENE_HEIGHT}px`,
    transform: `translate(-50%, -50%) scale(${encounterSceneScale})`,
    transformOrigin: 'center center',
  };

  // Training dummy placeholder — main target
  const dummyArea: CSSProperties = {
    width: 88,
    height: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '4.2rem',
    opacity: 0.5,
    userSelect: 'none',
  };
  const foldedMeleeDamageSpellIds = new Set([
    'auto_attack',
    'auto_attack_mh',
    'auto_attack_oh',
    'dual_threat',
    'thunderfist',
  ]);
  const visibleDamageEvents = showDamageText
    ? (showMeleeSwingDamage ? damageEvents : damageEvents.filter((event) => !foldedMeleeDamageSpellIds.has(event.spellId ?? '')))
    : [];
  const enemyAnchorPosition = hudLayout?.enemyIcon ?? { xPct: 50, yPct: 30 };

  // Bottom HUD — fixed position so action bar never moves when buffs/channel change
  const bottomDock: CSSProperties = {
    position: 'absolute',
    left: `${hudLayout?.castBar.xPct ?? 50}%`,
    top: `${hudLayout?.castBar.yPct ?? 96}%`,
    transform: `translate(-50%, -50%) scale(${hudLayout?.castBar.scale ?? 1})`,
    transformOrigin: 'center center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 480,
    pointerEvents: 'none',
    zIndex: 2,
  };

  // Fixed-height cast bar slot — always reserves space so ActionBar never jumps
  const castBarSlot: CSSProperties = {
    width: '100%',
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };


  // Frames row — centered, spread horizontally (PlayerFrame | Resources | TargetFrame)
  // Timer / DPS overlay
  const topBar: CSSProperties = {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    gap: 32,
    pointerEvents: 'none',
  };

  const musicControls: CSSProperties = {
    position: 'absolute',
    top: 10,
    left: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    pointerEvents: 'auto',
  };

  const musicVolumeBar: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    ...buildHudFrameStyle({ compact: true }),
    padding: '4px 10px',
    fontFamily: FONTS.ui,
    fontSize: '0.78rem',
    color: T.textBright,
  };

  const musicVolumeSlider: CSSProperties = {
    width: 110,
    accentColor: T.accent,
    cursor: 'pointer',
  };

  const statPill: CSSProperties = {
    ...buildHudFrameStyle({ compact: true }),
    padding: '4px 14px',
    fontFamily: FONTS.ui,
    fontSize: '0.85rem',
    color: T.textBright,
    boxShadow: 'none',
  };

  const statLabel: CSSProperties = {
    color: T.textDim,
    fontSize: '0.7rem',
    marginRight: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };

  // Exit button
  const exitBtn: CSSProperties = {
    position: 'absolute',
    top: 10,
    right: 14,
    ...buildControlStyle({ tone: 'ghost' }),
    color: T.textDim,
    fontSize: '0.72rem',
    padding: '6px 12px',
  };

  // Loadout button
  const loadoutBtn: CSSProperties = {
    position: 'absolute',
    top: 10,
    right: 90,
    ...buildControlStyle({ tone: 'ghost' }),
    color: T.textDim,
    fontSize: '0.72rem',
    padding: '6px 12px',
  };

  // Debug toggle button
  const debugBtn: CSSProperties = {
    position: 'absolute',
    top: 10,
    right: canManualPause ? 342 : 258,
    ...buildControlStyle({ tone: 'ghost', active: debugRec }),
    border: `1px solid ${debugRec ? T.accent : T.borderSubtle}`,
    color: debugRec ? T.accent : T.textDim,
    fontSize: '0.72rem',
    padding: '6px 12px',
  };

  // Proc style button
  const procStyleBtn: CSSProperties = {
    position: 'absolute',
    top: 10,
    right: canManualPause ? 426 : 342,
    ...buildControlStyle({ tone: 'ghost' }),
    color: T.textDim,
    fontSize: '0.72rem',
    padding: '6px 12px',
  };

  const pauseBtn: CSSProperties = {
    position: 'absolute',
    top: 10,
    right: 258,
    ...buildControlStyle({ tone: 'ghost', active: isPaused }),
    border: `1px solid ${isPaused ? T.accent : T.borderSubtle}`,
    color: isPaused ? T.accent : T.textDim,
    fontSize: '0.72rem',
    padding: '6px 12px',
  };

  const restartBtn: CSSProperties = {
    position: 'absolute',
    top: 10,
    right: 174,
    ...buildControlStyle({ tone: 'ghost' }),
    color: T.textDim,
    fontSize: '0.72rem',
    padding: '6px 12px',
  };

  const nextSongBtn: CSSProperties = {
    ...buildControlStyle({ tone: 'ghost' }),
    color: musicControlsEnabled ? T.textDim : T.textMuted,
    fontSize: '0.72rem',
    padding: '6px 12px',
    opacity: musicControlsEnabled ? 1 : 0.65,
  };

  // Recommendation queue — centered horizontally
  const recQueuePos: CSSProperties = {
    position: 'absolute',
    top: '38%',
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
  };

  const tutorialOverlay: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'rgba(18, 22, 28, 0.68)',
    zIndex: 3,
    pointerEvents: 'none',
  };

  const tutorialCard: CSSProperties = {
    position: 'absolute',
    top: 84,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 420,
    maxWidth: 'calc(100% - 32px)',
    ...buildHudFrameStyle(),
    padding: '16px 18px',
    zIndex: 4,
    pointerEvents: 'auto',
    display: 'grid',
    gap: 12,
  };

  const tutorialBadge: CSSProperties = {
    justifySelf: 'start',
    padding: '4px 8px',
    borderRadius: 999,
    background: 'rgba(247, 244, 163, 0.12)',
    color: '#f7f4a3',
    fontSize: '0.72rem',
    fontFamily: FONTS.ui,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  };

  const tutorialList: CSSProperties = {
    margin: 0,
    paddingLeft: 18,
    color: T.textBright,
    display: 'grid',
    gap: 6,
    fontSize: '0.92rem',
  };

  const tutorialButtonRow: CSSProperties = {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  };

  const tutorialButton: CSSProperties = {
    ...buildControlStyle({ tone: 'primary' }),
    padding: '8px 12px',
    fontSize: '0.8rem',
  };


  const timeRemaining = Math.max(0, encounterDuration - simTime);
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  const timerStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // ---------------------------------------------------------------------------
  // End screen
  // ---------------------------------------------------------------------------

  if (isEnded && snapshot) {
    return (
      <React.Suspense
        fallback={
          <div style={{ width: '100%', height: '100dvh', display: 'grid', placeItems: 'center', background: T.bg, color: T.textDim }}>
            Loading analysis...
          </div>
        }
      >
        <LazyEndScreen
          dps={dps}
          totalDamage={snapshot.totalDamage}
          duration={finalDuration ?? encounterDuration}
          profileSpec={profileSpec}
          mode={mode}
          analysisStatus={postRunAnalysis.status}
          analysisReport={postRunAnalysis.report}
          analysisError={postRunAnalysis.error}
          endReason={endReason}
          onRestart={restart}
          onExit={onExit}
        />
      </React.Suspense>
    );
  }

  return (
    <div style={root}>
      {/* Main play area */}
      <div style={playArea}>
        <div style={encounterStage}>
        {showEnemyIcon && (
          <div data-testid="encounter-enemy-icon" style={buildHudGroupStyle(hudLayout?.enemyIcon ?? { xPct: 50, yPct: 30 })}>
            {/* Main target dummy */}
            <div style={dummyArea}>🪆</div>
            {/* Additional target dummies (smaller) arranged to the side */}
            {nTargets > 1 && (
              <div style={{
                position: 'absolute',
                left: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                paddingLeft: 4,
              }}>
                {Array.from({ length: Math.min(nTargets - 1, 7) }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: nTargets <= 3 ? '2.1rem' : nTargets <= 5 ? '1.6rem' : '1.2rem',
                      opacity: 0.4,
                      userSelect: 'none',
                      lineHeight: 1,
                    }}
                  >
                    🪆
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showChallengePlayfield && (
          <>
            <div
              data-testid="encounter-challenge-playfield"
              style={buildHudGroupStyle(hudLayout?.challengePlayfield ?? { xPct: 50, yPct: 48 })}
            >
              <ChallengeOverlay
                difficulty={challenge.challenge.difficulty}
                playfield={challenge.playfield}
                currentTime={simTime}
                notes={challenge.activeNotes}
                feedbackBursts={challenge.challenge.feedbackBursts}
                onPointerMove={challenge.handlePointerMove}
                onPointerDown={challenge.handlePointerDown}
                onPointerUp={challenge.handlePointerUp}
                onPointerLeave={challenge.handlePointerLeave}
              />
            </div>
            <ChallengeHud
              difficulty={challenge.challenge.difficulty}
              validKeys={challenge.challenge.validKeys}
              stats={challenge.challenge.stats}
              showStats={false}
            />
          </>
        )}

        {countdownValue !== null && (
          <CountdownOverlay countdownValue={countdownValue} />
        )}

        {/* Floating combat text */}
        <FloatingCombatText events={visibleDamageEvents} anchorPosition={enemyAnchorPosition} />

        {tutorialActive && (
          <>
            <div data-testid="tutorial-overlay" style={tutorialOverlay} />
            <div data-testid="tutorial-prompt" style={tutorialCard}>
              <div style={tutorialBadge}>{tutorialPrompt.phaseLabel}</div>
              <div>
                <div style={{ color: T.textDim, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Cast now
                </div>
                <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '1.3rem' }}>
                  {getSpellLabel(tutorialPrompt.expectedSpellId, spellbook)}
                </div>
              </div>
              <div>
                <div style={{ color: T.textBright, fontWeight: 700, marginBottom: 4 }}>{tutorialPrompt.title}</div>
                <div style={{ color: T.textDim, lineHeight: 1.45 }}>{tutorialPrompt.summary}</div>
              </div>
              <div>
                <div style={{ color: T.textDim, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  {tutorialPrompt.phaseLabel} list
                </div>
                <ol style={tutorialList}>
                  {tutorialPrompt.topRecommendations.map((spellId) => (
                    <li
                      key={spellId}
                      style={{ color: spellId === tutorialPrompt.expectedSpellId ? '#f7f4a3' : T.textBright }}
                    >
                      {getSpellLabel(spellId, spellbook)}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <div style={{ color: T.textDim, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Why this spell
                </div>
                <div style={{ color: T.textDim, lineHeight: 1.45 }}>{tutorialPrompt.fix}</div>
              </div>
              <div style={tutorialButtonRow}>
                <button
                  type="button"
                  style={tutorialButton}
                  onClick={(): void => {
                    if (tutorialExpectedSpellSequence !== null) {
                      handleSpellSequence(tutorialExpectedSpellSequence);
                      return;
                    }
                    handleSpellInput(tutorialPrompt.expectedSpellId);
                  }}
                >
                  Cast highlighted spell
                </button>
                <button
                  type="button"
                  style={{ ...buildControlStyle({ tone: 'ghost' }), padding: '8px 12px', fontSize: '0.8rem' }}
                  onClick={handleResumeTutorial}
                >
                  Resume
                </button>
              </div>
            </div>
          </>
        )}

        {/* Top stat bar */}
        <div style={topBar}>
          <div style={statPill}>
            <span style={statLabel}>DPS</span>
            {Math.round(dps).toLocaleString()}
          </div>
          <div style={statPill}>
            <span style={statLabel}>Time</span>
            {timerStr}
          </div>
          {isPaused && (
            <div style={statPill}>
              <span style={statLabel}>State</span>
              Paused
            </div>
          )}
          {countdownValue !== null && (
            <div style={statPill}>
              <span style={statLabel}>Pull</span>
              {formatCountdownCallout(countdownValue)}
            </div>
          )}
        </div>

        <div style={musicControls}>
          <label style={musicVolumeBar}>
            <span style={statLabel}>Music</span>
            <input
              aria-label="Music volume"
              max={100}
              min={0}
              onChange={(event): void => {
                onMusicVolumeChange?.(Number(event.target.value));
              }}
              style={musicVolumeSlider}
              type="range"
              value={musicVolume}
            />
            <span>{musicVolume}%</span>
          </label>
          <button
            type="button"
            aria-label="Next song"
            disabled={!musicControlsEnabled}
            style={nextSongBtn}
            onClick={(): void => skipToNextTrack()}
          >
            ⏭ Next Song
          </button>
        </div>

        {/* Exit button */}
        <button style={exitBtn} onClick={onExit}>
          ✕ Exit
        </button>

        {/* Debug toggle — dev only */}
        {showDebugControls && (
          <button style={debugBtn} onClick={(): void => setDebugRec((v) => !v)}>
            DBG
          </button>
        )}

        <button style={restartBtn} onClick={restart}>
          ↻ Restart
        </button>

        {canManualPause && (
          <button style={pauseBtn} onClick={togglePause}>
            {isPaused ? '▶ Resume' : '❚❚ Pause'}
          </button>
        )}

        {/* Proc style toggle */}
        <button style={procStyleBtn} onClick={(): void => setProcHighlightStyle((s) => s === 'pulse' ? 'shake' : 'pulse')}>
          PROC:{procHighlightStyle.toUpperCase()}
        </button>

        {/* Loadout button */}
        <button style={loadoutBtn} onClick={(): void => setLoadoutOpen(true)}>
          ⚙ Loadout
        </button>

        {/* Recommendation queue */}
        {showRecommendations && !tutorialActive && (
          <div style={recQueuePos}>
            <RecommendationQueue
              recommendations={recommendations}
              visible={showRecommendations}
              debug={debugRec}
              procHighlight={procHighlight}
              procHighlightStyle={procHighlightStyle}
            />
          </div>
        )}

        {/* Unit frames + resource display */}
        {snapshot && (
          <>
            <div data-testid="encounter-player-frame" style={buildHudGroupStyle(hudLayout?.playerFrame ?? { xPct: 34, yPct: 52 })}>
              <PlayerFrame
                gameState={snapshot}
                currentTime={simTime}
                profileSpec={profileSpec}
                healthOverride={challengeEnabled ? {
                  current: challenge.challenge.health,
                  max: challenge.challenge.maxHealth,
                } : undefined}
                showResources={resourcesAnchored}
              />
            </div>
            {!resourcesAnchored && (
              <div data-testid="encounter-resource-frame" style={buildHudGroupStyle(hudLayout?.resourceFrame ?? { xPct: 50, yPct: 52 })}>
                <EnergyChiDisplay gameState={snapshot} currentTime={simTime} profileSpec={profileSpec} />
              </div>
            )}
            <div data-testid="encounter-target-frame" style={buildHudGroupStyle(hudLayout?.targetFrame ?? { xPct: 66, yPct: 52 })}>
              <TargetFrame
                profileSpec={profileSpec}
                gameState={snapshot}
                totalDamage={snapshot.totalDamage}
                encounterDuration={encounterDuration}
                currentTime={simTime}
                showTargetDebuffs={showTargetDebuffs}
                debuffBlacklistSpellIds={hudSettings?.targetDebuffs.blacklistSpellIds ?? []}
              />
            </div>
          </>
        )}

        {snapshot && (
          <BuffTracker
            gameState={snapshot}
            currentTime={simTime}
            registry={buffRegistry}
            iconNameResolver={buffIconNameResolver}
            spellIdsByBuffId={specUiDefaults.buffSpellIds}
            blacklist={legacyBuffBlacklist}
            maxPerRow={12}
          />
        )}

        {snapshot && showBuffIcons && (
          <BuffTracker
            gameState={snapshot}
            currentTime={simTime}
            registry={buffRegistry}
            iconNameResolver={buffIconNameResolver}
            spellIdsByBuffId={specUiDefaults.buffSpellIds}
            blacklist={buffBlacklist}
            whitelist={hudSettings?.buffs.iconTracker.trackedEntryIds}
            maxPerRow={hudSettings?.buffs.iconTracker.iconsPerRow ?? 12}
            containerStyle={buildHudGroupStyle(hudLayout?.buffIcons)}
          />
        )}

        {snapshot && showBuffBars && (
          <div style={buildHudGroupStyle(hudLayout?.buffBars)}>
            <BuffBarTracker
              gameState={snapshot}
              currentTime={simTime}
              registry={buffRegistry}
              buffbook={buffbook}
              iconNameResolver={buffIconNameResolver}
              spellIdsByBuffId={specUiDefaults.buffSpellIds}
              blacklist={buffBlacklist}
              whitelist={hudSettings?.buffs.barTracker.trackedEntryIds}
              containerStyle={{ width: 320 }}
            />
          </div>
        )}

        {snapshot && showEssentialCooldowns && (
          <div style={buildHudGroupStyle(hudLayout?.essentialCooldowns)}>
            <CooldownManager
              gameState={snapshot}
              currentTime={simTime}
              showEssential
              showUtility={false}
              spellbook={spellbook}
              cooldownDefinitions={cooldownDefinitions}
              essentialTrackedIds={hudSettings?.cooldowns.essential.trackedEntryIds}
              essentialIconsPerRow={hudSettings?.cooldowns.essential.iconsPerRow}
              spellInputStatus={spellInputStatus}
            />
          </div>
        )}

        {snapshot && showUtilityCooldowns && (
          <div style={buildHudGroupStyle(hudLayout?.utilityCooldowns)}>
            <CooldownManager
              gameState={snapshot}
              currentTime={simTime}
              showEssential={false}
              showUtility
              spellbook={spellbook}
              cooldownDefinitions={cooldownDefinitions}
              utilityTrackedIds={hudSettings?.cooldowns.utility.trackedEntryIds}
              utilityIconsPerRow={hudSettings?.cooldowns.utility.iconsPerRow}
              spellInputStatus={spellInputStatus}
            />
          </div>
        )}

        {snapshot && showConsumables && (
          <div style={buildHudGroupStyle(hudLayout?.consumables)}>
            <ConsumableTracker
              gameState={snapshot}
              currentTime={simTime}
              trackedIds={hudSettings?.consumables.trackedEntryIds}
              iconsPerRow={hudSettings?.consumables.iconsPerRow}
            />
          </div>
        )}
      </div>

      <div style={bottomDock}>
        {/* Cast bar — fixed height slot so ActionBar never jumps */}
        <div style={castBarSlot}>
          <CastBar
            isChanneling={channelInfo.isChanneling}
            spellId={channelInfo.spellId}
            spellName={channelInfo.spellName}
            totalTime={channelInfo.totalTime}
            progress={channelInfo.progress}
            remainingTime={channelInfo.remainingTime}
            spellbook={spellbook}
          />
        </div>

      </div>

      {snapshot && renderedActionBars.filter((actionBar) => actionBar.config.enabled).map((actionBar) => (
        <div
          key={actionBar.id}
          data-testid={`encounter-action-bar-${actionBar.id}`}
          style={{
            ...buildHudGroupStyle(hudLayout?.[actionBar.layoutKey] ?? { xPct: 50, yPct: 93 }),
            zIndex: tutorialActive ? 4 : undefined,
          }}
        >
          <ActionBar
            gameState={snapshot}
            spellInputStatus={spellInputStatus}
            recommendedAbility={showRecommendations ? (recommendations[0] ?? null) : null}
            showRecommendations={showRecommendations}
            focusedSpellId={tutorialExpectedSpellId}
            dimNonFocusedSpells={tutorialActive}
            onAbilityPress={handleSpellInput}
            onAbilitySequencePress={handleSpellSequence}
            buttons={actionBar.buttons}
            totalButtons={actionBar.config.buttonCount}
            enableGlobalKeybinds={false}
            enabled={actionBar.config.enabled}
            rows={Math.max(1, Math.ceil(Math.max(1, actionBar.config.buttonCount) / actionBar.config.buttonsPerRow))}
            slotsPerRow={actionBar.config.buttonsPerRow}
            slots={actionBar.slots}
            spellbook={spellbook}
            ariaLabel={actionBar.label}
          />
        </div>
      ))}
        </div>

      {loadoutOpen && (
        <LoadoutPanel
          definition={talentDefinition}
          defaultProfile={defaultProfile}
          talents={talents}
          talentRanks={talentRanks}
          loadout={loadout}
          onTalentChange={canEditEncounterBuild ? ((nextTalents, nextTalentRanks): void => {
            updateTalents(nextTalents, nextTalentRanks);
            onTalentsChange?.(nextTalents, nextTalentRanks);
          }) : undefined}
          onLoadoutChange={canEditEncounterBuild ? ((nextLoadout): void => {
            updateLoadout(nextLoadout);
            onLoadoutChange?.(nextLoadout);
          }) : undefined}
          onClose={(): void => setLoadoutOpen(false)}
        />
      )}
    </div>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function getSpellLabel(spellId: string, spellbook: ReadonlyMap<string, { displayName?: string }>): string {
  const spell = spellbook.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId);
  if (spell?.displayName) {
    return spell.displayName;
  }

  return spellId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildHudGroupStyle(position?: { xPct: number; yPct: number; scale?: number }): CSSProperties {
  return {
    position: 'absolute',
    left: `${position?.xPct ?? 50}%`,
    top: `${position?.yPct ?? 80}%`,
    transform: `translate(-50%, -50%) scale(${position?.scale ?? 1})`,
    transformOrigin: 'center center',
    zIndex: 2,
  };
}

function buildRenderedActionBars(
  actionBarSettings: ActionBarSettings,
  actionBarSlots: readonly ActionBarSlotDef[],
): {
  id: ActionBarId;
  label: string;
  layoutKey: keyof HudLayoutSettings;
  config: ActionBarConfig;
  slots: ActionBarSlotDef[];
  buttons: { spellIds: string[]; keybind: string }[];
}[] {
  return ACTION_BAR_IDS.flatMap((actionBarId, index) => {
    const config = actionBarSettings.bars[actionBarId];
    const augmentedSlots = augmentActionBarSlots(actionBarSlots, config.buttons);
    const slotBySpellId = new Map(augmentedSlots.map((slot) => [slot.spellId, slot]));

    const buttons = config.buttons
      .slice(0, config.buttonCount)
      .flatMap((button) => {
        const spellId = resolveActionBarButtonSpellIds(button.spellIds, augmentedSlots, slotBySpellId)[0];
        const slot = spellId ? slotBySpellId.get(spellId) : undefined;
        if (!slot) {
          return [];
        }
        return [{
          spellIds: [...button.spellIds],
          keybind: button.keybind || slot.defaultKey,
        }];
      });

    const slots = buttons.flatMap((button) => {
      const spellId = resolveActionBarButtonSpellIds(button.spellIds, augmentedSlots, slotBySpellId)[0];
      const slot = spellId ? slotBySpellId.get(spellId) : undefined;
      return slot ? [slot] : [];
    });

    if (buttons.length === 0 || slots.length === 0) {
      return [];
    }

    return [{
      id: actionBarId,
        label: `Action Bar ${index + 1}`,
        layoutKey: `actionBar${index + 1}` as keyof HudLayoutSettings,
        config,
        slots,
        buttons,
      }];
  });
}

function buildEncounterInputMap(
  actionBars: {
    buttons: { spellIds: string[]; keybind: string }[];
    slots: ActionBarSlotDef[];
  }[],
  snapshot: GameStateSnapshot,
  actionBarSlots: readonly ActionBarSlotDef[],
): Record<string, string[]> {
  const slotBySpellId = new Map(actionBarSlots.map((slot) => [slot.spellId, slot]));
  const inputMap: Record<string, string[]> = {};

  const isBuffActive = (buffId: string): boolean =>
    (snapshot.buffs.get(buffId)?.expiresAt ?? 0) > snapshot.currentTime;

  actionBars.forEach((actionBar) => {
    actionBar.buttons.forEach((button) => {
      if (!button.keybind) {
        return;
      }

      const resolvedSpellIds = resolveActionBarButtonSpellIds(button.spellIds, actionBarSlots, slotBySpellId);
      const effectiveSpellIds = resolvedSpellIds.flatMap((spellId) => {
        const slot = actionBar.slots.find((candidate) => candidate.spellId === spellId)
          ?? slotBySpellId.get(spellId);
        if (!slot) {
          return [];
        }

        const overrideActive = slot.procOverride ? isBuffActive(slot.procOverride.buffId) : false;
        return [overrideActive ? (slot.procOverride?.spellId ?? slot.spellId) : slot.spellId];
      });

      if (effectiveSpellIds.length === 0) {
        return;
      }

      inputMap[button.keybind] = [...(inputMap[button.keybind] ?? []), ...effectiveSpellIds];
    });
  });

  return inputMap;
}

function findSpellSequenceForTutorial(
  actionBars: {
    buttons: { spellIds: string[]; keybind: string }[];
    slots: ActionBarSlotDef[];
  }[],
  actionBarSlots: readonly ActionBarSlotDef[],
  snapshot: GameStateSnapshot,
  expectedSpellId: string,
): string[] | null {
  const slotBySpellId = new Map(actionBarSlots.map((slot) => [slot.spellId, slot]));
  const isBuffActive = (buffId: string): boolean =>
    (snapshot.buffs.get(buffId)?.expiresAt ?? 0) > snapshot.currentTime;

  for (const actionBar of actionBars) {
    for (const button of actionBar.buttons) {
      const resolvedSpellIds = resolveActionBarButtonSpellIds(button.spellIds, actionBarSlots, slotBySpellId);
      const effectiveSpellIds = resolvedSpellIds.flatMap((spellId) => {
        const slot = actionBar.slots.find((candidate) => candidate.spellId === spellId)
          ?? slotBySpellId.get(spellId);
        if (!slot) {
          return [];
        }

        const overrideActive = slot.procOverride ? isBuffActive(slot.procOverride.buffId) : false;
        return [overrideActive ? (slot.procOverride?.spellId ?? slot.spellId) : slot.spellId];
      });

      if (effectiveSpellIds.includes(expectedSpellId)) {
        return effectiveSpellIds;
      }
    }
  }

  return null;
}

function CountdownOverlay({ countdownValue }: { countdownValue: CountdownValue }): React.ReactElement {
  const countdownText = formatCountdownOverlayLabel(countdownValue);
  const isGoPhase = countdownValue === 'go';
  const overlay: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,6,10,0.42)',
    backdropFilter: 'blur(3px)',
    pointerEvents: 'none',
  };

  return (
    <div style={overlay}>
      <style>
        {`
          @keyframes encounter-countdown-pop {
            0% { opacity: 0; transform: scale(0.58); }
            18% { opacity: 1; }
            70% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(1.22); }
          }
        `}
      </style>
      <div
        key={countdownText}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          animation: 'encounter-countdown-pop 0.7s ease-out forwards',
        }}
      >
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: '6rem',
            color: isGoPhase ? T.gradeA : T.textBright,
            textShadow: `0 0 30px ${isGoPhase ? T.gradeA : T.accent}`,
          }}
        >
          {countdownText}
        </div>
        <div
          style={{
            fontFamily: FONTS.ui,
            fontSize: '0.95rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: T.text,
          }}
        >
          {isGoPhase ? 'Fight!' : 'Get ready'}
        </div>
      </div>
    </div>
  );
}

function formatCountdownCallout(countdownValue: CountdownValue): string {
  if (countdownValue === 'go') {
    return 'GO!';
  }

  return `In ${countdownValue}`;
}

function formatCountdownOverlayLabel(countdownValue: CountdownValue): string {
  if (countdownValue === 'go') {
    return 'GO!';
  }

  return `${countdownValue}`;
}

// ---------------------------------------------------------------------------
// Analysis Review Screen (lazy-loads EndScreen)
// ---------------------------------------------------------------------------

export interface AnalysisReviewScreenProps {
  mode: TrainerMode;
  duration: number;
  endReason: string | null;
  report: RunAnalysisReport;
  onRestart: () => void;
  onExit: () => void;
  heading?: string;
  restartLabel?: string;
  exitLabel?: string;
}

export function AnalysisReviewScreen({
  mode,
  duration,
  endReason,
  report,
  onRestart,
  onExit,
  heading = 'Run Analysis',
  restartLabel = 'Start New Encounter',
  exitLabel = 'Back to History',
}: AnalysisReviewScreenProps): React.ReactElement {
  return (
    <React.Suspense
      fallback={
        <div style={{ width: '100%', height: '100dvh', display: 'grid', placeItems: 'center', background: T.bg, color: T.textDim }}>
          Loading analysis...
        </div>
      }
    >
      <LazyEndScreen
        dps={report.score.playerDps}
        totalDamage={report.score.playerTotalDamage}
        duration={duration}
        profileSpec={getProfileSpecForAnalysisSpecId(report.benchmarkSignature.specId)}
        mode={mode}
        analysisStatus="ready"
        analysisReport={report}
        analysisError={null}
        endReason={endReason}
        onRestart={onRestart}
        onExit={onExit}
        heading={heading}
        restartLabel={restartLabel}
        exitLabel={exitLabel}
      />
    </React.Suspense>
  );
}
