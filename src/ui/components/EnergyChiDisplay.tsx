import React from 'react';
import type { CSSProperties } from 'react';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { ChiOrbs } from './ChiOrbs';
import { ResourceBar } from './ResourceBar';

export interface EnergyChiDisplayProps {
  gameState: GameStateSnapshot;
  currentTime: number;
  /** Width of the display panel in px. Default: 220 */
  width?: number;
}

/**
 * EnergyChiDisplay — detached chi and energy display.
 */
export function EnergyChiDisplay({
  gameState,
  currentTime,
  width = 220,
}: EnergyChiDisplayProps): React.ReactElement {
  const energyMax = gameState.energyMax;
  const currentEnergy = Math.floor(
    Math.min(
      energyMax,
      gameState.energyAtLastUpdate +
        gameState.energyRegenRate * (currentTime - gameState.energyLastUpdated)
    )
  );

  const energyPercent = Math.round((currentEnergy / Math.max(1, energyMax)) * 100);

  const panel: CSSProperties = {
    width: `${width}px`,
    display: 'grid',
    gap: '2px',
  };

  return (
    <div style={panel} data-testid="energy-chi-display">
      <ChiOrbs current={gameState.chi} max={gameState.chiMax} width="100%" height={14} />
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
    </div>
  );
}

export default EnergyChiDisplay;
