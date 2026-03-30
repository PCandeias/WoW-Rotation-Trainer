import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { buildHudFrameStyle } from '@ui/theme/stylePrimitives';
import { AbilityIcon } from './AbilityIcon';
import { SPELL_ICONS } from './ActionBar';
import { MONK_WW_SPELLS } from '@data/spells/monk_windwalker';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';

export interface CastBarProps {
  /** Whether a channel is currently active */
  isChanneling: boolean;
  /** Channeling spell id (used for icon lookup) */
  spellId?: string;
  /** Spell name to display (e.g. "Fists of Fury") */
  spellName: string;
  /** Total cast/channel duration in seconds */
  totalTime?: number;
  /** Channel progress 0.0–1.0 (unused for fill; fill uses remaining/total) */
  progress: number;
  /** Remaining channel time in seconds */
  remainingTime: number;
  /** Show debug telemetry below the cast bar */
  debug?: boolean;
  /** Color for the progress fill. Default: '#44aaff' */
  color?: string;
}

/**
 * CastBar — displays the progress of a channeled ability (primarily FoF).
 *
 * Mirrors the tracked-buff bar pattern from CooldownManager exactly:
 * fill is a normal-flow div with height:100% and width:fillPct%, inside a
 * position:relative overflow:hidden track. No position:absolute on the fill.
 */
export function CastBar({
  isChanneling,
  spellId,
  spellName,
  totalTime,
  progress,
  remainingTime,
  debug = false,
  color = '#44aaff',
}: CastBarProps): React.ReactElement | null {
  if (!isChanneling) {
    return null;
  }

  const icon = spellId ? SPELL_ICONS[spellId] : undefined;

  // Resolve total channel duration — prefer the prop, fall back to spell data
  const spellBaseDuration = spellId
    ? ((MONK_WW_SPELLS.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId))?.channelDuration ?? 0)
    : 0;
  const resolvedTotal = (totalTime && totalTime > 0) ? totalTime : spellBaseDuration;

  // Fill = remaining fraction, starting full and draining to empty
  const fillPct = resolvedTotal > 0
    ? Math.min(100, Math.max(0, (remainingTime / resolvedTotal) * 100))
    : Math.min(100, Math.max(0, (1 - progress) * 100));

  // ---- styles (identical structure to CooldownManager tracked-buff bars) ----

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
  };

  const trackStyle: CSSProperties = {
    flex: 1,
    height: '28px',
    ...buildHudFrameStyle({ compact: true }),
    overflow: 'hidden',
    position: 'relative',
    boxShadow: 'none',
  };

  // Exact same pattern as buff bar fillStyle: height+width, no position
  const fillStyle: CSSProperties = {
    height: '100%',
    width: `${fillPct}%`,
    background: `linear-gradient(90deg, ${color}, ${color}88)`,
  };

  const overlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 4px',
    pointerEvents: 'none',
  };

  const leftTextStyle: CSSProperties = {
    fontSize: '9px',
    color: T.textBright,
    fontFamily: FONTS.ui,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const rightTextStyle: CSSProperties = {
    fontSize: '9px',
    color: T.textDim,
    fontFamily: FONTS.ui,
    lineHeight: 1,
    flexShrink: 0,
  };

  return (
    <>
      <div style={containerStyle}>
        <AbilityIcon
          iconName={icon?.iconName}
          emoji={icon?.emoji ?? '✨'}
          size={22}
        />
        <div style={trackStyle}>
          <div data-testid="cast-bar-fill" style={fillStyle} />
          <div style={overlayStyle}>
            <span style={leftTextStyle}>{spellName}</span>
            <span style={rightTextStyle}>{remainingTime.toFixed(1)}s</span>
          </div>
        </div>
      </div>
      {debug && (
        <div
          data-testid="cast-bar-debug"
          style={{ fontSize: '8px', color: '#8ca0bf', fontFamily: FONTS.ui, marginTop: '2px' }}
        >
          {`rem=${remainingTime.toFixed(3)} total=${resolvedTotal.toFixed(3)} pct=${fillPct.toFixed(2)}%`}
        </div>
      )}
    </>
  );
}

export default CastBar;
