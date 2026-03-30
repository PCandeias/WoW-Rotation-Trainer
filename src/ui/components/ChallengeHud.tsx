import React from 'react';
import type { CSSProperties } from 'react';
import { FONTS, T } from '@ui/theme/elvui';
import { buildHudFrameStyle } from '@ui/theme/stylePrimitives';
import type { ChallengeDifficulty } from '@ui/state/trainerSettings';
import type { ChallengeStats } from '@ui/challenge/noteTypes';

interface ChallengeHudProps {
  difficulty: ChallengeDifficulty;
  validKeys: string[];
  stats: ChallengeStats;
  showStats?: boolean;
}

export function ChallengeHud({
  difficulty,
  validKeys,
  stats,
  showStats = true,
}: ChallengeHudProps): React.ReactElement {
  const root: CSSProperties = {
    position: 'absolute',
    left: 18,
    bottom: 18,
    width: 268,
    ...buildHudFrameStyle({ highlighted: difficulty === 'hard' }),
    padding: '14px 16px',
    zIndex: 3,
  };

  const statRow: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    marginTop: 12,
    color: T.text,
    fontFamily: FONTS.ui,
    fontSize: '0.75rem',
  };

  return (
    <div style={root} data-testid="challenge-hud">
      {showStats && (
        <div style={statRow}>
          <div>Hits: {stats.hits}</div>
          <div>Misses: {stats.misses}</div>
          <div>Streak: {stats.currentStreak}</div>
          <div>Best: {stats.maxStreak}</div>
        </div>
      )}
      <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', marginTop: 10 }}>
        Prompt Keys · {validKeys.map((key) => key.toUpperCase()).join(', ')}
      </div>
    </div>
  );
}
