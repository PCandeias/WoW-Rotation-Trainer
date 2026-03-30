import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { T, FONTS } from '@ui/theme/elvui';
import { buildControlStyle, buildHudFrameStyle, buildPanelStyle } from '@ui/theme/stylePrimitives';
import { AbilityIcon } from '@ui/components/AbilityIcon';
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
import { SPELL_ICONS, WW_ACTION_BAR, type ActionBarSlotDef } from '@ui/components/ActionBar';
import { MONK_BUFF_REGISTRY, resolveMonkBuffIconName } from '@core/class_modules/monk/monk_buff_registry';
import { MONK_WINDWALKER_TALENT_LOADOUT } from '@core/data/talentStringDecoder';
import { MONK_WW_SPELLS } from '@core/data/spells/monk_windwalker';
import { useSimulation, type CountdownValue } from '@ui/sim/useSimulation';
import type { CharacterLoadout } from '@core/data/loadout';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';
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
    disappearSpeedMultiplier: challengeSettings?.disappearSpeedMultiplier ?? 1,
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

  // Training dummy placeholder
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
      <EndScreen
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
    );
  }

  return (
    <div style={root}>
      {/* Main play area */}
      <div style={playArea}>
        <div style={encounterStage}>
        {showEnemyIcon && (
          <div data-testid="encounter-enemy-icon" style={buildHudGroupStyle(hudLayout?.enemyIcon ?? { xPct: 50, yPct: 30 })}>
            <div style={dummyArea}>🪆</div>
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

        {/* Debug toggle */}
        <button style={debugBtn} onClick={(): void => setDebugRec((v) => !v)}>
          DBG
        </button>

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
// End Screen
// ---------------------------------------------------------------------------

interface EndScreenProps {
  dps: number;
  totalDamage: number;
  duration: number;
  mode: TrainerMode;
  analysisStatus: 'idle' | 'loading' | 'ready' | 'error';
  analysisReport: RunAnalysisReport | null;
  analysisError: string | null;
  endReason: string | null;
  onRestart: () => void;
  onExit: () => void;
  heading?: string;
  restartLabel?: string;
  exitLabel?: string;
}

const ANALYSIS_SERIES = {
  player: '#17d4ff',
  trainer: '#ffb84d',
  playerChi: '#1fd58f',
  trainerChi: '#ffd166',
  playerEnergy: '#ff6b6b',
  trainerEnergy: '#8ea2ff',
};

function gradeForRatio(ratio: number): { label: string; color: string } {
  if (ratio >= 0.97) return { label: 'S', color: T.gradeS };
  if (ratio >= 0.9) return { label: 'A', color: T.gradeA };
  if (ratio >= 0.8) return { label: 'B', color: T.gradeB };
  if (ratio >= 0.7) return { label: 'C', color: T.gradeC };
  return { label: 'D', color: T.gradeD };
}

function gradeForDps(dps: number): { label: string; color: string } {
  if (dps >= 120_000) return { label: 'S', color: T.gradeS };
  if (dps >= 90_000) return { label: 'A', color: T.gradeA };
  if (dps >= 65_000) return { label: 'B', color: T.gradeB };
  if (dps >= 40_000) return { label: 'C', color: T.gradeC };
  return { label: 'D', color: T.gradeD };
}

function EndScreen({
  dps,
  totalDamage,
  duration,
  mode,
  analysisStatus,
  analysisReport,
  analysisError,
  endReason,
  onRestart,
  onExit,
  heading = 'Encounter Complete',
  restartLabel = 'Run Again',
  exitLabel = 'Back to Setup',
}: EndScreenProps): React.ReactElement {
  const trainerRatio = analysisReport?.score.trainerDpsRatio ?? 0;
  const summaryDps = analysisStatus === 'ready' && analysisReport ? analysisReport.score.playerDps : dps;
  const summaryTotalDamage = analysisStatus === 'ready' && analysisReport ? analysisReport.score.playerTotalDamage : totalDamage;
  const { label, color } = analysisStatus === 'ready'
    ? gradeForRatio(analysisReport?.score.trainerDpsRatio ?? 0)
    : gradeForDps(summaryDps);
  const failedChallenge = endReason === 'challenge_failure';

  const overlay: CSSProperties = {
    width: '100%',
    height: '100dvh',
    background: `radial-gradient(circle at top, rgba(96, 122, 168, 0.16), transparent 28%), ${T.bg}`,
    padding: 12,
    boxSizing: 'border-box',
    overflowX: 'hidden',
    overflowY: 'hidden',
  };

  const shell: CSSProperties = {
    width: 'min(1880px, 100%)',
    height: 'calc(100dvh - 24px)',
    margin: '0 auto',
    display: 'grid',
    gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
    gap: 12,
    minHeight: 0,
  };

  const hero: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(280px, 0.9fr) minmax(0, 1.5fr)',
    gap: 14,
    alignItems: 'center',
    minHeight: 0,
  };

  const gradeStyle: CSSProperties = {
    fontSize: '4.5rem',
    fontFamily: FONTS.display,
    color,
    textShadow: `0 0 30px ${color}88`,
    lineHeight: 1,
  };

  const stats: CSSProperties = {
    display: 'flex',
    gap: 18,
    flexWrap: 'wrap',
    fontFamily: FONTS.ui,
    fontSize: '0.9rem',
    color: T.text,
  };

  const benchmarkStrip: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
    alignItems: 'stretch',
  };

  const benchmarkItem: CSSProperties = {
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    padding: '10px 12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    display: 'grid',
    gap: 6,
    minWidth: 0,
  };

  const statItem: CSSProperties = {
    textAlign: 'center',
  };

  const statValue: CSSProperties = {
    fontSize: '1.4rem',
    color: T.textBright,
    display: 'block',
    marginBottom: 4,
  };

  const statLbl: CSSProperties = {
    fontSize: '0.7rem',
    color: T.textDim,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };

  const btnRow: CSSProperties = {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
  };

  const reportGrid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(380px, 0.92fr)',
    gridTemplateRows: 'minmax(0, 0.82fr) minmax(0, 1.08fr) minmax(0, 0.9fr)',
    gap: 12,
    minHeight: 0,
    overflow: 'hidden',
  };

  const btnBase: CSSProperties = {
    ...buildControlStyle({ tone: 'secondary' }),
    fontSize: '0.85rem',
    padding: '10px 24px',
  };

  const btnPrimary: CSSProperties = {
    ...btnBase,
    ...buildControlStyle({ tone: 'primary' }),
  };

  const btnSecondary: CSSProperties = {
    ...btnBase,
    ...buildControlStyle({ tone: 'ghost' }),
    color: T.textDim,
  };

  const title: CSSProperties = {
    fontFamily: FONTS.display,
    fontSize: '1.5rem',
    color: T.textBright,
    margin: 0,
  };

  return (
    <div style={overlay}>
      <div style={shell}>
        <div style={{ display: 'grid', gap: 6 }}>
          <h2 style={title}>{heading}</h2>
          {failedChallenge && heading === 'Encounter Complete' && (
            <div style={{ color: T.red, fontFamily: FONTS.ui, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Challenge Failed
            </div>
          )}
        </div>

        <div style={hero}>
          {usesCompetitiveTrainerRules(mode) && <div style={gradeStyle}>{label}</div>}
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Benchmark Score
            </div>
            <div style={{ color: T.textBright, fontSize: '1.2rem' }}>
              {analysisStatus === 'ready'
                ? `${Math.round(trainerRatio * 100)}% of trainer DPS`
                : 'Preparing trainer comparison'}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={benchmarkStrip}>
              <div style={benchmarkItem}>
                <span style={statLbl}>Your DPS</span>
                <span style={{ ...statValue, marginBottom: 0 }}>{Math.round(summaryDps).toLocaleString()}</span>
              </div>
              <div style={benchmarkItem}>
                <span style={statLbl}>Trainer DPS</span>
                <span style={{ ...statValue, marginBottom: 0 }}>
                  {analysisStatus === 'ready' && analysisReport
                    ? Math.round(analysisReport.score.trainerDps).toLocaleString()
                    : '...'}
                </span>
              </div>
              <div style={benchmarkItem}>
                <span style={statLbl}>Current Gap</span>
                <span style={{ ...statValue, marginBottom: 0, fontSize: '1.25rem' }}>
                  {analysisStatus === 'ready' && analysisReport
                    ? formatDpsGap(analysisReport.score.trainerDps, analysisReport.score.playerDps)
                    : 'Preparing benchmark'}
                </span>
              </div>
            </div>
            <div style={stats}>
              <div style={statItem}>
                <span style={statValue}>{(summaryTotalDamage / 1_000_000).toFixed(2)}M</span>
                <span style={statLbl}>Total Damage</span>
              </div>
              <div style={statItem}>
                <span style={statValue}>{duration}s</span>
                <span style={statLbl}>Duration</span>
              </div>
              <div style={statItem}>
                <span style={statValue}>
                  {analysisStatus === 'ready' ? `${Math.round(trainerRatio * 100)}%` : '...'}
                </span>
                <span style={statLbl}>Vs Trainer</span>
              </div>
            </div>
          </div>
        </div>

        <div style={reportGrid}>
          <ReportCard
            title="Damage Over Time"
            subtitle="See where your live DPS pace drifted away from the trainer."
            bodyOverflow="auto"
            style={{ gridColumn: '1', gridRow: '1' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport ? <AnalysisLineChart data={analysisReport.charts.damageOverTime} yFormatter={formatCompactNumber} /> : null,
              'Loading trainer comparison...',
            )}
          />
          <ReportCard
            title="Cumulative Damage"
            subtitle="The total gap makes missed burst windows easier to spot."
            bodyOverflow="auto"
            style={{ gridColumn: '2', gridRow: '1' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport
                ? (
                  <AnalysisLineChart
                    data={analysisReport.charts.cumulativeDamage}
                    yFormatter={formatCompactNumber}
                    lineType="linear"
                  />
                )
                : null,
              'Loading trainer comparison...',
            )}
          />
          <ReportCard
            title="Spell Timeline"
            subtitle="Cast-by-cast comparison across the encounter, using the same timeline style as the validation report."
            bodyOverflow="auto"
            style={{ gridColumn: '1 / span 2', gridRow: '2' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport ? <SpellTimeline data={analysisReport.charts.spellTimeline} encounterDuration={duration} /> : null,
              'Loading spell timeline...',
            )}
          />
          <ReportCard
            title="Exact Mistakes"
            subtitle="Check what your state was, what you pressed, what the trainer/APL would have pressed in that same spot, and why."
            bodyOverflow="auto"
            style={{ gridColumn: '3', gridRow: '1 / span 2' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport ? <ExactMistakesPanel mistakes={analysisReport.exactMistakes} /> : null,
              'Loading precise decision review...',
            )}
          />
          <ReportCard
            title="Resource Waste"
            subtitle="Track Chi and Energy waste separately so overcaps are easier to spot."
            bodyOverflow="auto"
            style={{ gridColumn: '1 / span 2', gridRow: '3' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport ? <ResourceWasteChart data={analysisReport.charts.resourceWaste} /> : null,
              'Loading resource comparison...',
            )}
          />
          <ReportCard
            title="Improvement Notes"
            subtitle="Start with the biggest damage losses first."
            bodyOverflow="auto"
            style={{ gridColumn: '3', gridRow: '3' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport ? <ImprovementNotes findings={analysisReport.findings} /> : null,
              usesCompetitiveTrainerRules(mode)
                ? 'Loading trainer-backed coaching...'
                : 'Loading practice coaching...',
            )}
          />
        </div>

        <div style={btnRow}>
          <button style={btnPrimary} onClick={onRestart}>
            {restartLabel}
          </button>
          <button style={btnSecondary} onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    <EndScreen
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
  );
}

function ReportCard({
  title,
  subtitle,
  body,
  bodyOverflow = 'auto',
  style,
}: {
  title: string;
  subtitle?: string;
  body: React.ReactNode;
  bodyOverflow?: CSSProperties['overflow'];
  style?: CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        ...buildPanelStyle({ elevated: true, density: 'compact' }),
        borderRadius: 18,
        padding: '16px 18px',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          color: T.textBright,
          fontFamily: FONTS.display,
          fontSize: '1.05rem',
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div style={{ color: T.textDim, fontSize: '0.78rem', lineHeight: 1.4, marginBottom: 12 }}>
          {subtitle}
        </div>
      )}
      <div style={{ color: T.textDim, lineHeight: 1.5, flex: 1, minHeight: 0, overflow: bodyOverflow }}>
        {body}
      </div>
    </div>
  );
}

function renderAnalysisState(
  status: EndScreenProps['analysisStatus'],
  error: string | null,
  readyBody: React.ReactNode,
  loadingMessage: string,
): React.ReactNode {
  if (status === 'error') {
    return <div>{error ?? 'Analysis could not be generated.'}</div>;
  }

  if (status !== 'ready') {
    return <div>{loadingMessage}</div>;
  }

  return readyBody;
}

function AnalysisLineChart({
  data,
  yFormatter,
  lineType = 'monotone',
}: {
  data: RunAnalysisReport['charts']['damageOverTime'];
  yFormatter: (value: number) => string;
  lineType?: 'monotone' | 'linear';
}): React.ReactElement {
  const axisTick = { fill: T.textDim, fontSize: 11, fontFamily: FONTS.body };
  const chartTooltipStyle = {
    backgroundColor: T.bgPanelRaised,
    borderColor: T.borderBright,
    color: T.textBright,
    borderRadius: 12,
    boxShadow: T.shadow,
  };

  const chart = (
    <LineChart data={data} width={520} height={220}>
      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="2 6" vertical={false} />
      <XAxis dataKey="time" stroke={T.textMuted} tick={axisTick} tickLine={false} axisLine={false} />
      <YAxis stroke={T.textMuted} tick={axisTick} tickFormatter={yFormatter} width={52} tickLine={false} axisLine={false} />
      <Tooltip
        formatter={(value: number) => yFormatter(value)}
        labelFormatter={(value) => `${value}s`}
        contentStyle={chartTooltipStyle}
      />
      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
      <Line type={lineType} dataKey="player" name="You" stroke={ANALYSIS_SERIES.player} dot={false} strokeWidth={2.75} />
      <Line type={lineType} dataKey="trainer" name="Trainer" stroke={ANALYSIS_SERIES.trainer} strokeDasharray="7 4" dot={false} strokeWidth={2.5} />
    </LineChart>
  );

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 220 }}>
      {typeof ResizeObserver === 'undefined'
        ? chart
        : (
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        )}
    </div>
  );
}

function ResourceWasteChart({ data }: { data: RunAnalysisReport['charts']['resourceWaste'] }): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 14,
      }}
    >
      <ResourceWastePanel
        title="Chi Waste"
        data={data}
        playerKey="playerChi"
        trainerKey="trainerChi"
        playerColor={ANALYSIS_SERIES.playerChi}
        trainerColor={ANALYSIS_SERIES.trainerChi}
      />
      <ResourceWastePanel
        title="Energy Waste"
        data={data}
        playerKey="playerEnergy"
        trainerKey="trainerEnergy"
        playerColor={ANALYSIS_SERIES.playerEnergy}
        trainerColor={ANALYSIS_SERIES.trainerEnergy}
      />
    </div>
  );
}

function ResourceWastePanel({
  title,
  data,
  playerKey,
  trainerKey,
  playerColor,
  trainerColor,
}: {
  title: string;
  data: RunAnalysisReport['charts']['resourceWaste'];
  playerKey: 'playerChi' | 'playerEnergy';
  trainerKey: 'trainerChi' | 'trainerEnergy';
  playerColor: string;
  trainerColor: string;
}): React.ReactElement {
  const chartTooltipStyle = {
    backgroundColor: T.bgPanelRaised,
    borderColor: T.borderBright,
    color: T.textBright,
    borderRadius: 12,
    boxShadow: T.shadow,
  };
  const chart = (
    <LineChart data={data} width={260} height={220}>
      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="2 6" vertical={false} />
      <XAxis dataKey="time" stroke={T.textMuted} tick={{ fill: T.textDim, fontSize: 11, fontFamily: FONTS.body }} tickLine={false} axisLine={false} />
      <YAxis stroke={playerColor} tick={{ fill: playerColor, fontSize: 11, fontFamily: FONTS.body }} width={40} tickLine={false} axisLine={false} />
      <Tooltip labelFormatter={(value) => `${value}s`} contentStyle={chartTooltipStyle} />
      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
      <Line type="monotone" dataKey={playerKey} name="You" stroke={playerColor} dot={false} strokeWidth={2.5} />
      <Line type="monotone" dataKey={trainerKey} name="Trainer" stroke={trainerColor} strokeDasharray="7 4" dot={false} strokeWidth={2} />
    </LineChart>
  );

  return (
    <div style={{ minWidth: 0, height: '100%', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 10 }}>
      <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '0.92rem' }}>{title}</div>
      <div style={{ width: '100%', height: '100%', minHeight: 210 }}>
        {typeof ResizeObserver === 'undefined'
          ? chart
          : (
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          )}
      </div>
    </div>
  );
}

function SpellTimeline({
  data,
  encounterDuration,
}: {
  data: RunAnalysisReport['charts']['spellTimeline'];
  encounterDuration: number;
}): React.ReactElement {
  if (data.player.length === 0 && data.trainer.length === 0) {
    return <div>No cast timeline is available for this encounter.</div>;
  }

  const tickStep = encounterDuration <= 30 ? 5 : encounterDuration <= 90 ? 10 : 15;
  const tickTimes = Array.from({ length: Math.floor(encounterDuration / tickStep) + 1 }, (_, index) => Math.min(encounterDuration, index * tickStep));
  const playerLane = buildSpellTimelineLane(data.player, encounterDuration);
  const trainerLane = buildSpellTimelineLane(data.trainer, encounterDuration);
  const timelineWidth = Math.max(960, Math.round(encounterDuration * 28));
  const labelColumnWidth = 68;

  return (
    <div style={{ display: 'grid', gap: 12, minHeight: 0, height: '100%', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
      <div style={{ color: T.textDim, fontSize: '0.76rem' }}>
        Scroll horizontally to inspect the full encounter timeline.
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', minHeight: 0, paddingBottom: 4 }}>
        <div style={{ display: 'grid', gap: 12, minWidth: labelColumnWidth + 12 + timelineWidth }}>
          <SpellTimelineLane
            label="You"
            lane={playerLane}
            encounterDuration={encounterDuration}
            accent={ANALYSIS_SERIES.player}
            timelineWidth={timelineWidth}
            labelColumnWidth={labelColumnWidth}
          />
          <SpellTimelineLane
            label="Trainer"
            lane={trainerLane}
            encounterDuration={encounterDuration}
            accent={ANALYSIS_SERIES.trainer}
            timelineWidth={timelineWidth}
            labelColumnWidth={labelColumnWidth}
          />
          <div style={{ display: 'grid', gridTemplateColumns: `${labelColumnWidth}px ${timelineWidth}px`, gap: 12 }}>
            <div />
            <div style={{ position: 'relative', height: 18 }}>
              {tickTimes.map((time) => (
                <div
                  key={`tick-${time}`}
                  style={{
                    position: 'absolute',
                    left: `${Math.max(0, Math.min(100, (time / Math.max(1, encounterDuration)) * 100))}%`,
                    transform: 'translateX(-50%)',
                    color: T.textDim,
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {time}s
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImprovementNotes({ findings }: { findings: RunAnalysisReport['findings'] }): React.ReactElement {
  if (findings.length === 0) {
    return <div>Your run stayed close to the trainer benchmark. Nice work.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {findings.map((finding) => (
        <div
          key={finding.id}
          style={{
            border: `1px solid ${T.border}`,
            borderLeft: `4px solid ${severityColor(finding.severity)}`,
            borderRadius: 10,
            padding: '10px 12px',
            backgroundColor: 'rgba(255,255,255,0.02)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {finding.focusSpellId && <SpellBadge spellId={finding.focusSpellId} compact />}
              <div style={{ color: T.textBright, fontSize: '0.84rem' }}>{finding.title}</div>
            </div>
            <ImpactBadge value={finding.estimatedDpsLoss} severity={finding.severity} />
          </div>
          {finding.comparisonSpellId && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: T.textDim, fontSize: '0.76rem' }}>Common mismatch:</span>
              <SpellBadge spellId={finding.comparisonSpellId} compact />
              {finding.focusSpellId && (
                <>
                  <span style={{ color: T.textDim, fontSize: '0.76rem' }}>instead of</span>
                  <SpellBadge spellId={finding.focusSpellId} compact />
                </>
              )}
            </div>
          )}
          <div>{finding.summary}</div>
          <div style={{ color: T.textDim, fontSize: '0.78rem', marginTop: 2 }}>
            Fix: {finding.fix} {finding.estimatedDpsLoss > 0 ? `(~${finding.estimatedDpsLoss.toLocaleString()} DPS)` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExactMistakesPanel({ mistakes }: { mistakes: RunAnalysisReport['exactMistakes'] }): React.ReactElement {
  if (mistakes.length === 0) {
    return <div>No clear off-priority mistakes stood out against your own moment-to-moment state.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {mistakes.map((mistake) => (
        <div
          key={mistake.id}
          style={{
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: '10px 12px',
            backgroundColor: 'rgba(255,255,255,0.02)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ color: T.textBright, fontSize: '0.84rem' }}>{mistake.title}</div>
            <div style={{ color: T.textDim, fontSize: '0.76rem' }}>{mistake.time.toFixed(1)}s</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <SpellDecisionBadge
              label="You pressed"
              spellId={mistake.playerSpellId}
              emptyLabel="No timely cast"
              tone="actual"
            />
            <span style={{ color: T.textDim, fontSize: '0.76rem' }}>→</span>
            <SpellDecisionBadge label="Best button" spellId={mistake.expectedSpellId} tone="expected" />
          </div>
          <div>{mistake.summary}</div>
          <div
            style={{
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.02)',
              padding: '8px 10px',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ color: T.textDim, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Your state
            </div>
            <DecisionStatePanel state={mistake.playerState} />
          </div>
          <div style={{ color: T.textDim, fontSize: '0.78rem' }}>
            Fix: {mistake.fix}
          </div>
        </div>
      ))}
    </div>
  );
}

function SpellTimelineLane({
  label,
  lane,
  encounterDuration,
  accent,
  timelineWidth,
  labelColumnWidth,
}: {
  label: string;
  lane: { placements: { spellId: string; time: number; level: number }[]; levelCount: number; count: number };
  encounterDuration: number;
  accent: string;
  timelineWidth: number;
  labelColumnWidth: number;
}): React.ReactElement {
  const trackHeight = Math.max(52, lane.levelCount * 34 + 18);
  const tickStep = encounterDuration <= 30 ? 5 : encounterDuration <= 90 ? 10 : 15;
  const tickTimes = Array.from({ length: Math.floor(encounterDuration / tickStep) + 1 }, (_, index) => Math.min(encounterDuration, index * tickStep));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${labelColumnWidth}px ${timelineWidth}px`, gap: 12 }}>
      <div style={{ display: 'grid', gap: 4, alignContent: 'start', paddingTop: 6 }}>
        <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '0.9rem' }}>{label}</div>
        <div style={{ color: T.textDim, fontSize: '0.72rem' }}>{lane.count} casts</div>
      </div>
      <div
        style={{
          position: 'relative',
          height: trackHeight,
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          backgroundColor: 'rgba(255,255,255,0.03)',
          overflow: 'hidden',
        }}
      >
        {tickTimes.map((time) => (
          <div
            key={`${label}-grid-${time}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${Math.max(0, Math.min(100, (time / Math.max(1, encounterDuration)) * 100))}%`,
              width: 1,
              backgroundColor: 'rgba(255,255,255,0.06)',
            }}
          />
        ))}
        {lane.placements.map((entry, index) => {
          const presentation = getSpellPresentation(entry.spellId);
          return (
            <div
              key={`${label}-${entry.spellId}-${entry.time.toFixed(2)}-${index}`}
              title={`${presentation.label} • ${entry.time.toFixed(1)}s`}
              style={{
                position: 'absolute',
                left: `${Math.max(0, Math.min(100, (entry.time / Math.max(1, encounterDuration)) * 100))}%`,
                top: 8 + entry.level * 34,
                transform: 'translateX(-50%)',
                width: 28,
                height: 28,
                borderRadius: 8,
                border: `1px solid ${accent}66`,
                backgroundColor: 'rgba(10, 16, 30, 0.92)',
                boxShadow: `0 0 12px ${accent}44`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <AbilityIcon
                iconName={presentation.iconName}
                emoji={presentation.emoji}
                size={22}
                alt={presentation.label}
                style={{ borderRadius: 6 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildSpellTimelineLane(
  casts: RunAnalysisReport['charts']['spellTimeline']['player'],
  encounterDuration: number,
): {
  placements: { spellId: string; time: number; level: number }[];
  levelCount: number;
  count: number;
} {
  const sortedCasts = [...casts].sort((left, right) => left.time - right.time);
  const levelLastTimes: number[] = [];
  const minimumGap = Math.max(0.9, Math.min(2, encounterDuration / 55));
  const placements = sortedCasts.map((cast) => {
    let level = levelLastTimes.findIndex((lastTime) => cast.time - lastTime >= minimumGap);
    if (level === -1) {
      level = levelLastTimes.length;
      levelLastTimes.push(cast.time);
    } else {
      levelLastTimes[level] = cast.time;
    }

    return {
      spellId: cast.spellId,
      time: cast.time,
      level,
    };
  });

  return {
    placements,
    levelCount: Math.max(1, levelLastTimes.length),
    count: sortedCasts.length,
  };
}

function ImpactBadge({
  value,
  severity,
}: {
  value: number;
  severity: RunAnalysisReport['findings'][number]['severity'];
}): React.ReactElement {
  return (
    <div
      style={{
        color: severity === 'major' ? T.red : severity === 'medium' ? T.gold : T.textDim,
        border: `1px solid ${severityColor(severity)}55`,
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: '0.72rem',
        whiteSpace: 'nowrap',
      }}
    >
      {value > 0 ? `~${value.toLocaleString()} DPS` : 'Low impact'}
    </div>
  );
}

function getSpellPresentation(spellId: string | null | undefined): {
  label: string;
  iconName?: string;
  emoji: string;
} {
  if (!spellId) {
    return {
      label: 'No timely cast',
      iconName: 'inv_misc_questionmark',
      emoji: '…',
    };
  }

  const spell = MONK_WW_SPELLS.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId);
  const icon = SPELL_ICONS[spellId] ?? { iconName: 'inv_misc_questionmark', emoji: '❔' };
  return {
    label: spell?.displayName ?? titleCaseSpellId(spellId),
    iconName: icon.iconName,
    emoji: icon.emoji,
  };
}

function SpellBadge({
  spellId,
  compact = false,
}: {
  spellId: string;
  compact?: boolean;
}): React.ReactElement {
  const presentation = getSpellPresentation(spellId);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <AbilityIcon
        iconName={presentation.iconName}
        emoji={presentation.emoji}
        size={compact ? 22 : 26}
        alt={presentation.label}
        style={{ borderRadius: 6, boxShadow: '0 0 12px rgba(0,0,0,0.35)' }}
      />
      <span style={{ color: T.textBright, fontSize: compact ? '0.76rem' : '0.8rem' }}>{presentation.label}</span>
    </div>
  );
}

function SpellDecisionBadge({
  label,
  spellId,
  emptyLabel,
  tone,
}: {
  label: string;
  spellId: string | null;
  emptyLabel?: string;
  tone: 'actual' | 'expected';
}): React.ReactElement {
  const presentation = getSpellPresentation(spellId);
  const borderColor = tone === 'expected' ? `${T.accent}88` : `${T.red}66`;
  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        backgroundColor: tone === 'expected' ? 'rgba(0,204,122,0.08)' : 'rgba(255,51,51,0.08)',
        borderRadius: 10,
        padding: '8px 10px',
        display: 'grid',
        gap: 6,
        minWidth: 180,
      }}
    >
      <div style={{ color: T.textDim, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AbilityIcon
          iconName={presentation.iconName}
          emoji={presentation.emoji}
          size={28}
          alt={spellId ? presentation.label : emptyLabel ?? presentation.label}
          style={{ borderRadius: 7 }}
        />
        <div style={{ color: T.textBright, fontSize: '0.82rem' }}>
          {spellId ? presentation.label : emptyLabel ?? presentation.label}
        </div>
      </div>
    </div>
  );
}

function DecisionStatePanel({
  state,
}: {
  state: RunAnalysisReport['exactMistakes'][number]['playerState'];
}): React.ReactElement {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StateValue label="Energy" value={Math.round(state.energy).toString()} />
        <StateValue label="Chi" value={Math.round(state.chi).toString()} />
        <StateValue label="Previous" value={state.previousAbility ? getSpellPresentation(state.previousAbility).label : 'None'} />
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ color: T.textDim, fontSize: '0.74rem' }}>Top recommendations</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {state.topRecommendations.length > 0
            ? state.topRecommendations.map((spellId) => <SpellBadge key={spellId} spellId={spellId} compact />)
            : <div style={{ color: T.textDim, fontSize: '0.76rem' }}>No recommendation recorded.</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ color: T.textDim, fontSize: '0.74rem' }}>Tracked buffs</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {state.activeBuffs.length > 0
            ? state.activeBuffs.map((buff) => <BuffBadge key={buff.buffId} buffId={buff.buffId} stacks={buff.stacks} />)
            : <div style={{ color: T.textDim, fontSize: '0.76rem' }}>No tracked buffs active.</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ color: T.textDim, fontSize: '0.74rem' }}>Essential cooldowns</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {state.activeCooldowns.length > 0
            ? state.activeCooldowns.map((cooldown) => (
              <CooldownStateBadge
                key={cooldown.spellId}
                spellId={cooldown.spellId}
                remaining={cooldown.remaining}
              />
            ))
            : <div style={{ color: T.textDim, fontSize: '0.76rem' }}>No essential cooldowns recorded.</div>}
        </div>
      </div>
    </div>
  );
}

function StateValue({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: '0.76rem',
        color: T.textBright,
        backgroundColor: 'rgba(255,255,255,0.03)',
      }}
    >
      <span style={{ color: T.textDim }}>{label}:</span> {value}
    </div>
  );
}

function CooldownStateBadge({ spellId, remaining }: { spellId: string; remaining: number }): React.ReactElement {
  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: '6px 8px',
        backgroundColor: 'rgba(255,255,255,0.03)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <SpellBadge spellId={spellId} compact />
      <span style={{ color: remaining > 0 ? T.textDim : T.accent, fontSize: '0.76rem' }}>
        {remaining > 0 ? `${remaining.toFixed(1)}s` : 'Ready'}
      </span>
    </div>
  );
}

function BuffBadge({ buffId, stacks }: { buffId: string; stacks: number }): React.ReactElement {
  const label = MONK_BUFF_REGISTRY[buffId]?.displayName ?? titleCaseSpellId(buffId);
  const iconName = MONK_BUFF_REGISTRY[buffId]?.iconName ?? 'inv_misc_questionmark';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        padding: '4px 8px 4px 4px',
        backgroundColor: 'rgba(255,255,255,0.03)',
      }}
    >
      <AbilityIcon iconName={iconName} emoji="✨" size={20} alt={label} style={{ borderRadius: 999 }} />
      <span style={{ color: T.textBright, fontSize: '0.75rem' }}>
        {label}
        {stacks > 1 ? ` x${stacks}` : ''}
      </span>
    </div>
  );
}

function titleCaseSpellId(spellId: string): string {
  return spellId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return Math.round(value).toString();
}

function formatDpsGap(trainerDps: number, playerDps: number): string {
  const gap = trainerDps - playerDps;
  return gap > 0 ? `${Math.round(gap).toLocaleString()} behind` : 'At benchmark';
}

function severityColor(severity: RunAnalysisReport['findings'][number]['severity']): string {
  switch (severity) {
    case 'major':
      return T.red;
    case 'medium':
      return T.gradeA;
    default:
      return T.textDim;
  }
}
