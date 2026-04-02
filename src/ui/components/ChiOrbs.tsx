import React from 'react';
import { T, SIZES } from '@ui/theme/elvui';
import { SegmentedResourceBar } from './SegmentedResourceBar';

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
  return (
    <SegmentedResourceBar
      current={current}
      max={max}
      width={width}
      height={height}
      glowColor={T.chi}
      testIdPrefix="chi-orb"
    />
  );
}

export default ChiOrbs;
