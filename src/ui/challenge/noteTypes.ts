import type { ChallengeDifficulty, ChallengeSpawnCadenceMultiplier } from '@ui/state/trainerSettings';

export type ChallengeNoteType = 'tap' | 'ordered-chain' | 'slider' | 'hold' | 'repeat' | 'hover-key' | 'spinner';
export type ChallengeNoteStatus = 'pending' | 'active' | 'hit' | 'missed';
export type ChallengeHitGrade = 'Perfect' | 'Great' | 'Good';

export interface ChallengePoint {
  x: number;
  y: number;
}

export interface ChallengePlayfield {
  width: number;
  height: number;
}

interface ChallengeBaseNote {
  id: string;
  type: ChallengeNoteType;
  startTime: number;
  endTime: number;
  position: ChallengePoint;
  radius: number;
  damageOnMiss: number;
}

export interface TapChallengeNote extends ChallengeBaseNote {
  type: 'tap';
}

export interface OrderedChainChallengeNote extends ChallengeBaseNote {
  type: 'ordered-chain';
  chainId: string;
  orderIndex: number;
  totalSteps: number;
}

export interface LinearSliderPath {
  kind: 'line';
  start: ChallengePoint;
  end: ChallengePoint;
}

export interface ArcSliderPath {
  kind: 'arc';
  center: ChallengePoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
  start: ChallengePoint;
  end: ChallengePoint;
}

export type SliderPath = LinearSliderPath | ArcSliderPath;

export interface SliderChallengeNote extends ChallengeBaseNote {
  type: 'slider';
  sliderPath: SliderPath;
  travelDuration: number;
  sequenceId?: string;
  orderIndex?: number;
  totalSteps?: number;
}

export interface HoldChallengeNote extends ChallengeBaseNote {
  type: 'hold';
  holdDuration: number;
}

export interface RepeatChallengeNote extends ChallengeBaseNote {
  type: 'repeat';
  requiredClicks: number;
}

export interface HoverKeyChallengeNote extends ChallengeBaseNote {
  type: 'hover-key';
  requiredKey: string;
}

export interface SpinnerChallengeNote extends ChallengeBaseNote {
  type: 'spinner';
  spinDuration: number;
  requiredRotation: number;
}

export type ChallengeNote =
  | TapChallengeNote
  | OrderedChainChallengeNote
  | SliderChallengeNote
  | HoldChallengeNote
  | RepeatChallengeNote
  | HoverKeyChallengeNote
  | SpinnerChallengeNote;

export interface ChallengeNoteRuntime {
  note: ChallengeNote;
  status: ChallengeNoteStatus;
  progress: number;
  clickCount: number;
  pointerActive: boolean;
  pointerAngle: number | null;
  hitGrade: ChallengeHitGrade | null;
}

export interface ChallengeFeedbackBurst {
  id: string;
  text: ChallengeHitGrade;
  position: ChallengePoint;
  createdAt: number;
  expiresAt: number;
}

export interface ChallengeStats {
  hits: number;
  misses: number;
  currentStreak: number;
  maxStreak: number;
  hitsByType: Record<ChallengeNoteType, number>;
  missesByType: Record<ChallengeNoteType, number>;
  hitsByGrade: Record<ChallengeHitGrade, number>;
}

export interface ChallengeStateSnapshot {
  difficulty: ChallengeDifficulty;
  seed: number;
  health: number;
  maxHealth: number;
  isFailed: boolean;
  validKeys: string[];
  spawnCadenceMultiplier: ChallengeSpawnCadenceMultiplier;
  stats: ChallengeStats;
  notes: ChallengeNoteRuntime[];
  feedbackBursts: ChallengeFeedbackBurst[];
}

export const CHALLENGE_PLAYFIELD: ChallengePlayfield = {
  width: 760,
  height: 420,
};

export const DEFAULT_HOVER_KEY_POOL = ['w', 'a', 's', 'd'] as const;
export const CHALLENGE_FEEDBACK_DURATION = 0.9;

export interface ChallengeSequenceInfo {
  sequenceId: string;
  orderIndex: number;
  totalSteps: number;
}

/**
 * Returns the sequencing metadata for notes that are part of an ordered challenge combo.
 */
export function getChallengeSequenceInfo(note: ChallengeNote): ChallengeSequenceInfo | null {
  if (note.type === 'ordered-chain') {
    return {
      sequenceId: note.chainId,
      orderIndex: note.orderIndex,
      totalSteps: note.totalSteps,
    };
  }

  if (
    note.type === 'slider'
    && note.sequenceId !== undefined
    && note.orderIndex !== undefined
    && note.totalSteps !== undefined
  ) {
    return {
      sequenceId: note.sequenceId,
      orderIndex: note.orderIndex,
      totalSteps: note.totalSteps,
    };
  }

  return null;
}

export function createEmptyChallengeStats(): ChallengeStats {
  return {
    hits: 0,
    misses: 0,
    currentStreak: 0,
    maxStreak: 0,
    hitsByType: {
      tap: 0,
      'ordered-chain': 0,
      slider: 0,
      hold: 0,
      repeat: 0,
      'hover-key': 0,
      spinner: 0,
    },
    missesByType: {
      tap: 0,
      'ordered-chain': 0,
      slider: 0,
      hold: 0,
      repeat: 0,
      'hover-key': 0,
      spinner: 0,
    },
    hitsByGrade: {
      Perfect: 0,
      Great: 0,
      Good: 0,
    },
  };
}
