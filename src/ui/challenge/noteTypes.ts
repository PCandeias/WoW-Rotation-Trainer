import type { ChallengeDifficulty } from '@ui/state/trainerSettings';

export type ChallengeNoteType = 'tap' | 'ordered-chain' | 'slider' | 'hold' | 'repeat' | 'hover-key';
export type ChallengeNoteStatus = 'pending' | 'active' | 'hit' | 'missed';

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
}

export interface SliderChallengeNote extends ChallengeBaseNote {
  type: 'slider';
  path: ChallengePoint[];
  travelDuration: number;
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

export type ChallengeNote =
  | TapChallengeNote
  | OrderedChainChallengeNote
  | SliderChallengeNote
  | HoldChallengeNote
  | RepeatChallengeNote
  | HoverKeyChallengeNote;

export interface ChallengeNoteRuntime {
  note: ChallengeNote;
  status: ChallengeNoteStatus;
  progress: number;
  clickCount: number;
  pointerActive: boolean;
}

export interface ChallengeStats {
  hits: number;
  misses: number;
  currentStreak: number;
  maxStreak: number;
  hitsByType: Record<ChallengeNoteType, number>;
  missesByType: Record<ChallengeNoteType, number>;
}

export interface ChallengeStateSnapshot {
  difficulty: ChallengeDifficulty;
  seed: number;
  health: number;
  maxHealth: number;
  isFailed: boolean;
  validKeys: string[];
  stats: ChallengeStats;
  notes: ChallengeNoteRuntime[];
}

export const CHALLENGE_PLAYFIELD: ChallengePlayfield = {
  width: 760,
  height: 420,
};

export const DEFAULT_HOVER_KEY_POOL = ['w', 'a', 's', 'd'] as const;

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
    },
    missesByType: {
      tap: 0,
      'ordered-chain': 0,
      slider: 0,
      hold: 0,
      repeat: 0,
      'hover-key': 0,
    },
  };
}
