import React from 'react';
import type { CSSProperties } from 'react';
import { T, SIZES } from '@ui/theme/elvui';

export interface SegmentedResourceBarProps {
  current: number;
  max: number;
  width?: number | string;
  height?: number;
  activeGradient?: string;
  inactiveGradient?: string;
  borderColor?: string;
  backgroundColor?: string;
  glowColor?: string;
  testIdPrefix?: string;
}

/**
 * SegmentedResourceBar — displays a stacked resource as connected segments.
 */
export function SegmentedResourceBar({
  current,
  max,
  width,
  height = SIZES.chiOrb,
  activeGradient = 'linear-gradient(180deg, #cbd571 0%, #b7c055 45%, #9ea83d 100%)',
  inactiveGradient = 'linear-gradient(180deg, #0f2436 0%, #091421 100%)',
  borderColor = '#193548',
  backgroundColor = '#07131e',
  glowColor = T.chi,
  testIdPrefix = 'segmented-resource',
}: SegmentedResourceBarProps): React.ReactElement {
  const clampedMax = Math.max(1, max);
  const clampedCurrent = Math.max(0, Math.min(current, clampedMax));
  const containerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${clampedMax}, minmax(0, 1fr))`,
    width: typeof width === 'number' ? `${width}px` : (width ?? `${clampedMax * 18}px`),
    boxSizing: 'border-box',
    height: `${height}px`,
    border: `1px solid ${borderColor}`,
    background: backgroundColor,
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  };

  return (
    <div data-testid={`${testIdPrefix}-track`} style={containerStyle}>
      {Array.from({ length: clampedMax }, (_, index) => {
        const isActive = index < clampedCurrent;
        return (
          <div
            key={index}
            data-testid={isActive ? `${testIdPrefix}-active` : `${testIdPrefix}-inactive`}
            style={{
              height: '100%',
              background: isActive ? activeGradient : inactiveGradient,
              borderLeft: index === 0 ? undefined : `1px solid ${borderColor}`,
              boxShadow: isActive ? `inset 0 1px 0 rgba(255,255,255,0.14), 0 0 6px ${glowColor}22` : undefined,
              transition: 'background 0.2s ease',
            }}
          />
        );
      })}
    </div>
  );
}

export default SegmentedResourceBar;
