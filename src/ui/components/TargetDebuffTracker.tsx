import React, { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { buildHudFrameStyle } from '@ui/theme/stylePrimitives';
import { AbilityIcon } from './AbilityIcon';
import type { GameStateSnapshot, BuffState } from '@core/engine/gameState';
import { clampTooltipLeft } from './BuffTracker';
import { TARGET_DEBUFF_SPELL_IDS, buildTrackerBlacklist } from './trackerSpellIds';

interface TargetDebuffDef {
  buffId: keyof typeof TARGET_DEBUFF_SPELL_IDS;
  spellId: number;
  iconName: string;
  emoji: string;
  displayName: string;
}

export interface TargetDebuffTrackerProps {
  gameState: GameStateSnapshot;
  currentTime: number;
  blacklistSpellIds?: number[];
}

interface HoverState {
  buffId: TargetDebuffDef['buffId'];
  cellCenterX: number;
  cellTop: number;
}

const TARGET_DEBUFFS: readonly TargetDebuffDef[] = [
  {
    buffId: 'mystic_touch',
    spellId: TARGET_DEBUFF_SPELL_IDS.mystic_touch,
    iconName: 'ability_monk_sparring',
    emoji: '👊',
    displayName: 'Mystic Touch',
  },
  {
    buffId: 'chaos_brand',
    spellId: TARGET_DEBUFF_SPELL_IDS.chaos_brand,
    iconName: 'ability_demonhunter_empowerwards',
    emoji: '💜',
    displayName: 'Chaos Brand',
  },
  {
    buffId: 'hunters_mark',
    spellId: TARGET_DEBUFF_SPELL_IDS.hunters_mark,
    iconName: 'ability_hunter_markedfordeath',
    emoji: '🎯',
    displayName: "Hunter's Mark",
  },
];

function formatTimer(remaining: number): string {
  if (remaining < 10) {
    return `${remaining.toFixed(1)}s`;
  }

  return `${Math.round(remaining)}s`;
}

function getTargetDebuffState(gameState: GameStateSnapshot, buffId: TargetDebuffDef['buffId']): BuffState | null {
  if (buffId === 'mystic_touch') {
    return gameState.assumeMysticTouch
      ? { expiresAt: 0, stacks: 1, stackTimers: [] }
      : null;
  }

  return gameState.buffs.get(buffId) ?? null;
}

/**
 * Compact target debuff row anchored to the target frame, matching the WoW unit-frame style.
 */
export function TargetDebuffTracker({
  gameState,
  currentTime,
  blacklistSpellIds = [],
}: TargetDebuffTrackerProps): React.ReactElement {
  const [hover, setHover] = useState<HoverState | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const hiddenDebuffs = new Set(buildTrackerBlacklist(TARGET_DEBUFF_SPELL_IDS, blacklistSpellIds));
  const visibleDebuffs = TARGET_DEBUFFS.flatMap((def) => {
    if (hiddenDebuffs.has(def.buffId)) {
      return [];
    }

    const buffState = getTargetDebuffState(gameState, def.buffId);
    if (!buffState) {
      return [];
    }

    if (buffState.expiresAt > 0 && buffState.expiresAt <= currentTime) {
      return [];
    }

    return [{ ...def, buffState }];
  });

  useLayoutEffect(() => {
    if (!hover || !tooltipRef.current) {
      setTooltipPos(null);
      return;
    }

    const tip = tooltipRef.current.getBoundingClientRect();
    const left = clampTooltipLeft(hover.cellCenterX - tip.width / 2, tip.width, window.innerWidth);
    const top = Math.max(8, hover.cellTop - tip.height - 6);
    setTooltipPos({ left, top });
  }, [hover]);

  if (visibleDebuffs.length === 0) {
    return <></>;
  }

  const hoveredEntry = hover
    ? visibleDebuffs.find((entry) => entry.buffId === hover.buffId) ?? null
    : null;

  const containerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
    minHeight: 34,
    pointerEvents: 'none',
  };

  const cellStyle: CSSProperties = {
    ...buildHudFrameStyle({ compact: true }),
    position: 'relative',
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 8,
    overflow: 'hidden',
    background: 'linear-gradient(180deg, rgba(16, 24, 40, 0.96), rgba(5, 10, 18, 0.94))',
    boxShadow: '0 6px 14px rgba(0,0,0,0.35)',
    pointerEvents: 'all',
  };

  const timerStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 1,
    fontSize: '8px',
    lineHeight: 1,
    color: '#ffffff',
    fontFamily: FONTS.ui,
    textShadow: '0 0 3px rgba(0,0,0,0.9)',
    pointerEvents: 'none',
    textAlign: 'center',
  };

  const stackStyle: CSSProperties = {
    position: 'absolute',
    right: 1,
    top: 1,
    minWidth: 10,
    fontSize: '8px',
    lineHeight: 1,
    color: '#ffffff',
    fontFamily: FONTS.ui,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    borderRadius: 999,
    padding: '1px 2px',
    textShadow: '0 0 3px rgba(0,0,0,0.9)',
    pointerEvents: 'none',
    textAlign: 'center',
  };

  const tooltipStyle: CSSProperties = {
    position: 'fixed',
    left: tooltipPos?.left ?? hover?.cellCenterX ?? 0,
    top: tooltipPos?.top ?? (hover ? hover.cellTop - 60 : 0),
    visibility: tooltipPos ? 'visible' : 'hidden',
    background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.99), rgba(7, 11, 20, 0.98))',
    border: `1px solid ${T.accent}`,
    borderRadius: 12,
    padding: '8px 10px',
    minWidth: 120,
    whiteSpace: 'nowrap',
    zIndex: 1000,
    pointerEvents: 'none',
    boxShadow: '0 18px 36px rgba(0,0,0,0.38)',
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

  return (
    <div data-testid="target-debuff-tracker" style={containerStyle}>
      {hoveredEntry && hover && (
        <div
          ref={tooltipRef}
          data-testid={`target-debuff-tooltip-${hover.buffId}`}
          style={tooltipStyle}
        >
          <div style={tooltipNameStyle}>{hoveredEntry.displayName}</div>
          <div style={tooltipIdStyle}>Spell ID: {hoveredEntry.spellId}</div>
        </div>
      )}

      {visibleDebuffs.map(({ buffId, displayName, iconName, emoji, spellId, buffState }) => {
        const remaining = buffState.expiresAt === 0 ? 0 : Math.max(0, buffState.expiresAt - currentTime);
        const showTimer = buffState.expiresAt > 0;

        return (
          <div
            key={buffId}
            data-testid={`target-debuff-${buffId}`}
            aria-label={`${displayName} (${spellId})`}
            title={`${displayName} (${spellId})`}
            style={cellStyle}
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setHover({
                buffId,
                cellCenterX: rect.left + rect.width / 2,
                cellTop: rect.top,
              });
            }}
            onMouseLeave={() => setHover(null)}
          >
            <AbilityIcon iconName={iconName} emoji={emoji} size={28} alt={displayName} />
            {buffState.stacks > 1 && (
              <span data-testid={`target-debuff-stacks-${buffId}`} style={stackStyle}>
                {buffState.stacks}
              </span>
            )}
            {showTimer && (
              <span data-testid={`target-debuff-timer-${buffId}`} style={timerStyle}>
                {formatTimer(remaining)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default TargetDebuffTracker;
