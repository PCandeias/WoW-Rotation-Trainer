import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { buildHudFrameStyle } from '@ui/theme/stylePrimitives';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { getResourcePresentationForProfileSpec } from '@ui/specs/specResourcePresentation';
import { ResourceBar } from './ResourceBar';
import { SegmentedResourceBar } from './SegmentedResourceBar';

export interface PlayerFrameProps {
  gameState: GameStateSnapshot;
  currentTime: number;
  profileSpec?: string;
  healthOverride?: {
    current: number;
    max: number;
  };
  /** Player name/class label. Default: "Windwalker" */
  playerName?: string;
  /**
   * When true (default), render chi orbs and energy bar inline.
   * Set to false when using a detached EnergyChiDisplay.
   */
  showResources?: boolean;
}

/**
 * PlayerFrame — ElvUI-style player unit frame.
 *
 * Displays the player's name, chi orbs, HP bar, and energy bar
 * with the current energy value calculated from regen rate.
 */
export function PlayerFrame({
  gameState,
  currentTime,
  profileSpec = 'monk',
  healthOverride,
  playerName = 'Windwalker',
  showResources = true,
}: PlayerFrameProps): React.ReactElement {
  const resourcePresentation = getResourcePresentationForProfileSpec(profileSpec);
  const topResource = resourcePresentation.top;
  const bottomResource = resourcePresentation.bottom;

  const panelStyle: CSSProperties = {
    ...buildHudFrameStyle({ highlighted: true }),
    padding: '8px 10px',
    width: '260px',
    borderRadius: 4,
  };

  const nameRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: '4px',
  };

  const nameStyle: CSSProperties = {
    fontSize: '11px',
    color: resourcePresentation.accentColor,
    fontFamily: FONTS.ui,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  const healthCurrent = healthOverride?.current ?? 100;
  const healthMax = healthOverride?.max ?? 100;
  const healthPercent = healthMax > 0 ? Math.round((healthCurrent / healthMax) * 100) : 0;
  return (
    <div style={panelStyle}>
      <div style={nameRowStyle}>
        <span style={nameStyle}>{playerName}</span>
      </div>
      <div data-testid="player-hp-bar">
        <ResourceBar
          value={healthCurrent}
          max={healthMax}
          color={T.health}
          height={14}
          valueText={`${healthPercent}%`}
        />
      </div>
      {showResources && (
        <>
          <div style={{ height: '3px' }} />
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
            <div style={{ marginTop: topResource ? '-1px' : undefined }}>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PlayerFrame;
