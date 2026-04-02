import React from 'react';
import type { CSSProperties } from 'react';
import { AbilityIcon } from './AbilityIcon';
import { T, FONTS, SIZES } from '@ui/theme/elvui';

// Inject keyframes once into the document head
const PULSE_STYLE_ID = 'action-bar-slot-pulse-keyframes';
function ensurePulseKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes proc-glow {
      0%, 100% { box-shadow: 0 0 6px 2px #ffcc00aa, inset 0 0 6px #ffcc0044; opacity: 1; }
      50% { box-shadow: 0 0 14px 5px #ffcc00ff, inset 0 0 10px #ffcc0088; opacity: 0.85; }
    }
    @keyframes proc-border {
      0%, 100% { border-color: #ffcc00; opacity: 1; }
      50% { border-color: #fff8a0; opacity: 0.7; }
    }
    @keyframes max-charges-glow {
      0%, 100% { box-shadow: 0 0 6px 2px #ffaa00aa, inset 0 0 6px #ffaa0044; opacity: 1; }
      50% { box-shadow: 0 0 14px 5px #ffaa00ff, inset 0 0 10px #ffaa0088; opacity: 0.85; }
    }
    @keyframes max-charges-border {
      0%, 100% { border-color: #ffaa00; opacity: 1; }
      50% { border-color: #ffdd66; opacity: 0.7; }
    }
    @keyframes active-buff-glow {
      0%, 100% { box-shadow: 0 0 8px 2px rgba(96, 186, 255, 0.45), inset 0 0 8px rgba(96, 186, 255, 0.2); }
      50% { box-shadow: 0 0 14px 4px rgba(96, 186, 255, 0.8), inset 0 0 10px rgba(96, 186, 255, 0.35); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Props for a single WoW-style action bar button.
 */
export interface ActionBarSlotProps {
  /** SimC icon name for AbilityIcon */
  iconName: string;
  /** Emoji fallback */
  emoji?: string;
  /** Ability display name (for aria-label) */
  abilityName: string;
  /** Remaining cooldown in seconds. 0 = off cooldown. */
  cdRemaining: number;
  /** Total cooldown duration in seconds (for sweep % calculation) */
  cdTotal: number;
  /** Keybind text to show in top-left corner */
  keybind?: string;
  /** If true, show green glow + border (Tutorial/Practice mode only) */
  recommended?: boolean;
  /** If true, show gold proc glow — spell is empowered by an active proc buff */
  procced?: boolean;
  /** When a proc-override is active, the caller passes the proc spell id here (informational; caller also overrides iconName/abilityName/emoji). */
  procSpell?: string;
  /** Rich charge data — replaces chargeCount when provided. Badge shown when max > 1. */
  charges?: { current: number; max: number };
  /** Slot size in px. Default: SIZES.actionSlot (52) */
  size?: number;
  /** Called when the slot is clicked */
  onClick?: () => void;
  /** If true, show "pressed" scale-down animation */
  pressed?: boolean;
  /** Whether ability is usable (has enough resources). */
  usable?: boolean;
  /** Remaining GCD time in seconds. 0 = no GCD active. */
  gcdRemaining?: number;
  /** Total GCD duration in seconds (for sweep % calculation). Default: 1.5 */
  gcdTotal?: number;
  /** Remaining self-buff time shown as a small secondary timer. */
  activeBuffRemaining?: number;
  /** @deprecated Use charges prop instead. Number of available charges. */
  chargeCount?: number;
  /** Hover tooltip content shown by the browser. */
  tooltipText?: string;
  /** Stronger highlight used by tutorial mode. */
  learningHighlighted?: boolean;
  /** Dim the slot while tutorial mode spotlights a different button. */
  dimmed?: boolean;
}

/**
 * ActionBarSlot — a single WoW-style action bar button.
 *
 * Features:
 * - CD sweep conic-gradient overlay
 * - OmniCC countdown text (gold >= 3s, red < 3s)
 * - Icon desaturation on cooldown
 * - Keybind label (top-left, hidden when size < 32)
 * - Green glow + pulse border when recommended
 * - Scale animation when pressed
 */
export const ActionBarSlot = React.memo(function ActionBarSlot({
  iconName,
  emoji,
  abilityName,
  cdRemaining,
  cdTotal,
  keybind,
  recommended = false,
  procced = false,
  procSpell: _procSpell,
  charges,
  size = SIZES.actionSlot,
  onClick,
  pressed = false,
  usable = true,
  gcdRemaining = 0,
  gcdTotal = 1.5,
  activeBuffRemaining = 0,
  chargeCount,
  tooltipText,
  learningHighlighted = false,
  dimmed = false,
}: ActionBarSlotProps): React.ReactElement {
  const onCooldown = cdRemaining > 0;
  const onGcd = gcdRemaining > 0;
  const buffActive = activeBuffRemaining > 0;

  // Max-charges glow: triggers when at full charges and max > 1
  const atMaxCharges = charges !== undefined && charges.current === charges.max && charges.max > 1;

  // Inject keyframes if any animated state is active
  if (recommended || procced || atMaxCharges || buffActive || learningHighlighted) {
    ensurePulseKeyframes();
  }

  // CD sweep angle: how much of the circle is "dark" (remaining)
  const angle = onCooldown && cdTotal > 0 ? (cdRemaining / cdTotal) * 360 : 0;

  // GCD sweep angle (only shown when no individual CD active)
  const gcdAngle = onGcd && !onCooldown && gcdTotal > 0 ? (gcdRemaining / gcdTotal) * 360 : 0;

  // Slot container style
  const slotStyle: CSSProperties = {
    position: 'relative',
    width: `${size}px`,
    height: `${size}px`,
    background: `linear-gradient(180deg, rgba(14, 22, 36, 0.98), ${T.bgSlot})`,
     border: learningHighlighted
       ? '2px solid #f7f4a3'
       : recommended
       ? `1px solid ${T.accent}`
       : procced
        ? `1px solid ${T.gold}`
        : buffActive
          ? '1px solid #60baff'
          : atMaxCharges ? '1px solid #ffaa00' : `1px solid ${T.border}`,
    borderRadius: `${SIZES.borderRadius}px`,
    overflow: 'hidden',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform 0.08s, box-shadow 0.16s ease, border-color 0.16s ease',
    transform: pressed ? 'scale(0.92)' : 'none',
     boxShadow: learningHighlighted
       ? '0 0 18px rgba(247, 244, 163, 0.95), 0 0 34px rgba(247, 244, 163, 0.45), inset 0 0 12px rgba(247, 244, 163, 0.22)'
       : recommended
       ? `0 0 10px ${T.glowStrong}, inset 0 0 8px ${T.glow}`
      : procced
        ? undefined  // handled by animation
        : buffActive
          ? '0 0 8px rgba(96, 186, 255, 0.45), inset 0 0 8px rgba(96, 186, 255, 0.15)'
          : atMaxCharges ? undefined : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 18px rgba(0,0,0,0.28)',
     animation: learningHighlighted
       ? 'pulse 1s ease-in-out infinite'
       : procced && !recommended
       ? 'proc-glow 0.9s ease-in-out infinite'
      : buffActive && !recommended
        ? 'active-buff-glow 1.2s ease-in-out infinite'
      : atMaxCharges && !recommended
        ? 'max-charges-glow 1.2s ease-in-out infinite'
        : undefined,
     display: 'block',
     padding: 0,
     userSelect: 'none',
     opacity: dimmed ? 0.3 : 1,
   };

  // Icon wrapper style — desaturate on cooldown; dim when resources are insufficient
  const iconWrapperStyle: CSSProperties = {
    width: '100%',
    height: '100%',
       filter: dimmed
       ? 'grayscale(0.8) brightness(0.4)'
       : onCooldown
        ? 'grayscale(0.7) brightness(0.5)'
        : !usable
        ? 'grayscale(0.5) brightness(0.55) saturate(0.4)'
        : buffActive
          ? 'brightness(1.06) saturate(1.08)'
        : 'none',
     opacity: dimmed ? 0.45 : !onCooldown && !usable ? 0.65 : 1,
  };

  // CD sweep overlay style using conic-gradient
  // Dark portion = remaining time (clockwise from top)
  const sweepStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: `conic-gradient(from -90deg, rgba(0,0,0,0) 0deg, rgba(0,0,0,0) ${360 - angle}deg, rgba(0,0,0,0.7) ${360 - angle}deg)`,
    pointerEvents: 'none',
  };

  // GCD sweep overlay — lighter than CD sweep, shown only when no individual CD
  const gcdSweepStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: `conic-gradient(from -90deg, rgba(0,0,0,0) 0deg, rgba(0,0,0,0) ${360 - gcdAngle}deg, rgba(0,0,0,0.55) ${360 - gcdAngle}deg)`,
    pointerEvents: 'none',
  };

  // OmniCC countdown text style
  const cdFontSize = size * 0.38;
  const cdColor = cdRemaining >= 3 ? T.gold : T.red;
  const cdTextStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: cdColor,
    fontFamily: FONTS.ui,
    fontWeight: 700,
    fontSize: `${cdFontSize}px`,
    textShadow: '0 0 4px #000',
    pointerEvents: 'none',
  };

  // OmniCC text value
  const cdText = cdRemaining >= 3
    ? String(Math.ceil(cdRemaining))
    : cdRemaining.toFixed(1);

  const activeBuffText = activeBuffRemaining >= 10
    ? String(Math.ceil(activeBuffRemaining))
    : activeBuffRemaining.toFixed(1);

  // Keybind label style
  const keybindStyle: CSSProperties = {
    position: 'absolute',
    top: '1px',
    left: '4px',
    color: T.textBright,
    fontSize: '10px',
    fontFamily: FONTS.ui,
    lineHeight: 1,
    pointerEvents: 'none',
    userSelect: 'none',
    background: 'rgba(4, 8, 16, 0.78)',
    padding: '2px 4px',
    borderRadius: 6,
  };

  // Recommended pulse border overlay
  const pulseStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    border: `2px solid ${T.accent}`,
    borderRadius: `${SIZES.borderRadius}px`,
    pointerEvents: 'none',
    animation: 'pulse 1.2s ease-in-out infinite',
  };

  const activeBuffTextStyle: CSSProperties = {
    position: 'absolute',
    top: '2px',
    right: '3px',
    color: '#b9e3ff',
    fontSize: `${Math.max(10, size * 0.2)}px`,
    fontFamily: FONTS.ui,
    fontWeight: 700,
    lineHeight: 1,
    textShadow: '0 0 3px #000, 0 0 3px #000',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  return (
    <button
      role="button"
      aria-label={abilityName}
      style={slotStyle}
      onClick={onClick}
      data-testid="action-bar-slot"
      data-learning-highlighted={learningHighlighted ? 'true' : 'false'}
      data-dimmed={dimmed ? 'true' : 'false'}
      title={tooltipText}
    >
      {/* Layer 1: Icon */}
      <div
        data-testid="ability-icon-wrapper"
        style={iconWrapperStyle}
      >
        <AbilityIcon
          iconName={iconName}
          emoji={emoji}
          size={size}
        />
      </div>

      {/* Layer 2: CD sweep overlay */}
      {onCooldown && (
        <div data-testid="cd-sweep" style={sweepStyle} />
      )}

      {/* Layer 2b: GCD sweep overlay (only when no individual CD) */}
      {onGcd && !onCooldown && (
        <div data-testid="gcd-sweep" style={gcdSweepStyle} />
      )}

      {/* Layer 3: OmniCC countdown text */}
      {onCooldown && (
        <div data-testid="cd-text" style={cdTextStyle}>
          {cdText}
        </div>
      )}

      {/* Layer 4: Keybind label */}
      {keybind && size >= 32 && (
        <span style={keybindStyle}>
          {keybind}
        </span>
      )}

      {buffActive && (
        <span data-testid="active-buff-text" style={activeBuffTextStyle}>
          {activeBuffText}
        </span>
      )}

      {/* Layer 5: Recommended pulse border */}
      {(recommended || learningHighlighted) && (
        <div data-testid="recommended-pulse" style={pulseStyle} />
      )}

      {/* Layer 6: Proc glow border */}
      {procced && !recommended && (
        <div
          data-testid="proc-glow"
          style={{
            position: 'absolute',
            inset: 0,
            border: `2px solid ${T.gold}`,
            borderRadius: `${SIZES.borderRadius}px`,
            pointerEvents: 'none',
            animation: 'proc-border 0.9s ease-in-out infinite',
          }}
        />
      )}

      {/* Layer 6b: Max-charges glow border */}
      {atMaxCharges && !recommended && !procced && (
        <div
          data-testid="max-charges-glow"
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid #ffaa00',
            borderRadius: `${SIZES.borderRadius}px`,
            pointerEvents: 'none',
            animation: 'max-charges-border 1.2s ease-in-out infinite',
          }}
        />
      )}

      {/* Layer 7: Charge count (bottom-right, WoW-style) */}
      {(charges !== undefined && charges.max > 1) && (
        <span
          data-testid="charge-count"
          style={{
            position: 'absolute',
            bottom: '1px',
            right: '3px',
            color: charges.current > 0 ? T.gold : T.red,
            fontSize: `${size * 0.28}px`,
            fontFamily: FONTS.ui,
            fontWeight: 700,
            textShadow: '0 0 3px #000, 0 0 3px #000',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {charges.current}
        </span>
      )}
      {/* Legacy charge badge (deprecated chargeCount prop) */}
      {chargeCount !== undefined && charges === undefined && (
        <span
          data-testid="charge-count"
          style={{
            position: 'absolute',
            bottom: '1px',
            right: '3px',
            color: chargeCount > 0 ? T.gold : T.red,
            fontSize: `${size * 0.28}px`,
            fontFamily: FONTS.ui,
            fontWeight: 700,
            textShadow: '0 0 3px #000, 0 0 3px #000',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {chargeCount}
        </span>
      )}
    </button>
  );
});

export default ActionBarSlot;
