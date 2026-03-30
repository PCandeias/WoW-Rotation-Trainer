/**
 * useSimulation — React hook that creates and manages the simulation lifecycle.
 *
 * Bridges the game engine (GameState, SimEventQueue, GameLoop) with React state
 * so that UI components receive fresh snapshots each frame.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createGameState } from '@core/engine/gameState';
import type { GameState, GameStateSnapshot } from '@core/engine/gameState';
import { SimEventQueue, EventType } from '@core/engine/eventQueue';
import type { SimEvent } from '@core/engine/eventQueue';
import { GameLoop } from '@core/engine/gameLoop';
import { createRng } from '@core/engine/rng';
import type { RngInstance } from '@core/engine/rng';
import { cloneLoadout, type CharacterLoadout } from '@core/data/loadout';
import type { CharacterProfile } from '@core/data/profileParser';
import { getDefaultMonkWindwalkerProfile } from '@core/data/defaultProfile';
import { getMonkWindwalkerTalentCatalog } from '@core/data/talentStringDecoder';
import type { DamageEvent } from '@ui/components/FloatingCombatText';
import { createSimEventProcessor } from './simEventProcessor';
import { getTopNRecommendations } from './aplRecommender';
import { MONK_WW_SPELLS } from '@data/spells/monk_windwalker';
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

// ---------------------------------------------------------------------------
// Default profile
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE: CharacterProfile = getDefaultMonkWindwalkerProfile();

const TALENT_TREE_BY_ID = new Map(
  getMonkWindwalkerTalentCatalog().flatMap((node) => node.internalIds.map((internalId) => [internalId, node.tree] as const)),
);

export const DEFAULT_TALENT_POINT_BUDGETS = ((): Record<'class' | 'specialization' | 'hero', number> => {
  const totals = {
    class: 0,
    specialization: 0,
    hero: 0,
  };

  for (const [internalId, rank] of DEFAULT_PROFILE.talentRanks.entries()) {
    const tree = TALENT_TREE_BY_ID.get(internalId);
    if (!tree) {
      continue;
    }

    totals[tree] += rank;
  }

  return totals;
})();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSimulationOptions {
  mode: TrainerMode;
  speedMultiplier?: number;
  encounterDuration?: number;
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSimulation(options: UseSimulationOptions): UseSimulationResult {
  const { mode, encounterDuration = 90 } = options;
  const defaultSpeed = options.speedMultiplier ?? (mode === 'practice' ? 0.75 : 1.0);
  const initialTalents = options.initialTalents ?? DEFAULT_PROFILE.talents;
  const initialTalentRanks = options.initialTalentRanks ?? DEFAULT_PROFILE.talentRanks;
  const initialLoadout = options.initialLoadout ?? DEFAULT_PROFILE.loadout;

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
    channelInfo: { isChanneling: false, spellId: '', spellName: '', totalTime: 0, progress: 0, remainingTime: 0 },
    damageEvents: [],
    procHighlight: false,
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

  // Build / teardown sim on mount or restart
  useEffect(() => {
    if (countdownValue === null) {
      return;
    }

      setSimState((prev) => ({
        ...prev,
        countdownValue,
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
      ...DEFAULT_PROFILE,
      talents: new Set(talents),
      talentRanks: new Map(talentRanks),
      loadout: cloneLoadout(loadout),
    };

    const state = createGameState(profile, {
      duration: encounterDuration,
      activeEnemies: 1,
    });
    const queue = new SimEventQueue();
    const rng = createRng(Date.now());

    stateRef.current = state;
    queueRef.current = queue;
    rngRef.current = rng;
    analysisCollectorRef.current = new LiveTraceCollector(profile.spec, encounterDuration);
    damageIdRef.current = 0;
    damageEventsRef.current = [];
    endReasonRef.current = null;

    channelRef.current = null;

    const processEvents = createSimEventProcessor(state, queue, rng, {
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
      onSuccessfulCast: (spellId: string, time: number) => {
        analysisCollectorRef.current?.recordCast(spellId, time);
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

        const snapshot = state.snapshot();
        const simTime = loop.currentSimTime;
        const dps = snapshot.totalDamage / Math.max(0.1, simTime);

        const analysisRecommendations = getTopNRecommendations(state, 4);
        const recommendations =
          usesCompetitiveTrainerRules(mode) ? [] : analysisRecommendations;
        analysisCollectorRef.current?.recordFrame(snapshot, analysisRecommendations);
        const spellInputStatus = buildSpellInputStatusMap(state, [
          ...MONK_WW_SPELLS.values(),
          ...SHARED_PLAYER_SPELLS.values(),
        ]);

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
        const spellDef = isChanneling && ch ? MONK_WW_SPELLS.get(ch.spellId) : null;

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
          endReason: null,
          finalDuration: null,
        });
      },
      onEncounterEnd: (): void => {
        const snapshot = state.snapshot();
        const simTime = loop.currentSimTime;
        const analysisTrace = analysisCollectorRef.current?.finalize(snapshot, simTime) ?? null;

        setSimState((prev) => ({
          ...prev,
          snapshot,
          analysisTrace,
          spellInputStatus: buildSpellInputStatusMap(state, [
            ...MONK_WW_SPELLS.values(),
            ...SHARED_PLAYER_SPELLS.values(),
          ]),
          simTime,
          dps: snapshot.totalDamage / Math.max(0.1, simTime),
          countdownValue: null,
          hasStarted: true,
          isRunning: false,
          isPaused: false,
          isEnded: true,
          damageEvents: [...damageEventsRef.current],
          endReason: endReasonRef.current ?? 'encounter_complete',
          finalDuration: simTime,
        }));
      },
    });

    loopRef.current = loop;
    loop.start(performance.now());

    setSimState((prev) => ({
      ...prev,
      countdownValue: null,
      hasStarted: true,
      isRunning: true,
      isPaused: false,
      isEnded: false,
      endReason: null,
      finalDuration: null,
    }));

    return (): void => {
      loop.stop();
      analysisCollectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdownValue, encounterDuration, loadout, loadoutSignature, mode, restartVersion, speed, talentSignature, talents, talentRanks]);

  // Inject input
  const injectInput = useCallback((spellId: string): void => {
    if (loopRef.current?.paused) {
      return;
    }

    if (countdownValue !== null) {
      return;
    }

    loopRef.current?.injectInput(spellId);
  }, [countdownValue]);

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
    damageEventsRef.current = [];
    endReasonRef.current = null;
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
      channelInfo: { isChanneling: false, spellId: '', spellName: '', totalTime: 0, progress: 0, remainingTime: 0 },
      damageEvents: [],
      procHighlight: false,
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

    const snapshot = state.snapshot();
    const simTime = loop.currentSimTime;
    const analysisTrace = analysisCollectorRef.current?.finalize(snapshot, simTime) ?? null;

    setSimState((prev) => ({
      ...prev,
      snapshot,
      analysisTrace,
      spellInputStatus: buildSpellInputStatusMap(state, [
        ...MONK_WW_SPELLS.values(),
        ...SHARED_PLAYER_SPELLS.values(),
      ]),
      simTime,
      dps: snapshot.totalDamage / Math.max(0.1, simTime),
      countdownValue: null,
      hasStarted: true,
      isRunning: false,
      isPaused: false,
      isEnded: true,
      damageEvents: [...damageEventsRef.current],
      endReason: reason,
      finalDuration: simTime,
    }));
  }, [countdownValue, simState.hasStarted, simState.isEnded]);

  return {
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
    setSpeed,
    restart,
    finishEncounterEarly,
  };
}
