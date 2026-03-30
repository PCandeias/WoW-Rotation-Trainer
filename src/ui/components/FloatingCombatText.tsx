import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';

export interface DamageEvent {
  id: string;
  spellId?: string;
  amount: number;
  isCrit: boolean;
  x: number;
  y: number;
  spawnedAt: number;
  opacity?: number;
}

export interface FloatingCombatTextProps {
  events: DamageEvent[];
  anchorPosition?: {
    xPct: number;
    yPct: number;
  };
}

const DEFAULT_ANCHOR_POSITION = {
  xPct: 50,
  yPct: 30,
} as const;

/**
 * FloatingCombatText — renders floating damage numbers that rise and fade away.
 *
 * Displays each DamageEvent as a positioned text element. Crits are larger
 * and gold, normal hits are white. Crit amounts are wrapped in ✦ symbols.
 */
export function FloatingCombatText({ events, anchorPosition = DEFAULT_ANCHOR_POSITION }: FloatingCombatTextProps): React.ReactElement {
  const horizontalOffset = anchorPosition.xPct - DEFAULT_ANCHOR_POSITION.xPct;
  const verticalOffset = DEFAULT_ANCHOR_POSITION.yPct - anchorPosition.yPct;
  const containerStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'hidden',
  };

  return (
    <div style={containerStyle}>
      {events.map((event) => {
        const ageMs = Math.max(0, Date.now() - event.spawnedAt);
        const progress = Math.min(1, ageMs / 1500);
        const risePx = progress * 26;
        const driftPx = (event.x - 50) * 0.18;
        const anchoredX = event.x + horizontalOffset;
        const anchoredY = event.y + verticalOffset;
        const eventStyle: CSSProperties = {
          position: 'absolute',
          left: `${anchoredX}%`,
          bottom: `${anchoredY}%`,
          fontSize: event.isCrit ? '22px' : '16px',
          color: event.isCrit ? T.dmgCrit : T.dmgNormal,
          fontWeight: 700,
          fontFamily: FONTS.ui,
          textShadow: event.isCrit
            ? '0 0 5px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.95), 0 0 8px rgba(255,221,0,0.2)'
            : '0 0 4px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.95)',
          opacity: (event.opacity ?? 1) * (1 - progress),
          transform: `translate(${driftPx.toFixed(1)}px, ${(-risePx).toFixed(1)}px) scale(${event.isCrit ? 1.06 - progress * 0.08 : 1})`,
          transformOrigin: 'center bottom',
          whiteSpace: 'nowrap',
        };

        const formattedAmount = event.amount.toLocaleString();
        const text = event.isCrit
          ? `✦${formattedAmount}✦`
          : formattedAmount;

        return (
          <div
            key={event.id}
            data-testid={`fct-event-${event.id}`}
            style={eventStyle}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}

export default FloatingCombatText;
