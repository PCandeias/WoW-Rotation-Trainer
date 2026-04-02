import React from 'react';
import type { CSSProperties } from 'react';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { getResourcePresentationForProfileSpec } from '@ui/specs/specResourcePresentation';
import { ResourceBar } from './ResourceBar';
import { SegmentedResourceBar } from './SegmentedResourceBar';

export interface EnergyChiDisplayProps {
  gameState: GameStateSnapshot;
  currentTime: number;
  profileSpec?: string;
  /** Width of the display panel in px. Default: 220 */
  width?: number;
}

/**
 * EnergyChiDisplay — detached spec-aware resource display.
 */
export function EnergyChiDisplay({
  gameState,
  currentTime,
  profileSpec = 'monk',
  width = 220,
}: EnergyChiDisplayProps): React.ReactElement {
  const resourcePresentation = getResourcePresentationForProfileSpec(profileSpec);
  const topResource = resourcePresentation.top;
  const bottomResource = resourcePresentation.bottom;

  const panel: CSSProperties = {
    width: `${width}px`,
    display: 'grid',
    gap: '2px',
  };

  return (
    <div style={panel} data-testid="energy-chi-display">
      {topResource && (
        <SegmentedResourceBar
          current={topResource.current(gameState)}
          max={topResource.max(gameState)}
          width="100%"
          height={14}
          activeGradient={topResource.activeGradient}
          inactiveGradient={topResource.inactiveGradient}
          borderColor={topResource.borderColor}
          backgroundColor={topResource.backgroundColor}
          glowColor={topResource.glowColor}
          testIdPrefix={topResource.testIdPrefix}
        />
      )}
      {bottomResource && (
        <ResourceBar
          value={bottomResource.current(gameState, currentTime)}
          max={bottomResource.max(gameState, currentTime)}
          color={bottomResource.color}
          height={14}
          label={bottomResource.label}
          showValueText={bottomResource.showValueText}
          valueText={bottomResource.valueText?.(
            bottomResource.current(gameState, currentTime),
            bottomResource.max(gameState, currentTime),
          )}
          transitionMs={120}
          trackColor={bottomResource.trackColor}
          borderColor={bottomResource.borderColor}
          trackStyle={bottomResource.trackStyle}
          fillStyle={bottomResource.fillStyle}
          valueTextStyle={bottomResource.valueTextStyle}
        />
      )}
    </div>
  );
}

export default EnergyChiDisplay;
