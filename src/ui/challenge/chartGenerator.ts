import type { ChallengeDifficulty } from '@ui/state/trainerSettings';
import {
  CHALLENGE_PLAYFIELD,
  DEFAULT_HOVER_KEY_POOL,
  type ChallengeNote,
  type ChallengePlayfield,
  type ChallengePoint,
} from './noteTypes';

const NOTE_DAMAGE: Record<ChallengeNote['type'], number> = {
  tap: 10,
  'ordered-chain': 10,
  slider: 12,
  hold: 10,
  repeat: 12,
  'hover-key': 14,
};

const BASE_SEGMENT_GAP = 3.6;
const BASE_HOLD_DURATION = 0.5;
const BASE_SLIDER_TRAVEL_DURATION = 1;
const MIN_NODE_DISTANCE = 90;

const POSITION_ANCHORS: ChallengePoint[] = [
  { x: 120, y: 90 },
  { x: 240, y: 120 },
  { x: 340, y: 90 },
  { x: 460, y: 120 },
  { x: 560, y: 90 },
  { x: 170, y: 200 },
  { x: 300, y: 190 },
  { x: 430, y: 210 },
  { x: 540, y: 210 },
  { x: 220, y: 295 },
  { x: 340, y: 290 },
  { x: 470, y: 290 },
];

interface ChartGeneratorOptions {
  difficulty: ChallengeDifficulty;
  duration: number;
  seed: number;
  validKeys?: readonly string[];
  disappearSpeedMultiplier?: number;
  playfield?: ChallengePlayfield;
}

interface SeededRng {
  next: () => number;
  nextInt: (max: number) => number;
}

function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0;
  const nextValue = (): number => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };

  return {
    next: nextValue,
    nextInt: (max: number) => Math.floor(nextValue() * max),
  };
}

function clampPosition(point: ChallengePoint, playfield: ChallengePlayfield): ChallengePoint {
  return {
    x: Math.max(70, Math.min(playfield.width - 70, point.x)),
    y: Math.max(70, Math.min(playfield.height - 70, point.y)),
  };
}

function pickAnchor(rng: SeededRng, playfield: ChallengePlayfield): ChallengePoint {
  const anchor = POSITION_ANCHORS[rng.nextInt(POSITION_ANCHORS.length)] ?? POSITION_ANCHORS[0];
  return clampPosition(anchor, playfield);
}

function distanceBetweenPoints(left: ChallengePoint, right: ChallengePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function pickAnchorWithMinDistance(
  rng: SeededRng,
  playfield: ChallengePlayfield,
  existingPoints: readonly ChallengePoint[],
  minimumDistance: number,
): ChallengePoint {
  for (let attempt = 0; attempt < POSITION_ANCHORS.length * 3; attempt += 1) {
    const candidate = pickAnchor(rng, playfield);
    if (existingPoints.every((point) => distanceBetweenPoints(point, candidate) >= minimumDistance)) {
      return candidate;
    }
  }

  return pickAnchor(rng, playfield);
}

export function generateChallengeChart({
  difficulty,
  duration,
  seed,
  validKeys = DEFAULT_HOVER_KEY_POOL,
  disappearSpeedMultiplier = 1,
  playfield = CHALLENGE_PLAYFIELD,
}: ChartGeneratorOptions): ChallengeNote[] {
  const keyPool = validKeys.length > 0 ? validKeys : DEFAULT_HOVER_KEY_POOL;
  const rng = createSeededRng(seed);
  const notes: ChallengeNote[] = [];
  let noteId = 0;
  let hoverKeyIndex = 0;
  const scaleLifetime = (value: number, minimum = 0.85): number => Math.max(minimum, value / disappearSpeedMultiplier);

  const pushTap = (startTime: number, lifetime: number): void => {
    notes.push({
      id: `note-${noteId += 1}`,
      type: 'tap',
      startTime,
      endTime: startTime + lifetime,
      position: pickAnchor(rng, playfield),
      radius: 28,
      damageOnMiss: difficulty === 'easy' ? 10 : 8,
    });
  };

  if (difficulty === 'easy') {
    for (let time = 1.25; time < duration - 0.5;) {
      const lifetime = scaleLifetime(1.75, 1.1);
      pushTap(time, lifetime);
      const nextGap = 1.6 + rng.next() * 0.6;
      time += Math.max(nextGap, lifetime);
    }
    return notes;
  }

  const mechanicCycle: ChallengeNote['type'][] = ['tap', 'ordered-chain', 'slider', 'hold', 'repeat', 'hover-key'];
  let segmentStart = 1.5;

  for (let segmentIndex = 0; ; segmentIndex += 1) {
    if (segmentStart >= duration - 1) {
      break;
    }

    const mechanic = mechanicCycle[segmentIndex % mechanicCycle.length] ?? 'tap';
    let segmentEnd = segmentStart;

    if (mechanic === 'tap') {
      const lifetime = scaleLifetime(1.45, 1);
      pushTap(segmentStart, lifetime);
      pushTap(segmentStart + 0.6, lifetime);
      segmentEnd = segmentStart + 0.6 + lifetime;
      segmentStart += Math.max(BASE_SEGMENT_GAP, segmentEnd - segmentStart);
      continue;
    }

    if (mechanic === 'ordered-chain') {
      const chainId = `chain-${noteId + 1}`;
      const positions = Array.from({ length: 3 }, () => null as ChallengePoint | null).map((_, index, all) => (
        pickAnchorWithMinDistance(
          rng,
          playfield,
          all.slice(0, index).filter((point): point is ChallengePoint => point !== null),
          MIN_NODE_DISTANCE,
        )
      ));
      const lifetime = scaleLifetime(1.7, 1.1);
      positions.forEach((position, orderIndex) => {
        const startTime = segmentStart + orderIndex * 0.45;
        notes.push({
          id: `note-${noteId += 1}`,
          type: 'ordered-chain',
          chainId,
          orderIndex,
          startTime,
          endTime: startTime + lifetime,
          position,
          radius: 26,
          damageOnMiss: NOTE_DAMAGE['ordered-chain'],
        });
      });
      segmentEnd = segmentStart + 0.9 + lifetime;
      segmentStart += Math.max(BASE_SEGMENT_GAP, segmentEnd - segmentStart);
      continue;
    }

    if (mechanic === 'slider') {
      const start = pickAnchor(rng, playfield);
      const end = pickAnchorWithMinDistance(rng, playfield, [start], MIN_NODE_DISTANCE);
      const lifetime = scaleLifetime(2.15, BASE_SLIDER_TRAVEL_DURATION + 0.6);
      notes.push({
        id: `note-${noteId += 1}`,
        type: 'slider',
        startTime: segmentStart,
        endTime: segmentStart + lifetime,
        position: start,
        radius: 24,
        damageOnMiss: NOTE_DAMAGE.slider,
        path: [start, end],
        travelDuration: BASE_SLIDER_TRAVEL_DURATION,
      });
      segmentEnd = segmentStart + lifetime;
      segmentStart += Math.max(BASE_SEGMENT_GAP, segmentEnd - segmentStart);
      continue;
    }

    if (mechanic === 'hold') {
      const lifetime = scaleLifetime(2.05, BASE_HOLD_DURATION + 0.6);
      notes.push({
        id: `note-${noteId += 1}`,
        type: 'hold',
        startTime: segmentStart,
        endTime: segmentStart + lifetime,
        position: pickAnchor(rng, playfield),
        radius: 28,
        damageOnMiss: NOTE_DAMAGE.hold,
        holdDuration: BASE_HOLD_DURATION,
      });
      segmentEnd = segmentStart + lifetime;
      segmentStart += Math.max(BASE_SEGMENT_GAP, segmentEnd - segmentStart);
      continue;
    }

    if (mechanic === 'repeat') {
      const lifetime = scaleLifetime(1.85, 1.05);
      notes.push({
        id: `note-${noteId += 1}`,
        type: 'repeat',
        startTime: segmentStart,
        endTime: segmentStart + lifetime,
        position: pickAnchor(rng, playfield),
        radius: 28,
        damageOnMiss: NOTE_DAMAGE.repeat,
        requiredClicks: 3,
      });
      segmentEnd = segmentStart + lifetime;
      segmentStart += Math.max(BASE_SEGMENT_GAP, segmentEnd - segmentStart);
      continue;
    }

    const lifetime = scaleLifetime(1.85, 1.05);
    notes.push({
      id: `note-${noteId += 1}`,
      type: 'hover-key',
      startTime: segmentStart,
      endTime: segmentStart + lifetime,
      position: pickAnchor(rng, playfield),
      radius: 28,
      damageOnMiss: NOTE_DAMAGE['hover-key'],
      requiredKey: keyPool[hoverKeyIndex % keyPool.length] ?? DEFAULT_HOVER_KEY_POOL[0],
    });
    hoverKeyIndex += 1;
    segmentEnd = segmentStart + lifetime;
    segmentStart += Math.max(BASE_SEGMENT_GAP, segmentEnd - segmentStart);
  }

  return notes;
}
