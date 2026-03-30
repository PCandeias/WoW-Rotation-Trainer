import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { buildHudFrameStyle } from '@ui/theme/stylePrimitives';
import { ResourceBar } from './ResourceBar';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { TargetDebuffTracker } from './TargetDebuffTracker';

export interface TargetFrameProps {
  /** Current snapshot, used to derive visible target debuffs. */
  gameState?: GameStateSnapshot;
  /** Total damage dealt so far (from gameState.totalDamage) */
  totalDamage: number;
  /** Encounter duration in seconds */
  encounterDuration: number;
  /** Current sim time */
  currentTime: number;
  /** Whether target debuffs should be shown above the health bar. */
  showTargetDebuffs?: boolean;
  /** Spell-id blacklist applied to the target debuff row. */
  debuffBlacklistSpellIds?: number[];
  /** Target max HP. Default: 100_000_000 (100M) */
  targetMaxHp?: number;
}

/**
 * TargetFrame — displays the training dummy target frame.
 *
 * Shows the target's remaining HP as a percentage, reduced by total damage dealt.
 */
export function TargetFrame({
  gameState,
  totalDamage,
  currentTime,
  showTargetDebuffs = true,
  debuffBlacklistSpellIds = [],
  targetMaxHp = 100_000_000,
}: TargetFrameProps): React.ReactElement {
  // Target HP drains based on damage dealt
  const hpPct = Math.max(0, 100 - (totalDamage / targetMaxHp) * 100);
  const hpDisplay = Math.round(hpPct);

  const panelStyle: CSSProperties = {
    ...buildHudFrameStyle(),
    padding: '8px 10px',
    width: '260px',
    borderRadius: 4,
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  };

  const nameStyle: CSSProperties = {
    fontSize: '11px',
    color: T.textBright,
    fontFamily: FONTS.ui,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  const levelStyle: CSSProperties = {
    fontSize: '10px',
    color: T.textDim,
    fontFamily: FONTS.ui,
  };

  const wrapperStyle: CSSProperties = {
    display: 'grid',
    gap: 6,
    justifyItems: 'end',
  };

  const debuffAnchorStyle: CSSProperties = {
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-end',
  };

  return (
    <div style={wrapperStyle}>
      {showTargetDebuffs && gameState && (
        <div style={debuffAnchorStyle}>
          <TargetDebuffTracker
            gameState={gameState}
            currentTime={currentTime}
            blacklistSpellIds={debuffBlacklistSpellIds}
          />
        </div>
      )}
      <div style={panelStyle}>
        <div style={headerRowStyle}>
          <span style={nameStyle}>Training Dummy</span>
          <span style={levelStyle}>Lvl 90</span>
        </div>
        <div data-testid="target-hp-bar">
          <ResourceBar value={hpPct} max={100} color={T.targetHp} height={14} valueText={`${hpDisplay}%`} />
        </div>
      </div>
    </div>
  );
}

export default TargetFrame;
