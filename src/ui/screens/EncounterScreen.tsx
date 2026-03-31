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
import { WW_ACTION_BAR, type ActionBarSlotDef } from '@ui/components/ActionBar';
import { MONK_BUFF_REGISTRY, resolveMonkBuffIconName } from '@core/class_modules/monk/monk_buff_registry';
import { MONK_WINDWALKER_TALENT_LOADOUT } from '@core/data/talentStringDecoder';
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
import { TRACKED_BUFF_SPELL_IDS, buildTrackerBlacklist } from '@ui/components/trackerSpellIds';
import { LoadoutPanel } from './LoadoutPanel';
import { normalizeKey, normalizeMouseButton, normalizeMouseWheel } from '@ui/utils/keyUtils';
import { useChallengeMode } from '@ui/challenge/useChallengeMode';
import type { RunAnalysisReport } from '@core/analysis';
import { usePostRunAnalysis } from '@ui/analysis/usePostRunAnalysis';
import { useEncounterMusic } from '@ui/audio/useEncounterMusic';
import { FIXED_SCENE_HEIGHT, FIXED_SCENE_WIDTH, useFixedSceneScale } from '@ui/utils/layoutScaling';

const LazyEndScreen = React.lazy(() => import('./EndScreen'));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EncounterScreenProps {
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
    pause,
    resume,
    togglePause,
    restart,
    finishEncounterEarly,
  } = useSimulation({
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
  const buffBlacklist = buildTrackerBlacklist(TRACKED_BUFF_SPELL_IDS, [...new Set(combinedBuffBlacklistSpellIds)]);
  const hudLayout = hudSettings?.layout;
  const actionBarConfigs = actionBarSettings ?? getDefaultTrainerSettings().actionBars;
  const renderedActionBars = useMemo(
    () => (snapshot ? buildRenderedActionBars(actionBarConfigs) : []),
    [actionBarConfigs, snapshot],
  );
  const encounterInputMap = useMemo(
    () => (snapshot ? buildEncounterInputMap(renderedActionBars, snapshot) : {}),
    [renderedActionBars, snapshot],
  );
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
        spellIds.forEach((spellId) => {
          injectInput(spellId);
        });
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
      spellIds.forEach((spellId) => {
        injectInput(spellId);
      });
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
      spellIds.forEach((spellId) => {
        injectInput(spellId);
      });
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
    injectInput,
    loadoutOpen,
    restart,
    skipToNextTrack,
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
    specId: 'monk_windwalker',
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
        {showRecommendations && (
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
                healthOverride={challengeEnabled ? {
                  current: challenge.challenge.health,
                  max: challenge.challenge.maxHealth,
                } : undefined}
                showResources={resourcesAnchored}
              />
            </div>
            {!resourcesAnchored && (
              <div data-testid="encounter-resource-frame" style={buildHudGroupStyle(hudLayout?.resourceFrame ?? { xPct: 50, yPct: 52 })}>
                <EnergyChiDisplay gameState={snapshot} currentTime={simTime} />
              </div>
            )}
            <div data-testid="encounter-target-frame" style={buildHudGroupStyle(hudLayout?.targetFrame ?? { xPct: 66, yPct: 52 })}>
              <TargetFrame
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
            registry={MONK_BUFF_REGISTRY}
            iconNameResolver={resolveMonkBuffIconName}
            blacklist={legacyBuffBlacklist}
            maxPerRow={12}
          />
        )}

        {snapshot && showBuffIcons && (
          <BuffTracker
            gameState={snapshot}
            currentTime={simTime}
            registry={MONK_BUFF_REGISTRY}
            iconNameResolver={resolveMonkBuffIconName}
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
          />
        </div>

      </div>

      {snapshot && renderedActionBars.filter((actionBar) => actionBar.config.enabled).map((actionBar) => (
        <div
          key={actionBar.id}
          data-testid={`encounter-action-bar-${actionBar.id}`}
          style={buildHudGroupStyle(hudLayout?.[actionBar.layoutKey] ?? { xPct: 50, yPct: 93 })}
        >
          <ActionBar
            gameState={snapshot}
            spellInputStatus={spellInputStatus}
            recommendedAbility={showRecommendations ? (recommendations[0] ?? null) : null}
            showRecommendations={showRecommendations}
            onAbilityPress={injectInput}
            buttons={actionBar.buttons}
            totalButtons={actionBar.config.buttonCount}
            enableGlobalKeybinds={false}
            enabled={actionBar.config.enabled}
            rows={Math.max(1, Math.ceil(Math.max(1, actionBar.config.buttonCount) / actionBar.config.buttonsPerRow))}
            slotsPerRow={actionBar.config.buttonsPerRow}
            slots={actionBar.slots}
            ariaLabel={actionBar.label}
          />
        </div>
      ))}
        </div>

      {loadoutOpen && (
        <LoadoutPanel
          definition={MONK_WINDWALKER_TALENT_LOADOUT}
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

function buildRenderedActionBars(actionBarSettings: ActionBarSettings): {
  id: ActionBarId;
  label: string;
  layoutKey: keyof HudLayoutSettings;
  config: ActionBarConfig;
  slots: ActionBarSlotDef[];
  buttons: { spellIds: string[]; keybind: string }[];
}[] {
  const slotBySpellId = new Map(WW_ACTION_BAR.map((slot) => [slot.spellId, slot]));

  return ACTION_BAR_IDS.flatMap((actionBarId, index) => {
    const config = actionBarSettings.bars[actionBarId];

    const buttons = config.buttons
      .slice(0, config.buttonCount)
      .flatMap((button) => {
        const spellId = button.spellIds[0];
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
      const spellId = button.spellIds[0];
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
): Record<string, string[]> {
  const slotBySpellId = new Map(WW_ACTION_BAR.map((slot) => [slot.spellId, slot]));
  const inputMap: Record<string, string[]> = {};

  const isBuffActive = (buffId: string): boolean =>
    (snapshot.buffs.get(buffId)?.expiresAt ?? 0) > snapshot.currentTime;

  actionBars.forEach((actionBar) => {
    actionBar.buttons.forEach((button) => {
      if (!button.keybind) {
        return;
      }

      const effectiveSpellIds = button.spellIds.flatMap((spellId) => {
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
