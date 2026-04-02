import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';

export interface ResourceBarProps {
  value: number;
  max: number;
  color: string;
  height?: number;
  label?: string;
  valueText?: string;
  showValueText?: boolean;
  transitionMs?: number;
  trackColor?: string;
  borderColor?: string;
  trackStyle?: CSSProperties;
  fillStyle?: CSSProperties;
  valueTextStyle?: CSSProperties;
}

/**
 * ResourceBar — a simple reusable progress bar for resources like HP and Energy.
 *
 * Renders a filled bar with an optional label below it.
 * The fill width transitions smoothly using CSS transitions.
 */
export function ResourceBar({
  value,
  max,
  color,
  height = 10,
  label,
  valueText,
  showValueText = true,
  transitionMs = 200,
  trackColor = 'rgba(9, 12, 18, 0.96)',
  borderColor = T.border,
  trackStyle,
  fillStyle,
  valueTextStyle,
}: ResourceBarProps): React.ReactElement {
  const fillPct = max > 0 ? (value / max) * 100 : 0;
  const resolvedValueText = valueText ?? `${Math.round(fillPct)}%`;

  const outerStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    height: `${height}px`,
    background: trackColor,
    border: `1px solid ${borderColor}`,
    borderRadius: 2,
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    position: 'relative',
    ...trackStyle,
  };

  const resolvedFillStyle: CSSProperties = {
    width: `${fillPct}%`,
    height: '100%',
    background: `linear-gradient(90deg, ${color}, ${color}dd)`,
    transition: `width ${transitionMs}ms linear`,
    boxShadow: 'none',
    borderRadius: 0,
    ...fillStyle,
  };

  const labelStyle: CSSProperties = {
    fontSize: '9px',
    color: T.textDim,
    textAlign: 'left',
    marginBottom: '3px',
    fontFamily: FONTS.ui,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  const resolvedValueTextStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    color: T.textBright,
    fontFamily: FONTS.ui,
    fontWeight: 700,
    textShadow: '0 0 3px rgba(0, 0, 0, 0.85)',
    pointerEvents: 'none',
    ...valueTextStyle,
  };

  return (
    <div>
      {label !== undefined && (
        <div data-testid="resource-bar-label" style={labelStyle}>
          {label}
        </div>
      )}
      <div style={outerStyle} data-testid="resource-bar-track">
        <div data-testid="resource-bar-fill" style={resolvedFillStyle} />
        {showValueText && (
          <div data-testid="resource-bar-value-text" style={resolvedValueTextStyle}>
            {resolvedValueText}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResourceBar;
