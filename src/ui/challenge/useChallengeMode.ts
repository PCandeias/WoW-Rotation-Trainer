import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChallengeDifficulty, ChallengeSpawnCadenceMultiplier } from '@ui/state/trainerSettings';
import { generateChallengeChart } from './chartGenerator';
import { projectSliderProgress } from './sliderGeometry';
import {
  CHALLENGE_FEEDBACK_DURATION,
  CHALLENGE_PLAYFIELD,
  createEmptyChallengeStats,
  getChallengeSequenceInfo,
  type ChallengeFeedbackBurst,
  type ChallengeHitGrade,
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
  spawnCadenceMultiplier: ChallengeSpawnCadenceMultiplier;
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

const MIN_SPINNER_ROTATION_DELTA = 0.006;
const MAX_SPINNER_ROTATION_DELTA = Math.PI / 2;
const SPINNER_GRAB_PADDING = 14;
const SPINNER_RELEASE_PADDING = 20;

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
    pointerAngle: null,
    hitGrade: null,
  }));
}

function cloneStats(stats: ChallengeStats): ChallengeStats {
  return {
    ...stats,
    hitsByType: { ...stats.hitsByType },
    missesByType: { ...stats.missesByType },
    hitsByGrade: { ...stats.hitsByGrade },
  };
}

function distanceBetween(left: ChallengePoint, right: ChallengePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isInsideNote(point: ChallengePoint, note: ChallengeNote): boolean {
  return distanceBetween(point, note.position) <= note.radius;
}

function isInsideSpinnerZone(
  point: ChallengePoint,
  note: Extract<ChallengeNote, { type: 'spinner' }>,
  wasActive: boolean,
): boolean {
  const padding = wasActive ? SPINNER_RELEASE_PADDING : SPINNER_GRAB_PADDING;
  return distanceBetween(point, note.position) <= note.radius + padding;
}

function isOrderedNoteReady(noteRuntime: ChallengeNoteRuntime, notes: ChallengeNoteRuntime[]): boolean {
  const sequenceInfo = getChallengeSequenceInfo(noteRuntime.note);
  if (!sequenceInfo) {
    return true;
  }

  return notes.every((candidate) => {
    const candidateSequence = getChallengeSequenceInfo(candidate.note);
    if (!candidateSequence) {
      return true;
    }

    return candidateSequence.sequenceId !== sequenceInfo.sequenceId
      || candidateSequence.orderIndex >= sequenceInfo.orderIndex
      || candidate.status === 'hit';
  });
}

function classifyHitGrade(note: ChallengeNote, hitTime: number): ChallengeHitGrade {
  const windowDuration = Math.max(0.35, note.endTime - note.startTime);
  const remaining = Math.max(0, note.endTime - hitTime);
  const normalizedRemaining = remaining / windowDuration;

  if (normalizedRemaining <= 0.09) {
    return 'Perfect';
  }

  if (normalizedRemaining <= 0.24) {
    return 'Great';
  }

  return 'Good';
}

function buildFeedback(note: ChallengeNote, grade: ChallengeHitGrade, hitTime: number): ChallengeFeedbackBurst {
  return {
    id: `${note.id}-${hitTime.toFixed(3)}`,
    text: grade,
    position: note.position,
    createdAt: hitTime,
    expiresAt: hitTime + CHALLENGE_FEEDBACK_DURATION,
  };
}

function markHit(
  noteRuntime: ChallengeNoteRuntime,
  stats: ChallengeStats,
  feedbackBursts: ChallengeFeedbackBurst[],
  hitTime: number,
): void {
  const hitGrade = classifyHitGrade(noteRuntime.note, hitTime);
  noteRuntime.status = 'hit';
  noteRuntime.pointerActive = false;
  noteRuntime.pointerAngle = null;
  noteRuntime.hitGrade = hitGrade;
  stats.hits += 1;
  stats.currentStreak += 1;
  stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  stats.hitsByType[noteRuntime.note.type] += 1;
  stats.hitsByGrade[hitGrade] += 1;
  feedbackBursts.push(buildFeedback(noteRuntime.note, hitGrade, hitTime));
}

function markMiss(noteRuntime: ChallengeNoteRuntime, stats: ChallengeStats): number {
  noteRuntime.status = 'missed';
  noteRuntime.pointerActive = false;
  noteRuntime.pointerAngle = null;
  stats.misses += 1;
  stats.currentStreak = 0;
  stats.missesByType[noteRuntime.note.type] += 1;
  return noteRuntime.note.damageOnMiss;
}

function normalizeAngleDelta(delta: number): number {
  if (delta > Math.PI) {
    return delta - (Math.PI * 2);
  }

  if (delta < -Math.PI) {
    return delta + (Math.PI * 2);
  }

  return delta;
}

function getSliderProgressTarget(noteRuntime: ChallengeNoteRuntime, point: ChallengePoint): number {
  if (noteRuntime.note.type !== 'slider') {
    return 0;
  }

  const hitAllowance = noteRuntime.note.sliderPath.kind === 'arc'
    ? Math.max(noteRuntime.note.radius * 1.15, 18)
    : noteRuntime.note.radius * 2.75;
  const progressRatio = projectSliderProgress(noteRuntime.note.sliderPath, point, hitAllowance);
  return progressRatio * noteRuntime.note.travelDuration;
}

function getSliderCompletionThreshold(note: Extract<ChallengeNote, { type: 'slider' }>): number {
  return note.sliderPath.kind === 'arc' ? 0.99 : 0.95;
}

export function useChallengeMode({
  enabled,
  difficulty,
  validKeys,
  spawnCadenceMultiplier,
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
        spawnCadenceMultiplier,
        playfield,
      })
      : []),
    [difficulty, duration, enabled, playfield, seed, spawnCadenceMultiplier, stableValidKeys],
  );
  const buildChallengeState = useCallback((): ChallengeStateSnapshot => ({
    difficulty,
    seed,
    health: 100,
    maxHealth: 100,
    isFailed: false,
    validKeys: [...stableValidKeys],
    spawnCadenceMultiplier,
    stats: createEmptyChallengeStats(),
    notes: createRuntimeNotes(chart),
    feedbackBursts: [],
  }), [chart, difficulty, seed, spawnCadenceMultiplier, stableValidKeys]);
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
      const stats = cloneStats(current.stats);
      const feedbackBursts = current.feedbackBursts.filter((feedback) => feedback.expiresAt > simTime);
      let changed = feedbackBursts.length !== current.feedbackBursts.length;

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
              next.progress = next.note.holdDuration;
              markHit(next, stats, feedbackBursts, simTime);
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

            if (next.progress >= next.note.travelDuration * getSliderCompletionThreshold(next.note)) {
              next.progress = next.note.travelDuration;
              markHit(next, stats, feedbackBursts, simTime);
            }
          }
        }

        if (next.note.type === 'spinner') {
          const pointerWithin = pointerRef.current.isDown && isInsideSpinnerZone(
            pointerRef.current,
            next.note,
            next.pointerActive,
          );
          if (next.pointerActive !== pointerWithin) {
            next.pointerActive = pointerWithin;
            changed = true;
            if (!pointerWithin) {
              next.pointerAngle = null;
            }
          }

          if (pointerWithin) {
            const currentAngle = Math.atan2(pointerRef.current.y - next.note.position.y, pointerRef.current.x - next.note.position.x);
            if (next.pointerAngle !== null) {
              const deltaAngle = Math.abs(normalizeAngleDelta(currentAngle - next.pointerAngle));
              if (deltaAngle >= MIN_SPINNER_ROTATION_DELTA) {
                next.progress += Math.min(deltaAngle, MAX_SPINNER_ROTATION_DELTA);
                changed = true;
              }
            }
            next.pointerAngle = currentAngle;
            if (next.progress >= next.note.requiredRotation) {
              next.progress = next.note.requiredRotation;
              markHit(next, stats, feedbackBursts, simTime);
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
        feedbackBursts,
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
      const stats = cloneStats(current.stats);
      const feedbackBursts = current.feedbackBursts.filter((feedback) => feedback.expiresAt > simTime);
      let changed = feedbackBursts.length !== current.feedbackBursts.length;

      const notes = current.notes.map((noteRuntime) => {
        const next = { ...noteRuntime };
        if (next.status !== 'active' || !isInsideNote(point, next.note)) {
          return next;
        }

        if (!isOrderedNoteReady(next, current.notes)) {
          return next;
        }

        if (next.note.type === 'tap' || next.note.type === 'ordered-chain') {
          markHit(next, stats, feedbackBursts, simTime);
          changed = true;
          return next;
        }

        if (next.note.type === 'repeat') {
          next.clickCount += 1;
          changed = true;
          if (next.clickCount >= next.note.requiredClicks) {
            markHit(next, stats, feedbackBursts, simTime);
          }
          return next;
        }

        if (next.note.type === 'hold') {
          next.pointerActive = true;
          changed = true;
          return next;
        }

        if (next.note.type === 'slider') {
          next.pointerActive = true;
          changed = true;
          return next;
        }

        if (next.note.type === 'spinner') {
          if (isInsideSpinnerZone(point, next.note, next.pointerActive)) {
            next.pointerActive = true;
            next.pointerAngle = Math.atan2(point.y - next.note.position.y, point.x - next.note.position.x);
            changed = true;
          }
        }

        return next;
      });

      if (!changed) {
        return current;
      }

      return {
        ...current,
        stats,
        notes,
        feedbackBursts,
      };
    });
  }, [enabled, simTime]);

  const handlePointerUp = useCallback((point: ChallengePoint): void => {
    pointerRef.current = { x: point.x, y: point.y, isDown: false };
    setChallenge((current) => ({
      ...current,
      notes: current.notes.map((noteRuntime) => (
        noteRuntime.pointerActive || noteRuntime.pointerAngle !== null
          ? { ...noteRuntime, pointerActive: false, pointerAngle: null }
          : noteRuntime
      )),
    }));
  }, []);

  const handlePointerLeave = useCallback((): void => {
    pointerRef.current = { x: -9999, y: -9999, isDown: false };
    setChallenge((current) => ({
      ...current,
      notes: current.notes.map((noteRuntime) => (
        noteRuntime.pointerActive || noteRuntime.pointerAngle !== null
          ? { ...noteRuntime, pointerActive: false, pointerAngle: null }
          : noteRuntime
      )),
    }));
  }, []);

  const handleKeyChord = useCallback((chord: string): boolean => {
    if (!enabled) {
      return false;
    }

    let consumed = false;

    setChallenge((current) => {
      const stats = cloneStats(current.stats);
      const feedbackBursts = current.feedbackBursts.filter((feedback) => feedback.expiresAt > simTime);

      const notes = current.notes.map((noteRuntime) => {
        if (
          noteRuntime.status !== 'active'
          || (noteRuntime.note.type !== 'hover-key' && noteRuntime.note.type !== 'repeat-key')
        ) {
          return noteRuntime;
        }

        if (!isInsideNote(pointerRef.current, noteRuntime.note) || noteRuntime.note.requiredKey !== chord) {
          return noteRuntime;
        }

        consumed = true;
        const next = { ...noteRuntime };
        if (next.note.type === 'repeat-key') {
          next.clickCount += 1;
          if (next.clickCount >= next.note.requiredPresses) {
            markHit(next, stats, feedbackBursts, simTime);
          }
          return next;
        }

        markHit(next, stats, feedbackBursts, simTime);
        return next;
      });

      if (!consumed) {
        return current;
      }

      return {
        ...current,
        stats,
        notes,
        feedbackBursts,
      };
    });

    return consumed;
  }, [enabled, simTime]);

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
