import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { buildHudFrameStyle } from '@ui/theme/stylePrimitives';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { ChiOrbs } from './ChiOrbs';
import { ResourceBar } from './ResourceBar';

export interface PlayerFrameProps {
  gameState: GameStateSnapshot;
  currentTime: number;
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
  healthOverride,
  playerName = 'Windwalker',
  showResources = true,
}: PlayerFrameProps): React.ReactElement {
  // Calculate current energy with regen
  const energyMax = gameState.energyMax;
  const currentEnergy = Math.floor(
    Math.min(
      energyMax,
      gameState.energyAtLastUpdate +
        gameState.energyRegenRate * (currentTime - gameState.energyLastUpdated)
    )
  );

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
    color: T.classMonk,
    fontFamily: FONTS.ui,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  const healthCurrent = healthOverride?.current ?? 100;
  const healthMax = healthOverride?.max ?? 100;
  const healthPercent = healthMax > 0 ? Math.round((healthCurrent / healthMax) * 100) : 0;
  const energyPercent = energyMax > 0 ? Math.round((currentEnergy / energyMax) * 100) : 0;

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
          <ChiOrbs current={gameState.chi} max={gameState.chiMax} width="100%" height={14} />
          <div style={{ height: '2px' }} />
          <ResourceBar
            value={currentEnergy}
            max={energyMax}
            color="#c2cb5f"
            height={14}
            valueText={`${energyPercent}%`}
            transitionMs={120}
            trackColor="#07131e"
            borderColor="#193548"
            trackStyle={{ borderRadius: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
            fillStyle={{ background: 'linear-gradient(90deg, #d4dc7b 0%, #c2cb5f 45%, #b0ba50 100%)' }}
            valueTextStyle={{ color: '#20a4ff', fontSize: '10px', letterSpacing: '0.02em', borderRadius: 0 }}
          />
        </>
      )}
    </div>
  );
}

export default PlayerFrame;
