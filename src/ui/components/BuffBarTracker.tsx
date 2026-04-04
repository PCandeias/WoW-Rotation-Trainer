import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { AbilityIcon } from './AbilityIcon';
import type { GameStateSnapshot } from '@core/engine/gameState';
import type { BuffDef } from '@core/data';
import { getBuffbookForProfileSpec } from '@core/data';
import type { BuffRegistry } from './BuffTracker';
import { getBuffPresentationRegistryForProfileSpec } from '@ui/specs/specBuffPresentation';
import { prepareBuffEntries } from './buffPresentation';

export interface BuffBarTrackerProps {
  gameState: GameStateSnapshot;
  currentTime: number;
  blacklist?: string[];
  whitelist?: string[];
  registry?: BuffRegistry;
  buffbook?: ReadonlyMap<string, BuffDef>;
  iconNameResolver?: (buffId: string, gameState: GameStateSnapshot, fallback?: string) => string | undefined;
  spellIdsByBuffId?: Readonly<Record<string, number>>;
  containerStyle?: CSSProperties;
}

/**
 * Renders the trainer's tracked buffs as Blizzard-style timer bars.
 */
export function BuffBarTracker({
  gameState,
  currentTime,
  blacklist,
  whitelist,
  registry = getBuffPresentationRegistryForProfileSpec('monk'),
  buffbook = getBuffbookForProfileSpec('monk'),
  iconNameResolver,
  spellIdsByBuffId,
  containerStyle: trackerContainerStyle,
}: BuffBarTrackerProps): React.ReactElement {
  const containerStyle: CSSProperties = {
    display: 'grid',
    gap: '6px',
    ...trackerContainerStyle,
  };

  const barContainerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const trackStyle: CSSProperties = {
    flex: 1,
    height: '18px',
    background: 'rgba(9, 12, 18, 0.96)',
    border: `1px solid ${T.border}`,
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  };

  const innerLabelStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 3px',
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

  const enrichedBuffs = prepareBuffEntries(gameState, currentTime, {
    registry,
    iconNameResolver,
    whitelist,
    blacklist,
  });

  const buffBars = enrichedBuffs.map(({ buffId, buffState, iconName, emoji, displayName }) => {
    const buffDef = buffbook.get(buffId);

    const { expiresAt, stacks } = buffState;
    const isPermanent = expiresAt === 0;
    if (!isPermanent && expiresAt <= currentTime) {
      return null;
    }

    const maxDuration = buffDef?.duration ?? 0;
    const remaining = isPermanent ? 0 : expiresAt - currentTime;
    const fillPct = isPermanent || maxDuration <= 0 || maxDuration >= 99
      ? 100
      : Math.min(100, Math.max(0, (remaining / maxDuration) * 100));
    const labelText = (buffDef?.maxStacks ?? 1) > 1 && stacks > 1 ? `${displayName} (${stacks})` : displayName;
    const barColor = '#4ea1ff';

    const fillStyle: CSSProperties = {
      height: '100%',
      background: `linear-gradient(90deg, ${barColor}, ${barColor}dd)`,
      width: `${fillPct}%`,
      borderRadius: 0,
      boxShadow: 'none',
    };

    return (
      <div
        key={buffId}
        data-testid={`buff-bar-${buffId}`}
        style={barContainerStyle}
        title={spellIdsByBuffId?.[buffId] !== undefined ? `${displayName}\nSpell ID: ${spellIdsByBuffId[buffId]}` : displayName}
      >
        <AbilityIcon iconName={iconName} emoji={emoji} size={18} />
        <div style={trackStyle}>
          <div data-testid={`buff-fill-${buffId}`} style={fillStyle} />
          <div style={innerLabelStyle}>
            <span style={leftTextStyle}>{labelText}</span>
            {!isPermanent && maxDuration > 0 && maxDuration < 99 && (
              <span style={rightTextStyle}>{remaining.toFixed(1)}s</span>
            )}
          </div>
        </div>
      </div>
    );
  });

  return (
    <div style={containerStyle}>
      <div style={{ display: 'grid', gap: '6px' }}>{buffBars}</div>
    </div>
  );
}

export default BuffBarTracker;
