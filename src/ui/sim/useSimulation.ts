/**
 * useSimulation — React hook that creates and manages the simulation lifecycle.
 *
 * Bridges the game engine (GameState, SimEventQueue, GameLoop) with React state
 * so that UI components receive fresh snapshots each frame.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createGameState } from '@core/engine/gameState';
import type { GameState, GameStateSnapshot } from '@core/engine/gameState';
import { SimEventQueue, EventType } from '@core/engine/eventQueue';
import { deriveTargetMaxHealthForKillRange } from '@core/engine/target';
import type { SimEvent } from '@core/engine/eventQueue';
import { GameLoop } from '@core/engine/gameLoop';
import { createRng } from '@core/engine/rng';
import type { RngInstance } from '@core/engine/rng';
import { cloneLoadout, type CharacterLoadout } from '@core/data/loadout';
import type { CharacterProfile } from '@core/data/profileParser';
import { getDefaultProfileForSpec } from '@core/data/defaultProfile';
import { getSpellbookForProfileSpec } from '@core/data/specSpellbook';
import { getTalentCatalogForProfileSpec } from '@core/data/talentStringDecoder';
import { resolveSpecRuntime } from '@core/runtime/spec_registry';
import type { DamageEvent } from '@ui/components/FloatingCombatText';
import { createSimEventProcessor } from './simEventProcessor';
import { getRecommendationPreview, getTopNRecommendations } from './aplRecommender';
import type { RecommendationPreview } from './aplRecommender';
import type { SpellInputStatus } from '@core/engine/spell_input';
import { buildSpellInputStatusMap } from '@core/engine/spell_input';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';
import {
  buildLoadoutSignature,
  buildTalentStateSignature,
  LiveTraceCollector,
  type RawRunTrace,
} from '@core/analysis';
import { usesCompetitiveTrainerRules, type TrainerMode } from '@ui/state/trainerSettings';
import { getTrainerSpecDefinition, type TrainerSpecId } from '@ui/specs/specCatalog';
import { buildTutorialReadyPrompt, type TutorialPrompt } from './tutorialGuidance';

// ---------------------------------------------------------------------------
// Default profile
// ---------------------------------------------------------------------------

function buildDefaultTalentPointBudgets(profile: CharacterProfile): Record<'class' | 'specialization' | 'hero', number> {
  const talentTreeById = new Map(
    getTalentCatalogForProfileSpec(profile.spec).flatMap((node) => node.internalIds.map((internalId) => [internalId, node.tree] as const)),
  );
  const totals = {
    class: 0,
    specialization: 0,
    hero: 0,
  };

  for (const [internalId, rank] of profile.talentRanks.entries()) {
    const tree = talentTreeById.get(internalId);
    if (!tree) {
      continue;
    }

    totals[tree] += rank;
  }

  return totals;
}

const DEFAULT_PROFILE: CharacterProfile = getDefaultProfileForSpec('monk');

export const DEFAULT_TALENT_POINT_BUDGETS = buildDefaultTalentPointBudgets(DEFAULT_PROFILE);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSimulationOptions {
  selectedSpec?: TrainerSpecId;
  mode: TrainerMode;
  speedMultiplier?: number;
  encounterDuration?: number;
  /** Number of active enemies for multi-target encounters (1–8). Defaults to 1. */
  nTargets?: number;
  initialTalents?: ReadonlySet<string>;
  initialTalentRanks?: ReadonlyMap<string, number>;
  initialLoadout?: CharacterLoadout;
}

export type CountdownValue = number | 'go' | null;
export type SimulationEndReason = 'encounter_complete' | 'challenge_failure' | 'manual_finish';

export interface SimulationState {
  snapshot: GameStateSnapshot | null;
  analysisTrace: RawRunTrace | null;
  spellInputStatus: Map<string, SpellInputStatus>;
  simTime: number;
  dps: number;
  countdownValue: CountdownValue;
  hasStarted: boolean;
  isRunning: boolean;
  isPaused: boolean;
  isEnded: boolean;
  recommendations: string[];
  recommendationReadyIn: number | null;
  channelInfo: {
    isChanneling: boolean;
    spellId: string;
    spellName: string;
    totalTime: number;
    progress: number;
    remainingTime: number;
  };
  damageEvents: DamageEvent[];
  procHighlight: boolean;
  tutorialPrompt: TutorialPrompt | null;
  endReason: SimulationEndReason | null;
  finalDuration: number | null;
}

export interface UseSimulationResult {
  simState: SimulationState;
  talents: ReadonlySet<string>;
  talentRanks: ReadonlyMap<string, number>;
  loadout: CharacterLoadout;
  injectInput: (spellId: string) => void;
  cancelChannel: () => void;
  updateTalents: (talents: ReadonlySet<string>, talentRanks: ReadonlyMap<string, number>) => void;
  updateLoadout: (loadout: CharacterLoadout) => void;
  dismissTutorialPrompt: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  setSpeed: (multiplier: number) => void;
  restart: () => void;
  finishEncounterEarly: (reason: Exclude<SimulationEndReason, 'encounter_complete'>) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DAMAGE_EVENTS = 10;
const DAMAGE_EVENT_LIFETIME_MS = 1500;
const PRE_PULL_COUNTDOWN_SECONDS = 3;
const PRE_PULL_GO_DISPLAY_MS = 700;

export interface ProjectedRecommendationLock {
  recommendations: string[];
  readyAt: number;
}

function buildLockedRecommendationPreview(
  lock: ProjectedRecommendationLock,
  simTime: number,
): RecommendationPreview {
  return {
    recommendations: [...lock.recommendations],
    firstRecommendationReadyAt: lock.readyAt,
    firstRecommendationReadyIn: Math.max(0, lock.readyAt - simTime),
    hasImmediateRecommendation: false,
  };
}

export function resolveRecommendationPreview(
  rawPreview: RecommendationPreview,
  existingLock: ProjectedRecommendationLock | null,
  simTime: number,
  allowProjectedLock: boolean,
): { preview: RecommendationPreview; lock: ProjectedRecommendationLock | null } {
  if (!allowProjectedLock || rawPreview.recommendations.length === 0) {
    return { preview: rawPreview, lock: null };
  }

  if (rawPreview.hasImmediateRecommendation) {
    return { preview: rawPreview, lock: null };
  }

  if (existingLock && existingLock.readyAt > simTime + Number.EPSILON) {
    return {
      preview: buildLockedRecommendationPreview(existingLock, simTime),
      lock: existingLock,
    };
  }

  if (rawPreview.firstRecommendationReadyAt === null) {
    return { preview: rawPreview, lock: null };
  }

  const nextLock = {
    recommendations: [...rawPreview.recommendations],
    readyAt: rawPreview.firstRecommendationReadyAt,
  };

  return {
    preview: rawPreview,
    lock: nextLock,
  };
}
// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSimulation(options: UseSimulationOptions): UseSimulationResult {
  const selectedSpec = options.selectedSpec ?? 'monk-windwalker';
  const { mode, encounterDuration = 90, nTargets = 1 } = options;
  const selectedSpecDefinition = getTrainerSpecDefinition(selectedSpec);
  const defaultProfile = useMemo(
    () => getDefaultProfileForSpec(selectedSpecDefinition.profileSpec),
    [selectedSpecDefinition.profileSpec],
  );
  const runtime = useMemo(
    () => resolveSpecRuntime(defaultProfile),
    [defaultProfile],
  );
  const spellbook = useMemo(
    () => runtime.spells ?? getSpellbookForProfileSpec(defaultProfile.spec),
    [defaultProfile.spec, runtime],
  );
  const defaultSpeed = options.speedMultiplier ?? (mode === 'practice' ? 0.75 : 1.0);
  const initialTalents = options.initialTalents ?? defaultProfile.talents;
  const initialTalentRanks = options.initialTalentRanks ?? defaultProfile.talentRanks;
  const initialLoadout = options.initialLoadout ?? defaultProfile.loadout;

  // Mutable refs for engine objects (not React state — no re-render on mutation)
  const stateRef = useRef<GameState | null>(null);
  const queueRef = useRef<SimEventQueue | null>(null);
  const loopRef = useRef<GameLoop | null>(null);
  const rngRef = useRef<RngInstance | null>(null);
  const processEventsRef = useRef<((events: SimEvent[]) => void) | null>(null);
  const damageIdRef = useRef(0);
  const damageEventsRef = useRef<DamageEvent[]>([]);
  const endReasonRef = useRef<SimulationEndReason | null>(null);
  // Active channel state — set by CHANNEL_START, cleared by CHANNEL_END
  const channelRef = useRef<{ spellId: string; startTime: number; duration: number } | null>(null);
  const prevRecommendationsRef = useRef<string[]>([]);
  const analysisCollectorRef = useRef<LiveTraceCollector | null>(null);
  const tutorialPromptRef = useRef<TutorialPrompt | null>(null);
  const projectedRecommendationLockRef = useRef<ProjectedRecommendationLock | null>(null);

  // React state drives renders
  const [simState, setSimState] = useState<SimulationState>({
    snapshot: null,
    analysisTrace: null,
    spellInputStatus: new Map(),
    simTime: 0,
    dps: 0,
    countdownValue: PRE_PULL_COUNTDOWN_SECONDS,
    hasStarted: false,
    isRunning: false,
    isPaused: false,
    isEnded: false,
    recommendations: [],
    recommendationReadyIn: null,
    channelInfo: { isChanneling: false, spellId: '', spellName: '', totalTime: 0, progress: 0, remainingTime: 0 },
    damageEvents: [],
    procHighlight: false,
    tutorialPrompt: null,
    endReason: null,
    finalDuration: null,
  });

  const [speed, setSpeedState] = useState(defaultSpeed);
  const [talents, setTalents] = useState<Set<string>>(() => new Set(initialTalents));
  const [talentRanks, setTalentRanks] = useState<Map<string, number>>(() => new Map(initialTalentRanks));
  const [loadout, setLoadout] = useState<CharacterLoadout>(() => cloneLoadout(initialLoadout));
  const [restartVersion, setRestartVersion] = useState(0);
  const [countdownValue, setCountdownValue] = useState<CountdownValue>(PRE_PULL_COUNTDOWN_SECONDS);

  const talentSignature = buildTalentStateSignature(talents, talentRanks);
  const loadoutSignature = buildLoadoutSignature(loadout);
  const spellInputEntries = useMemo(
    () => [
      ...spellbook.values(),
      ...SHARED_PLAYER_SPELLS.values(),
    ],
    [spellbook],
  );

  // Build / teardown sim on mount or restart
  useEffect(() => {
    if (countdownValue === null) {
      return;
    }

      setSimState((prev) => ({
        ...prev,
        snapshot: null,
        analysisTrace: null,
        spellInputStatus: new Map(),
        simTime: 0,
        dps: 0,
        countdownValue,
        recommendations: [],
        damageEvents: [],
        procHighlight: false,
        tutorialPrompt: null,
        hasStarted: false,
        isRunning: false,
        isPaused: false,
        isEnded: false,
        endReason: null,
        finalDuration: null,
      }));

    const timeoutId = window.setTimeout(() => {
      setCountdownValue((current) => {
        if (current === null) {
          return null;
        }

        if (current === 'go') {
          return null;
        }

        if (current <= 1) {
          return 'go';
        }

        return current - 1;
      });
    }, countdownValue === 'go' ? PRE_PULL_GO_DISPLAY_MS : 1000);

    return (): void => {
      window.clearTimeout(timeoutId);
    };
  }, [countdownValue]);

  useEffect(() => {
    if (countdownValue !== null) {
      return;
    }

    const profile: CharacterProfile = {
      ...defaultProfile,
      talents: new Set(talents),
      talentRanks: new Map(talentRanks),
      loadout: cloneLoadout(loadout),
    };

    const state = createGameState(profile, {
      duration: encounterDuration,
      activeEnemies: nTargets,
    }, runtime);
    const derivedTargetMaxHealth = deriveTargetMaxHealthForKillRange(state.getMaxHealth());
    state.initializeTargetHealth(derivedTargetMaxHealth);
    const queue = new SimEventQueue();
    const rng = createRng(Date.now());

    stateRef.current = state;
    queueRef.current = queue;
    rngRef.current = rng;
    analysisCollectorRef.current = new LiveTraceCollector(profile.spec, encounterDuration);
    damageIdRef.current = 0;
    damageEventsRef.current = [];
    endReasonRef.current = null;
    tutorialPromptRef.current = null;

    channelRef.current = null;
    projectedRecommendationLockRef.current = null;

    const processEvents = createSimEventProcessor(state, queue, rng, {
      runtime,
      spellbook,
      classModule: runtime.module,
      onDamage: (spellId: string, amount: number, isCrit: boolean, time: number) => {
        damageIdRef.current += 1;
        const evt: DamageEvent = {
          id: `${damageIdRef.current}`,
          spellId,
          amount: Math.round(amount),
          isCrit,
          x: 44 + Math.random() * 12,
          y: 38 + Math.random() * 18,
          spawnedAt: Date.now(),
        };
        damageEventsRef.current = [...damageEventsRef.current.slice(-(MAX_DAMAGE_EVENTS - 1)), evt];
        analysisCollectorRef.current?.recordDamage(spellId, amount, isCrit, time);
      },
      onEncounterEnd: () => {
        // handled by GameLoop.onEncounterEnd
      },
      onSuccessfulCast: (_spellId: string, _time: number, preCastSnapshot, _preCastRecommendations) => {
        analysisCollectorRef.current?.recordCast(_spellId, _time, preCastSnapshot);
      },
      onCombatEvent: (event) => {
        analysisCollectorRef.current?.recordCombatEvent(event);
      },
      onChannelStart: (spellId, startTime, duration) => {
        channelRef.current = { spellId, startTime, duration };
      },
      onChannelEnd: () => {
        channelRef.current = null;
      },
    });
    processEventsRef.current = processEvents;

    // Seed events only after the pre-pull countdown finishes.
    queue.push({ type: EventType.ENCOUNTER_START, time: 0 });
    queue.push({ type: EventType.ENCOUNTER_END, time: encounterDuration });

    const loop = new GameLoop(state, queue, {
      speedMultiplier: speed,
      onFrame: (_frameState, events): void => {
        processEvents(events);

        const simTime = loop.currentSimTime;
        state.setTargetHealthPct(100 * (1 - Math.min(1, simTime / encounterDuration)));
        const snapshot = state.snapshot();
        const dps = snapshot.totalDamage / Math.max(0.1, simTime);

        const rawRecommendationPreview = getRecommendationPreview(state, 4, runtime);
        const resolvedRecommendationPreview = resolveRecommendationPreview(
          rawRecommendationPreview,
          projectedRecommendationLockRef.current,
          simTime,
          !usesCompetitiveTrainerRules(mode),
        );
        const recommendationPreview = resolvedRecommendationPreview.preview;
        projectedRecommendationLockRef.current = resolvedRecommendationPreview.lock;

        const analysisRecommendations = recommendationPreview.recommendations;
        const recommendations =
          usesCompetitiveTrainerRules(mode) ? [] : analysisRecommendations;
        analysisCollectorRef.current?.recordFrame(snapshot, analysisRecommendations);
        const spellInputStatus = buildSpellInputStatusMap(state, spellInputEntries);
        if (mode === 'tutorial' && tutorialPromptRef.current === null && loop.running && !loop.paused) {
          const expectedSpellId = analysisRecommendations[0] ?? null;
        const prompt = (
          expectedSpellId !== null
          && spellInputStatus.get(expectedSpellId)?.failReason === undefined
        )
          ? buildTutorialReadyPrompt({
            analysisSpecId: selectedSpecDefinition.analysisSpecId,
            talents,
            snapshot,
            recommendations: analysisRecommendations,
          })
          : null;
          if (prompt !== null) {
            tutorialPromptRef.current = prompt;
            loop.pause(performance.now());
          }
        }

        // Compute proc highlight: slot 0 changed unexpectedly from what was predicted as slot 1
        const prevRecs = prevRecommendationsRef.current;
        const procHighlight =
          prevRecs.length > 1 &&
          analysisRecommendations.length > 0 &&
          analysisRecommendations[0] !== prevRecs[1];

        // Update ref AFTER computing procHighlight
        prevRecommendationsRef.current = analysisRecommendations;

        // Channel detection — driven by CHANNEL_START/END events via channelRef
        const ch = channelRef.current;
        const isChanneling = ch !== null && simTime < ch.startTime + ch.duration;
        const elapsed = isChanneling && ch ? simTime - ch.startTime : 0;
        const spellDef = isChanneling && ch ? spellbook.get(ch.spellId) : null;

        // Prune old damage events
        const now = Date.now();
        damageEventsRef.current = damageEventsRef.current.filter(
          (e) => now - e.spawnedAt < DAMAGE_EVENT_LIFETIME_MS
        );

        setSimState({
          snapshot,
          analysisTrace: null,
          spellInputStatus,
          simTime,
          dps,
          countdownValue: null,
          hasStarted: true,
          isRunning: loop.running,
          isPaused: loop.paused,
          isEnded: !loop.running && simTime >= encounterDuration,
          recommendations,
          recommendationReadyIn: usesCompetitiveTrainerRules(mode) ? null : recommendationPreview.firstRecommendationReadyIn,
          channelInfo: {
            isChanneling,
            spellId: ch?.spellId ?? '',
            spellName: spellDef?.displayName ?? (ch?.spellId ?? ''),
            totalTime: ch?.duration ?? 0,
            progress: isChanneling && ch ? Math.min(1, elapsed / ch.duration) : 0,
            remainingTime: isChanneling && ch ? Math.max(0, (ch.startTime + ch.duration) - simTime) : 0,
          },
          damageEvents: [...damageEventsRef.current],
          procHighlight,
          tutorialPrompt: tutorialPromptRef.current,
          endReason: null,
          finalDuration: null,
        });
      },
      onEncounterEnd: (): void => {
        const simTime = loop.currentSimTime;
        state.setTargetHealthPct(0);
        const snapshot = state.snapshot();
        const analysisTrace = analysisCollectorRef.current?.finalize(snapshot, simTime) ?? null;

        setSimState((prev) => ({
          ...prev,
          snapshot,
          analysisTrace,
          spellInputStatus: buildSpellInputStatusMap(state, spellInputEntries),
          simTime,
          dps: snapshot.totalDamage / Math.max(0.1, simTime),
          countdownValue: null,
          hasStarted: true,
          isRunning: false,
          isPaused: false,
            isEnded: true,
            damageEvents: [...damageEventsRef.current],
            tutorialPrompt: tutorialPromptRef.current,
            endReason: endReasonRef.current ?? 'encounter_complete',
            finalDuration: simTime,
        }));
      },
    });

    loopRef.current = loop;
    loop.start(performance.now());

    const initialSnapshot = state.snapshot();
    const initialRecommendations = getTopNRecommendations(state, 4, runtime);
    const initialSpellInputStatus = buildSpellInputStatusMap(state, spellInputEntries);
    const initialExpectedSpellId = initialRecommendations[0] ?? null;
    const initialTutorialPrompt = (
      mode === 'tutorial'
      && initialExpectedSpellId !== null
      && initialSpellInputStatus.get(initialExpectedSpellId)?.failReason === undefined
    )
      ? buildTutorialReadyPrompt({
        analysisSpecId: selectedSpecDefinition.analysisSpecId,
        talents,
        snapshot: initialSnapshot,
        recommendations: initialRecommendations,
      })
      : null;
    if (initialTutorialPrompt !== null) {
      tutorialPromptRef.current = initialTutorialPrompt;
      loop.pause(performance.now());
    }

    setSimState((prev) => ({
      ...prev,
      snapshot: initialSnapshot,
      spellInputStatus: initialSpellInputStatus,
      recommendations: usesCompetitiveTrainerRules(mode) ? [] : initialRecommendations,
      simTime: initialSnapshot.currentTime,
      dps: initialSnapshot.totalDamage / Math.max(0.1, initialSnapshot.currentTime),
      countdownValue: null,
      hasStarted: true,
      isRunning: true,
      isPaused: initialTutorialPrompt !== null,
      isEnded: false,
      tutorialPrompt: initialTutorialPrompt,
      endReason: null,
      finalDuration: null,
    }));

    return (): void => {
      loop.stop();
      analysisCollectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownValue, defaultProfile, encounterDuration, loadout, loadoutSignature, mode, nTargets, restartVersion, runtime, selectedSpecDefinition.analysisSpecId, speed, spellInputEntries, spellbook, talentSignature, talents, talentRanks]);

  // Inject input
  const injectInput = useCallback((spellId: string): void => {
    if (countdownValue !== null) {
      return;
    }

    const loop = loopRef.current;
    const state = stateRef.current;
    if (!loop || !state) {
      return;
    }

    if (loop.paused) {
      return;
    }

    if (mode === 'tutorial') {
      const snapshot = state.snapshot();
      const recommendations = getTopNRecommendations(state, 4, runtime);
      const spellInputStatus = buildSpellInputStatusMap(state, spellInputEntries);
      const expectedSpellId = recommendations[0] ?? null;
      const tutorialPrompt = (
        expectedSpellId !== null
        && spellInputStatus.get(expectedSpellId)?.failReason === undefined
      )
        ? buildTutorialReadyPrompt({
          analysisSpecId: selectedSpecDefinition.analysisSpecId,
          talents,
          snapshot,
          recommendations,
        })
        : null;

      if (tutorialPrompt !== null && spellId !== tutorialPrompt.expectedSpellId) {
        tutorialPromptRef.current = tutorialPrompt;
        loop.pause(performance.now());
        setSimState((prev) => ({
          ...prev,
          snapshot,
          spellInputStatus,
          recommendations,
          simTime: snapshot.currentTime,
          dps: snapshot.totalDamage / Math.max(0.1, snapshot.currentTime),
          isPaused: true,
          isRunning: loop.running,
          tutorialPrompt,
        }));
        return;
      }
    }

    loop.injectInput(spellId);
  }, [countdownValue, mode, runtime, selectedSpecDefinition.analysisSpecId, spellInputEntries, spellbook, talents]);

  const cancelChannel = useCallback((): void => {
    if (loopRef.current?.paused) {
      return;
    }

    if (countdownValue !== null) {
      return;
    }

    loopRef.current?.injectCancel();
  }, [countdownValue]);

  const updateTalents = useCallback((nextTalents: ReadonlySet<string>, nextTalentRanks: ReadonlyMap<string, number>): void => {
    setTalents(new Set(nextTalents));
    setTalentRanks(new Map(nextTalentRanks));
  }, []);

  const updateLoadout = useCallback((nextLoadout: CharacterLoadout): void => {
    setLoadout(cloneLoadout(nextLoadout));
  }, []);

  const dismissTutorialPrompt = useCallback((): void => {
    tutorialPromptRef.current = null;
    setSimState((prev) => ({ ...prev, tutorialPrompt: null }));
  }, []);

  const pause = useCallback((): void => {
    const loop = loopRef.current;
    if (countdownValue !== null || !loop || !loop.running || loop.paused) {
      return;
    }

    loop.pause(performance.now());
    setSimState((prev) => ({ ...prev, isPaused: true, isRunning: loop.running }));
  }, [countdownValue]);

  const resume = useCallback((): void => {
    const loop = loopRef.current;
    if (countdownValue !== null || !loop || !loop.running || !loop.paused) {
      return;
    }

    loop.resume(performance.now());
    setSimState((prev) => ({ ...prev, isPaused: false, isRunning: loop.running }));
  }, [countdownValue]);

  const togglePause = useCallback((): void => {
    const loop = loopRef.current;
    if (countdownValue !== null || !loop?.running) {
      return;
    }

    if (loop.paused) {
      loop.resume(performance.now());
      setSimState((prev) => ({ ...prev, isPaused: false, isRunning: loop.running }));
      return;
    }

    loop.pause(performance.now());
    setSimState((prev) => ({ ...prev, isPaused: true, isRunning: loop.running }));
  }, [countdownValue]);

  // Set speed — GameLoop doesn't have a setter, so we store it for restart
  const setSpeed = useCallback((multiplier: number): void => {
    setSpeedState(multiplier);
  }, []);

  // Restart
  const restart = useCallback((): void => {
    loopRef.current?.stop();
    prevRecommendationsRef.current = [];
    projectedRecommendationLockRef.current = null;
    damageEventsRef.current = [];
    endReasonRef.current = null;
    tutorialPromptRef.current = null;
    setRestartVersion((current) => current + 1);
    setCountdownValue(PRE_PULL_COUNTDOWN_SECONDS);
    // Force re-run of the effect by updating a state key
    setSimState({
      snapshot: null,
      analysisTrace: null,
      spellInputStatus: new Map(),
      simTime: 0,
      dps: 0,
      countdownValue: PRE_PULL_COUNTDOWN_SECONDS,
      hasStarted: false,
      isRunning: false,
      isPaused: false,
      isEnded: false,
      recommendations: [],
      recommendationReadyIn: null,
      channelInfo: { isChanneling: false, spellId: '', spellName: '', totalTime: 0, progress: 0, remainingTime: 0 },
      damageEvents: [],
      procHighlight: false,
      tutorialPrompt: null,
      endReason: null,
      finalDuration: null,
    });
  }, []);

  const finishEncounterEarly = useCallback((reason: Exclude<SimulationEndReason, 'encounter_complete'>): void => {
    if (countdownValue !== null) {
      return;
    }

    const loop = loopRef.current;
    const state = stateRef.current;
    if (!loop || !state || !simState.hasStarted || simState.isEnded) {
      return;
    }

    endReasonRef.current = reason;
    loop.stop();

    const simTime = loop.currentSimTime;
    state.setTargetHealthPct(100 * (1 - Math.min(1, simTime / encounterDuration)));
    const finalSnapshot = state.snapshot();
    const analysisTrace = analysisCollectorRef.current?.finalize(finalSnapshot, simTime) ?? null;

    setSimState((prev) => ({
      ...prev,
      snapshot: finalSnapshot,
      analysisTrace,
      spellInputStatus: buildSpellInputStatusMap(state, [
        ...spellbook.values(),
        ...SHARED_PLAYER_SPELLS.values(),
      ]),
      simTime,
      dps: finalSnapshot.totalDamage / Math.max(0.1, simTime),
      countdownValue: null,
      hasStarted: true,
      isRunning: false,
      isPaused: false,
      isEnded: true,
      damageEvents: [...damageEventsRef.current],
      tutorialPrompt: tutorialPromptRef.current,
      endReason: reason,
      finalDuration: simTime,
    }));
  }, [countdownValue, encounterDuration, simState.hasStarted, simState.isEnded, spellbook]);

  return {
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
    setSpeed,
    restart,
    finishEncounterEarly,
  };
}
