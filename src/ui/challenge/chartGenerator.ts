import type { ChallengeDifficulty, ChallengeSpawnCadenceMultiplier } from '@ui/state/trainerSettings';
import {
  CHALLENGE_PLAYFIELD,
  DEFAULT_HOVER_KEY_POOL,
  type ArcSliderPath,
  type ChallengeNote,
  type ChallengePlayfield,
  type ChallengePoint,
  type SliderPath,
} from './noteTypes';

const NOTE_DAMAGE: Record<ChallengeNote['type'], number> = {
  tap: 10,
  'ordered-chain': 10,
  slider: 12,
  hold: 10,
  repeat: 12,
  'hover-key': 14,
  spinner: 16,
};

const BASE_HOLD_DURATION = 0.5;
const BASE_SLIDER_TRAVEL_DURATION = 1;
const BASE_SPINNER_DURATION = 1.45;
const MIN_NODE_DISTANCE = 90;
const MIN_TAP_DISTANCE = 72;
const MIN_GAP = 0.6;

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
  spawnCadenceMultiplier?: ChallengeSpawnCadenceMultiplier;
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
  for (let attempt = 0; attempt < POSITION_ANCHORS.length * 4; attempt += 1) {
    const candidate = pickAnchor(rng, playfield);
    if (existingPoints.every((point) => distanceBetweenPoints(point, candidate) >= minimumDistance)) {
      return candidate;
    }
  }

  return POSITION_ANCHORS
    .map((anchor) => clampPosition(anchor, playfield))
    .reduce<ChallengePoint>((best, candidate) => {
      const candidateDistance = existingPoints.length === 0
        ? Number.POSITIVE_INFINITY
        : Math.min(...existingPoints.map((point) => distanceBetweenPoints(point, candidate)));
      const bestDistance = existingPoints.length === 0
        ? Number.NEGATIVE_INFINITY
        : Math.min(...existingPoints.map((point) => distanceBetweenPoints(point, best)));
      return candidateDistance > bestDistance ? candidate : best;
    }, clampPosition(POSITION_ANCHORS[rng.nextInt(POSITION_ANCHORS.length)] ?? POSITION_ANCHORS[0], playfield));
}

function shuffle<T>(rng: SeededRng, values: readonly T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const current = copy[index];
    const swapValue = copy[swapIndex];
    if (current === undefined || swapValue === undefined) {
      continue;
    }

    copy[index] = swapValue;
    copy[swapIndex] = current;
  }
  return copy;
}

function scaleSpawnGap(baseGap: number, spawnCadenceMultiplier: ChallengeSpawnCadenceMultiplier): number {
  return Math.max(MIN_GAP, baseGap / spawnCadenceMultiplier);
}

function takeNextMechanic(
  mechanicBag: ChallengeNote['type'][],
  predicate: (mechanic: ChallengeNote['type']) => boolean,
): ChallengeNote['type'] | null {
  for (let index = mechanicBag.length - 1; index >= 0; index -= 1) {
    const candidate = mechanicBag[index];
    if (!candidate || !predicate(candidate)) {
      continue;
    }

    mechanicBag.splice(index, 1);
    return candidate;
  }

  return null;
}

function pointOnCircle(center: ChallengePoint, radius: number, angle: number): ChallengePoint {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function pickFreePoint(rng: SeededRng, playfield: ChallengePlayfield, margin: number): ChallengePoint {
  return {
    x: margin + rng.next() * Math.max(1, playfield.width - margin * 2),
    y: margin + rng.next() * Math.max(1, playfield.height - margin * 2),
  };
}

function createCircularSliderPath(rng: SeededRng, playfield: ChallengePlayfield): ArcSliderPath {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const radius = 72 + rng.next() * 32;
    const center = pickFreePoint(rng, playfield, radius + 56);
    const startAngle = rng.next() * Math.PI * 2;
    const sweep = (Math.PI / 2) + rng.next() * (Math.PI * 0.55);
    const clockwise = rng.next() < 0.5;
    const endAngle = clockwise ? startAngle - sweep : startAngle + sweep;
    const start = pointOnCircle(center, radius, startAngle);
    const end = pointOnCircle(center, radius, endAngle);

    if (distanceBetweenPoints(start, end) >= MIN_NODE_DISTANCE) {
      return {
        kind: 'arc',
        center,
        radius,
        startAngle,
        endAngle,
        clockwise,
        start,
        end,
      };
    }
  }

  const fallbackCenter = { x: playfield.width * 0.5, y: playfield.height * 0.5 };
  const fallbackRadius = 84;
  return {
    kind: 'arc',
    center: fallbackCenter,
    radius: fallbackRadius,
    startAngle: Math.PI,
    endAngle: Math.PI * 0.15,
    clockwise: false,
    start: pointOnCircle(fallbackCenter, fallbackRadius, Math.PI),
    end: pointOnCircle(fallbackCenter, fallbackRadius, Math.PI * 0.15),
  };
}

function createSliderPath(
  rng: SeededRng,
  playfield: ChallengePlayfield,
  existingStarts: readonly ChallengePoint[] = [],
  preferCircular = false,
): SliderPath {
  if (preferCircular || rng.next() < 0.45) {
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const sliderPath = createCircularSliderPath(rng, playfield);
      if (existingStarts.every((point) => distanceBetweenPoints(point, sliderPath.start) >= MIN_NODE_DISTANCE)) {
        return sliderPath;
      }
    }
  }

  const start = pickAnchorWithMinDistance(rng, playfield, existingStarts, MIN_NODE_DISTANCE);
  const end = pickAnchorWithMinDistance(rng, playfield, [start], MIN_NODE_DISTANCE);
  return {
    kind: 'line',
    start,
    end,
  };
}

export function generateChallengeChart({
  difficulty,
  duration,
  seed,
  validKeys = DEFAULT_HOVER_KEY_POOL,
  spawnCadenceMultiplier = 1,
  playfield = CHALLENGE_PLAYFIELD,
}: ChartGeneratorOptions): ChallengeNote[] {
  const keyPool = validKeys.length > 0 ? validKeys : DEFAULT_HOVER_KEY_POOL;
  const rng = createSeededRng(seed);
  const notes: ChallengeNote[] = [];
  let noteId = 0;
  let hoverKeyIndex = 0;

  const pushTap = (startTime: number, lifetime: number, position?: ChallengePoint): void => {
    notes.push({
      id: `note-${noteId += 1}`,
      type: 'tap',
      startTime,
      endTime: startTime + lifetime,
      position: position ?? pickAnchor(rng, playfield),
      radius: 28,
      damageOnMiss: difficulty === 'easy' ? 10 : 8,
    });
  };

  if (difficulty === 'easy') {
    for (let time = 1.05; time < duration - 0.6;) {
      const burstCount = 1 + rng.nextInt(5);
      const burstSpacing = 0.34 + rng.next() * 0.14;
      const burstPoints: ChallengePoint[] = [];
      const lifetime = 1.7;

      for (let index = 0; index < burstCount; index += 1) {
        const startTime = time + (index * burstSpacing);
        if (startTime >= duration - 0.3) {
          break;
        }

        const position = pickAnchorWithMinDistance(rng, playfield, burstPoints, MIN_TAP_DISTANCE);
        burstPoints.push(position);
        pushTap(startTime, lifetime, position);
      }

      time += scaleSpawnGap(2.35 + rng.next() * 0.5, spawnCadenceMultiplier);
    }
    return notes;
  }

  const mechanicBagSeed: ChallengeNote['type'][] = ['tap', 'ordered-chain', 'slider', 'hold', 'repeat', 'hover-key'];
  let mechanicBag = shuffle(rng, mechanicBagSeed);
  let segmentStart = 1.35;
  let lastSpinnerStart = -999;
  let activeOrderedSequenceEndTime = -999;

  const nextMechanic = (): ChallengeNote['type'] => {
    const progressRatio = segmentStart / Math.max(duration, 1);
    const spinnerReady = progressRatio >= 0.6
      && segmentStart - lastSpinnerStart >= scaleSpawnGap(18, spawnCadenceMultiplier)
      && rng.next() < (0.08 + Math.max(0, progressRatio - 0.6) * 0.26);

    if (spinnerReady) {
      lastSpinnerStart = segmentStart;
      return 'spinner';
    }

    if (mechanicBag.length === 0) {
      mechanicBag = shuffle(rng, mechanicBagSeed);
    }

    const orderedSequenceAvailable = segmentStart >= activeOrderedSequenceEndTime;
    const nextFromBag = takeNextMechanic(
      mechanicBag,
      (mechanic) => orderedSequenceAvailable || mechanic !== 'ordered-chain',
    );

    if (nextFromBag) {
      return nextFromBag;
    }

    mechanicBag = shuffle(rng, mechanicBagSeed);
    return takeNextMechanic(
      mechanicBag,
      (mechanic) => orderedSequenceAvailable || mechanic !== 'ordered-chain',
    ) ?? 'tap';
  };

  while (segmentStart < duration - 0.75) {
    const mechanic = nextMechanic();

    if (mechanic === 'tap') {
      const burstCount = 2 + rng.nextInt(4);
      const burstSpacing = 0.32 + rng.next() * 0.12;
      const burstPoints: ChallengePoint[] = [];

      for (let index = 0; index < burstCount; index += 1) {
        const position = pickAnchorWithMinDistance(rng, playfield, burstPoints, MIN_TAP_DISTANCE);
        burstPoints.push(position);
        pushTap(segmentStart + (index * burstSpacing), 1.45, position);
      }

      segmentStart += scaleSpawnGap(2.4 + rng.next() * 0.5, spawnCadenceMultiplier);
      continue;
    }

    if (mechanic === 'ordered-chain') {
      const endsWithSlider = rng.next() < 0.45;
      const tapCount = endsWithSlider ? 2 + rng.nextInt(3) : 3 + rng.nextInt(3);
      const chainId = `chain-${noteId + 1}`;
      const positions: ChallengePoint[] = [];
      for (let index = 0; index < tapCount; index += 1) {
        positions.push(pickAnchorWithMinDistance(rng, playfield, positions, MIN_NODE_DISTANCE));
      }
      const stepSpacing = 0.33 + rng.next() * 0.1;
      const totalSteps = endsWithSlider ? tapCount + 1 : tapCount;

      positions.forEach((position, orderIndex) => {
        const startTime = segmentStart + (orderIndex * stepSpacing);
        notes.push({
          id: `note-${noteId += 1}`,
          type: 'ordered-chain',
          chainId,
          orderIndex,
          totalSteps,
          startTime,
          endTime: startTime + 1.7,
          position,
          radius: 26,
          damageOnMiss: NOTE_DAMAGE['ordered-chain'],
        });
      });

      if (endsWithSlider) {
        const sliderPath = createSliderPath(rng, playfield, positions, true);
        const sliderStartTime = segmentStart + (tapCount * stepSpacing);
        const sliderEndTime = sliderStartTime + 2.15;
        notes.push({
          id: `note-${noteId += 1}`,
          type: 'slider',
          startTime: sliderStartTime,
          endTime: sliderEndTime,
          position: sliderPath.start,
          radius: 24,
          damageOnMiss: NOTE_DAMAGE.slider,
          sliderPath,
          travelDuration: BASE_SLIDER_TRAVEL_DURATION,
          sequenceId: chainId,
          orderIndex: tapCount,
          totalSteps,
        });
        activeOrderedSequenceEndTime = sliderEndTime;
      } else {
        activeOrderedSequenceEndTime = segmentStart + ((tapCount - 1) * stepSpacing) + 1.7;
      }

      segmentStart += scaleSpawnGap((endsWithSlider ? 3.7 : 3.1) + rng.next() * 0.55, spawnCadenceMultiplier);
      continue;
    }

    if (mechanic === 'slider') {
      const sliderPath = createSliderPath(rng, playfield);

      notes.push({
        id: `note-${noteId += 1}`,
        type: 'slider',
        startTime: segmentStart,
        endTime: segmentStart + 2.15,
        position: sliderPath.start,
        radius: 24,
        damageOnMiss: NOTE_DAMAGE.slider,
        sliderPath,
        travelDuration: BASE_SLIDER_TRAVEL_DURATION,
      });
      segmentStart += scaleSpawnGap(3.2 + rng.next() * 0.55, spawnCadenceMultiplier);
      continue;
    }

    if (mechanic === 'hold') {
      notes.push({
        id: `note-${noteId += 1}`,
        type: 'hold',
        startTime: segmentStart,
        endTime: segmentStart + 2.05,
        position: pickAnchor(rng, playfield),
        radius: 28,
        damageOnMiss: NOTE_DAMAGE.hold,
        holdDuration: BASE_HOLD_DURATION,
      });
      segmentStart += scaleSpawnGap(2.95 + rng.next() * 0.4, spawnCadenceMultiplier);
      continue;
    }

    if (mechanic === 'repeat') {
      notes.push({
        id: `note-${noteId += 1}`,
        type: 'repeat',
        startTime: segmentStart,
        endTime: segmentStart + 1.9,
        position: pickAnchor(rng, playfield),
        radius: 28,
        damageOnMiss: NOTE_DAMAGE.repeat,
        requiredClicks: 2 + rng.nextInt(4),
      });
      segmentStart += scaleSpawnGap(2.75 + rng.next() * 0.35, spawnCadenceMultiplier);
      continue;
    }

    if (mechanic === 'hover-key') {
      notes.push({
        id: `note-${noteId += 1}`,
        type: 'hover-key',
        startTime: segmentStart,
        endTime: segmentStart + 1.9,
        position: pickAnchor(rng, playfield),
        radius: 28,
        damageOnMiss: NOTE_DAMAGE['hover-key'],
        requiredKey: keyPool[hoverKeyIndex % keyPool.length] ?? DEFAULT_HOVER_KEY_POOL[0],
      });
      hoverKeyIndex += 1;
      segmentStart += scaleSpawnGap(2.75 + rng.next() * 0.35, spawnCadenceMultiplier);
      continue;
    }

    notes.push({
      id: `note-${noteId += 1}`,
      type: 'spinner',
      startTime: segmentStart,
      endTime: segmentStart + 2.6,
      position: { x: playfield.width / 2, y: playfield.height / 2 },
      radius: 58,
      damageOnMiss: NOTE_DAMAGE.spinner,
      spinDuration: BASE_SPINNER_DURATION,
      requiredRotation: Math.PI * (5.5 + rng.next() * 1.5),
    });
    segmentStart += scaleSpawnGap(4.1 + rng.next() * 0.55, spawnCadenceMultiplier);
  }

  return notes;
}
