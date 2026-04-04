import React from 'react';
import type { CSSProperties } from 'react';
import { T } from '@ui/theme/elvui';
import { AbilityIcon } from '@ui/components/AbilityIcon';
import { SPELL_ICONS } from '@ui/specs/spellIcons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendationQueueProps {
  /** Ordered list of recommended spellIds (first = most urgent). Max 4 shown. */
  recommendations: string[];
  /** Projected wait until slot 0 becomes actionable. Null/0 means clickable now. */
  firstRecommendationReadyIn?: number | null;
  /** Current GCD wait; suppress slot-0 timer if the recommendation is ready by then. */
  gcdRemaining?: number;
  /** Whether to show at all (false in Test mode) */
  visible: boolean;
  /** When true, render the spell name below each icon (useful for debugging APL output) */
  debug?: boolean;
  /** When true, slot 0 plays the proc-highlight animation */
  procHighlight?: boolean;
  /** Which animation style to use (default: 'pulse') */
  procHighlightStyle?: 'pulse' | 'shake';
}

// ---------------------------------------------------------------------------
// Slot config
// ---------------------------------------------------------------------------

interface SlotConfig {
  size: number;
  opacity: number;
  border: string;
  boxShadow?: string;
}

const SLOT_CONFIGS: SlotConfig[] = [
  {
    size: 48,
    opacity: 1,
    border: `1px solid ${T.accent}`,
    boxShadow: `0 0 8px ${T.glow}`,
  },
  {
    size: 36,
    opacity: 0.85,
    border: `1px solid ${T.border}`,
  },
  {
    size: 30,
    opacity: 0.65,
    border: `1px solid ${T.border}`,
  },
  {
    size: 26,
    opacity: 0.45,
    border: `1px solid ${T.border}`,
  },
];

// ---------------------------------------------------------------------------
// Inject CSS keyframes once at module load
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  const styleId = 'rq-proc-highlight-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes rqPulseGlow {
        0%, 100% { box-shadow: 0 0 8px rgba(200,168,75,0.5), 0 0 0 0 rgba(255,120,0,0.8); }
        50% { box-shadow: 0 0 8px rgba(200,168,75,0.5), 0 0 0 6px rgba(255,120,0,0); }
      }
      @keyframes rqShake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-3px); }
        40% { transform: translateX(3px); }
        60% { transform: translateX(-2px); }
        80% { transform: translateX(2px); }
      }
      @keyframes rqBorderFlash {
        0% { border-color: #ff7800; box-shadow: 0 0 16px rgba(255,120,0,1); }
        100% { border-color: #c8a84b; box-shadow: 0 0 8px rgba(200,168,75,0.5); }
      }
    `;
    document.head.appendChild(style);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * RecommendationQueue — Hekili-style rotation helper.
 *
 * Shows the next optimal abilities in a left-to-right queue with descending
 * icon sizes. The primary (first) icon has an accent border and glow to
 * indicate urgency.
 */
function formatSpellId(spellId: string): string {
  return spellId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatReadyIn(readyIn: number): string {
  return readyIn >= 3 ? String(Math.ceil(readyIn)) : readyIn.toFixed(1);
}

export function RecommendationQueue({
  recommendations,
  firstRecommendationReadyIn = null,
  gcdRemaining = 0,
  visible,
  debug = false,
  procHighlight,
  procHighlightStyle,
}: RecommendationQueueProps): React.ReactElement | null {
  const [highlightKey, setHighlightKey] = React.useState(0);

  React.useEffect(() => {
    if (procHighlight) {
      setHighlightKey((k) => k + 1);
    }
  }, [procHighlight]);

  if (!visible) return null;

  const displayed = recommendations.slice(0, 4);
  const timerThreshold = Math.max(0, gcdRemaining) + 0.05;

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '4px',
  };

  const labelStyle: CSSProperties = {
    fontSize: '9px',
    color: T.textDim,
    fontStyle: 'italic',
    marginLeft: '4px',
  };

  return (
    <div style={containerStyle}>
      {displayed.map((spellId, index) => {
        const config = SLOT_CONFIGS[index];
        const icons = SPELL_ICONS[spellId] ?? { iconName: '', emoji: '?' };
        const iconName = icons.iconName;
        const emoji = icons.emoji;

        const slotStyle: CSSProperties = {
          width: `${config.size}px`,
          height: `${config.size}px`,
          position: 'relative',
          background: T.bgSlot,
          border: config.border,
          ...(config.boxShadow ? { boxShadow: config.boxShadow } : {}),
          borderRadius: '2px',
          overflow: 'hidden',
          opacity: config.opacity,
          flexShrink: 0,
        };

        const nameStyle: CSSProperties = {
          fontSize: '9px',
          color: T.textDim,
          textAlign: 'center',
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: `${config.size}px`,
        };

        const isAnimating = index === 0 && procHighlight;
        const showReadyTimer = index === 0
          && firstRecommendationReadyIn !== null
          && firstRecommendationReadyIn > timerThreshold;
        const animStyle: CSSProperties = isAnimating && procHighlightStyle === 'shake'
          ? {
              animation: 'rqShake 0.35s ease, rqBorderFlash 0.8s ease forwards',
              borderColor: '#ff7800',
            }
          : isAnimating
          ? {
              animation: 'rqPulseGlow 0.8s ease-out 3',
              borderColor: '#ff7800',
              boxShadow: '0 0 14px rgba(255,120,0,0.9)',
            }
          : {};

        const timerStyle: CSSProperties = {
          position: 'absolute',
          right: '2px',
          bottom: '2px',
          padding: '0 3px',
          borderRadius: '2px',
          background: 'rgba(0, 0, 0, 0.78)',
          color: T.gold,
          fontSize: index === 0 ? '10px' : '9px',
          fontWeight: 700,
          lineHeight: 1.2,
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.85)',
        };

        return (
          <div
            key={index === 0 ? highlightKey : `${spellId}-${index}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            data-proc-highlight={index === 0 && procHighlight ? 'true' : undefined}
          >
            <div data-testid="recommendation-slot" style={{ ...slotStyle, ...animStyle }}>
              <AbilityIcon iconName={iconName} emoji={emoji} size={config.size} />
              {showReadyTimer && (
                <span data-testid="recommendation-slot-timer" style={timerStyle}>
                  {formatReadyIn(firstRecommendationReadyIn)}
                </span>
              )}
            </div>
            {debug && <span style={nameStyle}>{formatSpellId(spellId)}</span>}
          </div>
        );
      })}
      <span style={labelStyle}>Next →</span>
    </div>
  );
}

export default RecommendationQueue;
