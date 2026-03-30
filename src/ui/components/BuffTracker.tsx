import React, { useState, useRef, useLayoutEffect } from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { buildHudFrameStyle } from '@ui/theme/stylePrimitives';
import { AbilityIcon } from './AbilityIcon';
import type { GameStateSnapshot } from '@core/engine/gameState';

export interface BuffIconDef {
  iconName?: string;
  emoji?: string;
  displayName?: string;
  hideTimer?: boolean;
}

export type BuffRegistry = Record<string, BuffIconDef>;

export interface BuffTrackerProps {
  gameState: GameStateSnapshot;
  currentTime: number;
  /** Icon/display metadata keyed by buffId. Falls back to raw buffId + '?' emoji if absent. */
  registry?: BuffRegistry;
  /** Optional icon resolver for class/spec-specific dynamic icon substitutions. */
  iconNameResolver?: (buffId: string, gameState: GameStateSnapshot, fallback?: string) => string | undefined;
  /** If non-empty, ONLY these buffIds are shown. Takes precedence over blacklist. */
  whitelist?: string[];
  /** If provided, these buffIds are hidden. Ignored when whitelist is non-empty. */
  blacklist?: string[];
  /** Max icons per row before wrapping. Default: 12. Each cell is 36px wide. */
  maxPerRow?: number;
  /** Optional positioning/style overrides for the tracker container. */
  containerStyle?: CSSProperties;
}

const CELL_WIDTH = 36;

function formatTimer(remaining: number): string {
  if (remaining < 10) return remaining.toFixed(1) + 's';
  return Math.round(remaining) + 's';
}

/**
 * Clamps a tooltip's left pixel position so it stays within the viewport.
 * @param ideal     Ideal left position (tooltip centered on anchor)
 * @param tipWidth  Measured width of the tooltip element
 * @param vpWidth   Viewport width (window.innerWidth)
 * @param padding   Minimum gap from each viewport edge (default 6px)
 */
export function clampTooltipLeft(ideal: number, tipWidth: number, vpWidth: number, padding = 6): number {
  return Math.min(Math.max(ideal, padding), vpWidth - tipWidth - padding);
}

interface HoverState {
  buffId: string;
  displayName: string;
  cellCenterX: number;
  cellTop: number;
}

export function BuffTracker({
  gameState,
  currentTime,
  registry,
  iconNameResolver,
  whitelist,
  blacklist,
  maxPerRow = 12,
  containerStyle: trackerContainerStyle,
}: BuffTrackerProps): React.ReactElement {
  const [hover, setHover] = useState<HoverState | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // null = not yet measured (render hidden); object = measured, render visible
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  // After the tooltip is painted (invisible), measure it and compute the clamped position
  useLayoutEffect(() => {
    if (!hover || !tooltipRef.current) {
      setTooltipPos(null);
      return;
    }
    const tip = tooltipRef.current.getBoundingClientRect();
    const left = clampTooltipLeft(hover.cellCenterX - tip.width / 2, tip.width, window.innerWidth);
    const top = hover.cellTop - tip.height - 4;
    setTooltipPos({ left, top });
  }, [hover]);

  // ---------------------------------------------------------------------------
  // Filter and enrich buffs
  // ---------------------------------------------------------------------------

  const activePairs = Array.from(gameState.buffs.entries()).filter(
    ([, state]) => state.expiresAt === 0 || state.expiresAt > currentTime
  );

  const useWhitelist = Array.isArray(whitelist) && whitelist.length > 0;
  const filtered = activePairs.filter(([buffId]) => {
    if (useWhitelist && whitelist) return whitelist.includes(buffId);
    if (blacklist && blacklist.length > 0) return !blacklist.includes(buffId);
    return true;
  });

  const enriched = filtered.map(([buffId, buffState]) => {
    const def = registry?.[buffId];
    return {
      buffId,
      buffState,
      iconName: iconNameResolver?.(buffId, gameState, def?.iconName) ?? def?.iconName,
      emoji: def?.emoji ?? '?',
      displayName: def?.displayName ?? buffId,
      hideTimer: def?.hideTimer === true,
    };
  });

  const orderedEnriched = useWhitelist && whitelist
    ? whitelist.flatMap((buffId) => enriched.find((entry) => entry.buffId === buffId) ?? [])
    : enriched;

  // Find enriched entry for the currently hovered buff (for tooltip content)
  const hoveredEntry = hover ? orderedEnriched.find(e => e.buffId === hover.buffId) ?? null : null;

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const containerStyle: CSSProperties = {
    position: trackerContainerStyle ? undefined : 'fixed',
    top: trackerContainerStyle ? undefined : 54,
    right: trackerContainerStyle ? undefined : 20,
    display: 'flex',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    maxWidth: maxPerRow * CELL_WIDTH,
    pointerEvents: 'none',
    ...trackerContainerStyle,
  };

  const cellStyle: CSSProperties = {
    position: 'relative',
    width: CELL_WIDTH,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingBottom: 2,
    pointerEvents: 'all',
  };

  const timerStyle: CSSProperties = {
    fontSize: '9px',
    fontFamily: FONTS.ui,
    color: '#ffffff',
    lineHeight: 1,
    marginTop: 1,
    textAlign: 'center',
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)',
  };

  const stackBadgeStyle: CSSProperties = {
    position: 'absolute',
    bottom: 18,
    right: 2,
    fontSize: '9px',
    fontFamily: FONTS.ui,
    color: '#ffffff',
    backgroundColor: 'rgba(5, 10, 19, 0.82)',
    lineHeight: 1,
    padding: '0 1px',
    borderRadius: 1,
  };

  const tooltipStyle: CSSProperties = {
    position: 'fixed',
    left: tooltipPos?.left ?? hover?.cellCenterX ?? 0,
    top: tooltipPos?.top ?? (hover ? hover.cellTop - 60 : 0),
    // Hidden on first render until useLayoutEffect measures and positions it
    visibility: tooltipPos ? 'visible' : 'hidden',
    ...buildHudFrameStyle({ compact: true, highlighted: true }),
    backgroundColor: undefined,
    borderRadius: 12,
    padding: '6px 10px',
    minWidth: 120,
    whiteSpace: 'nowrap',
    zIndex: 1000,
    pointerEvents: 'none',
  };

  const tooltipNameStyle: CSSProperties = {
    fontFamily: FONTS.ui,
    fontSize: '0.8rem',
    color: T.textBright,
    fontWeight: 'bold',
    marginBottom: 2,
  };

  const tooltipIdStyle: CSSProperties = {
    fontFamily: FONTS.ui,
    fontSize: '0.7rem',
    color: T.textDim,
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={containerStyle}>
      {/* Single tooltip rendered at viewport level (position: fixed) */}
      {hoveredEntry && hover && (
        <div
          ref={tooltipRef}
          data-testid={`buff-tooltip-${hover.buffId}`}
          style={tooltipStyle}
        >
          <div style={tooltipNameStyle}>{hoveredEntry.displayName}</div>
          <div style={tooltipIdStyle}>{hover.buffId}</div>
        </div>
      )}

      {orderedEnriched.map(({ buffId, buffState, iconName, emoji, displayName, hideTimer }) => {
        const isPermanent = buffState.expiresAt === 0;
        const remaining = isPermanent ? 0 : buffState.expiresAt - currentTime;
        const showTimer = !isPermanent && !hideTimer;
        return (
          <div
            key={buffId}
            data-testid={`buff-cell-${buffId}`}
            style={cellStyle}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHover({ buffId, displayName, cellCenterX: rect.left + rect.width / 2, cellTop: rect.top });
            }}
            onMouseLeave={() => setHover(null)}
          >
            <div style={{ position: 'relative' }}>
              <AbilityIcon iconName={iconName} emoji={emoji} size={32} alt={displayName} />
              {buffState.stacks > 1 && (
                <span data-testid={`buff-stacks-${buffId}`} style={stackBadgeStyle}>
                  {buffState.stacks}
                </span>
              )}
            </div>
            {showTimer && (
              <span data-testid={`buff-timer-${buffId}`} style={timerStyle}>
                {formatTimer(remaining)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
