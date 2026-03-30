import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChallengeDifficulty } from '@ui/state/trainerSettings';
import { generateChallengeChart } from './chartGenerator';
import {
  CHALLENGE_PLAYFIELD,
  createEmptyChallengeStats,
  type ChallengeNote,
  type ChallengeNoteRuntime,
  type ChallengePlayfield,
  type ChallengePoint,
  type ChallengeStateSnapshot,
  type ChallengeStats,
} from './noteTypes';

interface UseChallengeModeOptions {
  enabled: boolean;
  difficulty: ChallengeDifficulty;
  validKeys: string[];
  disappearSpeedMultiplier: number;
  duration: number;
  simTime: number;
  countdownValue: number | 'go' | null;
  hasStarted: boolean;
  isPaused: boolean;
  isEnded: boolean;
  seed: number;
  onFailure: () => void;
}

interface PointerState {
  x: number;
  y: number;
  isDown: boolean;
}

export interface UseChallengeModeResult {
  challenge: ChallengeStateSnapshot;
  activeNotes: ChallengeNoteRuntime[];
  playfield: ChallengePlayfield;
  handlePointerMove: (point: ChallengePoint) => void;
  handlePointerDown: (point: ChallengePoint) => void;
  handlePointerUp: (point: ChallengePoint) => void;
  handlePointerLeave: () => void;
  handleKeyChord: (chord: string) => boolean;
}

function createRuntimeNotes(notes: ChallengeNote[]): ChallengeNoteRuntime[] {
  return notes.map((note) => ({
    note,
    status: 'pending',
    progress: 0,
    clickCount: 0,
    pointerActive: false,
  }));
}

function markHit(noteRuntime: ChallengeNoteRuntime, stats: ChallengeStats): void {
  noteRuntime.status = 'hit';
  noteRuntime.pointerActive = false;
  stats.hits += 1;
  stats.currentStreak += 1;
  stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  stats.hitsByType[noteRuntime.note.type] += 1;
}

function markMiss(noteRuntime: ChallengeNoteRuntime, stats: ChallengeStats): number {
  noteRuntime.status = 'missed';
  noteRuntime.pointerActive = false;
  stats.misses += 1;
  stats.currentStreak = 0;
  stats.missesByType[noteRuntime.note.type] += 1;
  return noteRuntime.note.damageOnMiss;
}

function distanceBetween(left: ChallengePoint, right: ChallengePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isInsideNote(point: ChallengePoint, note: ChallengeNote): boolean {
  return distanceBetween(point, note.position) <= note.radius;
}

function isOrderedNoteReady(noteRuntime: ChallengeNoteRuntime, notes: ChallengeNoteRuntime[]): boolean {
  if (noteRuntime.note.type !== 'ordered-chain') {
    return true;
  }

  const orderedNote = noteRuntime.note;

  return notes.every((candidate) => {
    if (candidate.note.type !== 'ordered-chain') {
      return true;
    }

    return candidate.note.chainId !== orderedNote.chainId
      || candidate.note.orderIndex >= orderedNote.orderIndex
      || candidate.status === 'hit';
  });
}

function getSliderProgressTarget(noteRuntime: ChallengeNoteRuntime, point: ChallengePoint): number {
  if (noteRuntime.note.type !== 'slider') {
    return 0;
  }

  const [start, end] = noteRuntime.note.path;
  const sliderLength = distanceBetween(start, end);
  if (sliderLength === 0) {
    return isInsideNote(point, noteRuntime.note) ? noteRuntime.note.travelDuration : 0;
  }

  const fromStartX = point.x - start.x;
  const fromStartY = point.y - start.y;
  const distanceFromStart = Math.hypot(fromStartX, fromStartY);
  const projectionDistance = ((fromStartX * (end.x - start.x)) + (fromStartY * (end.y - start.y))) / sliderLength;
  const clampedDistance = Math.max(0, Math.min(sliderLength, projectionDistance));
  const clamped = clampedDistance / sliderLength;
  const nearest = {
    x: start.x + (end.x - start.x) * clamped,
    y: start.y + (end.y - start.y) * clamped,
  };
  const lateralDistance = distanceBetween(point, nearest);
  const directionAlignment = distanceFromStart === 0 ? 1 : projectionDistance / distanceFromStart;

  if (clamped <= 0) {
    return 0;
  }

  if (directionAlignment < 0.35) {
    return 0;
  }

  if (lateralDistance > noteRuntime.note.radius * 2.75) {
    return 0;
  }

  return clamped * noteRuntime.note.travelDuration;
}

export function useChallengeMode({
  enabled,
  difficulty,
  validKeys,
  disappearSpeedMultiplier,
  duration,
  simTime,
  countdownValue,
  hasStarted,
  isPaused,
  isEnded,
  seed,
  onFailure,
}: UseChallengeModeOptions): UseChallengeModeResult {
  const playfield = CHALLENGE_PLAYFIELD;
  const validKeySignature = validKeys.join('|');
  const stableValidKeys = useMemo(
    () => (validKeySignature.length > 0 ? validKeySignature.split('|') : []),
    [validKeySignature],
  );
  const chart = useMemo(
    () => (enabled
      ? generateChallengeChart({
        difficulty,
        duration,
        seed,
        validKeys: stableValidKeys,
        disappearSpeedMultiplier,
        playfield,
      })
      : []),
    [difficulty, disappearSpeedMultiplier, duration, enabled, playfield, seed, stableValidKeys],
  );
  const buildChallengeState = useCallback((): ChallengeStateSnapshot => ({
    difficulty,
    seed,
    health: 100,
    maxHealth: 100,
    isFailed: false,
    validKeys: [...stableValidKeys],
    stats: createEmptyChallengeStats(),
    notes: createRuntimeNotes(chart),
  }), [chart, difficulty, seed, stableValidKeys]);
  const [challenge, setChallenge] = useState<ChallengeStateSnapshot>(() => buildChallengeState());
  const prevSimTimeRef = useRef(0);
  const pointerRef = useRef<PointerState>({ x: -9999, y: -9999, isDown: false });
  const failureReportedRef = useRef(false);

  useEffect(() => {
    setChallenge(buildChallengeState());
    prevSimTimeRef.current = 0;
    pointerRef.current = { x: -9999, y: -9999, isDown: false };
    failureReportedRef.current = false;
  }, [buildChallengeState]);

  useEffect(() => {
    if (!enabled || (countdownValue === null && hasStarted && !isEnded)) {
      return;
    }

    setChallenge(buildChallengeState());
    prevSimTimeRef.current = 0;
    pointerRef.current = { x: -9999, y: -9999, isDown: false };
    failureReportedRef.current = false;
  }, [buildChallengeState, countdownValue, enabled, hasStarted, isEnded]);

  useEffect(() => {
    if (!enabled || !hasStarted || countdownValue !== null || isPaused || isEnded) {
      prevSimTimeRef.current = simTime;
      return;
    }

    const delta = Math.max(0, simTime - prevSimTimeRef.current);
    prevSimTimeRef.current = simTime;

    setChallenge((current) => {
      let health = current.health;
      const stats: ChallengeStats = {
        ...current.stats,
        hitsByType: { ...current.stats.hitsByType },
        missesByType: { ...current.stats.missesByType },
      };
      let changed = false;

      const notes = current.notes.map((noteRuntime) => {
        const next = { ...noteRuntime };

        if (next.status === 'pending' && simTime >= next.note.startTime) {
          next.status = 'active';
          changed = true;
        }

        if (next.status !== 'active') {
          return next;
        }

        if (next.note.type === 'hold') {
          const pointerWithin = pointerRef.current.isDown && isInsideNote(pointerRef.current, next.note);

          if (next.pointerActive !== pointerWithin) {
            next.pointerActive = pointerWithin;
            changed = true;
          }

          if (pointerWithin) {
            next.progress += delta;
            changed = true;
            if (next.progress >= next.note.holdDuration) {
              markHit(next, stats);
            }
          }
        }

        if (next.note.type === 'slider') {
          const pointerActive = pointerRef.current.isDown && (next.pointerActive || isInsideNote(pointerRef.current, next.note));
          if (next.pointerActive !== pointerActive) {
            next.pointerActive = pointerActive;
            changed = true;
          }

          if (pointerActive) {
            const targetProgress = getSliderProgressTarget(next, pointerRef.current);
            if (targetProgress > next.progress) {
              next.progress = targetProgress;
              changed = true;
            }

            if (next.progress >= next.note.travelDuration * 0.95) {
              markHit(next, stats);
            }
          }
        }

        if (simTime >= next.note.endTime && next.status === 'active') {
          health = Math.max(0, health - markMiss(next, stats));
          changed = true;
        }

        return next;
      });

      const failed = health <= 0;
      if (!changed && current.health === health && current.isFailed === failed) {
        return current;
      }

      return {
        ...current,
        health,
        isFailed: failed,
        stats,
        notes,
      };
    });
  }, [countdownValue, enabled, hasStarted, isEnded, isPaused, simTime]);

  useEffect(() => {
    if (!challenge.isFailed || failureReportedRef.current) {
      return;
    }

    failureReportedRef.current = true;
    onFailure();
  }, [challenge.isFailed, onFailure]);

  const handlePointerMove = useCallback((point: ChallengePoint): void => {
    pointerRef.current = { ...pointerRef.current, x: point.x, y: point.y };
  }, []);

  const handlePointerDown = useCallback((point: ChallengePoint): void => {
    if (!enabled) {
      return;
    }

    pointerRef.current = { x: point.x, y: point.y, isDown: true };

    setChallenge((current) => {
      const health = current.health;
      const stats: ChallengeStats = {
        ...current.stats,
        hitsByType: { ...current.stats.hitsByType },
        missesByType: { ...current.stats.missesByType },
      };
      let changed = false;

      const notes = current.notes.map((noteRuntime) => {
        const next = { ...noteRuntime };
        if (next.status !== 'active' || !isInsideNote(point, next.note)) {
          return next;
        }

        if (!isOrderedNoteReady(next, current.notes)) {
          return next;
        }

        if (next.note.type === 'tap' || next.note.type === 'ordered-chain') {
          markHit(next, stats);
          changed = true;
          return next;
        }

        if (next.note.type === 'repeat') {
          next.clickCount += 1;
          changed = true;
          if (next.clickCount >= next.note.requiredClicks) {
            markHit(next, stats);
          }
          return next;
        }

        if (next.note.type === 'hold') {
          next.pointerActive = true;
          changed = true;
          return next;
        }

        if (next.note.type === 'slider' && isInsideNote(point, next.note)) {
          next.pointerActive = true;
          changed = true;
          return next;
        }

        return next;
      });

      const failed = health <= 0;
      if (!changed) {
        return current;
      }

      return {
        ...current,
        health,
        isFailed: failed,
        stats,
        notes,
      };
    });
  }, [enabled]);

  const handlePointerUp = useCallback((point: ChallengePoint): void => {
    pointerRef.current = { x: point.x, y: point.y, isDown: false };
    setChallenge((current) => ({
      ...current,
      notes: current.notes.map((noteRuntime) => (
        noteRuntime.pointerActive ? { ...noteRuntime, pointerActive: false } : noteRuntime
      )),
    }));
  }, []);

  const handlePointerLeave = useCallback((): void => {
    pointerRef.current = { x: -9999, y: -9999, isDown: false };
    setChallenge((current) => ({
      ...current,
      notes: current.notes.map((noteRuntime) => (
        noteRuntime.pointerActive ? { ...noteRuntime, pointerActive: false } : noteRuntime
      )),
    }));
  }, []);

  const handleKeyChord = useCallback((chord: string): boolean => {
    if (!enabled) {
      return false;
    }

    let consumed = false;

    setChallenge((current) => {
      const stats: ChallengeStats = {
        ...current.stats,
        hitsByType: { ...current.stats.hitsByType },
        missesByType: { ...current.stats.missesByType },
      };

      const notes = current.notes.map((noteRuntime) => {
        if (noteRuntime.status !== 'active' || noteRuntime.note.type !== 'hover-key') {
          return noteRuntime;
        }

        if (!isInsideNote(pointerRef.current, noteRuntime.note) || noteRuntime.note.requiredKey !== chord) {
          return noteRuntime;
        }

        consumed = true;
        const next = { ...noteRuntime };
        markHit(next, stats);
        return next;
      });

      if (!consumed) {
        return current;
      }

      return {
        ...current,
        stats,
        notes,
      };
    });

    return consumed;
  }, [enabled]);

  return {
    challenge,
    activeNotes: challenge.notes.filter((noteRuntime) => noteRuntime.status === 'active'),
    playfield,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handlePointerLeave,
    handleKeyChord,
  };
}
