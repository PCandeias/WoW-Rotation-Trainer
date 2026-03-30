import React from 'react';
import type { CSSProperties } from 'react';
import { T, SIZES } from '@ui/theme/elvui';

export interface ChiOrbsProps {
  current: number;
  max?: number;
  width?: number | string;
  height?: number;
}

/**
 * ChiOrbs — displays the current chi resource as connected segments.
 */
export function ChiOrbs({
  current,
  max = 6,
  width,
  height = SIZES.chiOrb,
}: ChiOrbsProps): React.ReactElement {
  const clampedCurrent = Math.max(0, Math.min(current, max));
  const containerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${Math.max(1, max)}, minmax(0, 1fr))`,
    width: typeof width === 'number' ? `${width}px` : (width ?? `${Math.max(1, max) * 18}px`),
    height: `${height}px`,
    border: '1px solid #193548',
    background: '#07131e',
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  };

  return (
    <div data-testid="chi-orb-track" style={containerStyle}>
      {Array.from({ length: max }, (_, i) => {
        const isActive = i < clampedCurrent;
        return (
          <div
            key={i}
            data-testid={isActive ? 'chi-orb-active' : 'chi-orb-inactive'}
            style={{
              height: '100%',
              background: isActive
                ? 'linear-gradient(180deg, #cbd571 0%, #b7c055 45%, #9ea83d 100%)'
                : 'linear-gradient(180deg, #0f2436 0%, #091421 100%)',
              borderLeft: i === 0 ? undefined : '1px solid #173245',
              boxShadow: isActive ? `inset 0 1px 0 rgba(255,255,255,0.14), 0 0 6px ${T.chi}22` : undefined,
              transition: 'background 0.2s ease',
            }}
          />
        );
      })}
    </div>
  );
}

export default ChiOrbs;
