import type { CSSProperties } from 'react';
import { FONTS, SIZES, T } from './elvui';

export function buildPanelStyle(options?: {
  elevated?: boolean;
  interactive?: boolean;
  density?: 'comfortable' | 'compact';
}): CSSProperties {
  return {
    border: `1px solid ${options?.elevated ? T.borderBright : T.border}`,
    borderRadius: options?.elevated ? SIZES.borderRadiusLg : 16,
    background: options?.elevated
      ? `linear-gradient(180deg, ${T.bgPanelRaised}, ${T.bgPanelAlt})`
      : `linear-gradient(180deg, ${T.bgPanel}, ${T.bgInset})`,
    boxShadow: options?.elevated ? T.shadowStrong : T.shadow,
    padding: options?.density === 'compact' ? '14px 16px' : '20px 22px',
    transition: 'border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease',
    transform: options?.interactive ? 'translateZ(0)' : undefined,
    backdropFilter: 'blur(14px)',
  };
}

export function buildCardStyle(options?: {
  active?: boolean;
  accentColor?: string;
}): CSSProperties {
  const accentColor = options?.accentColor ?? T.accent;
  return {
    ...buildPanelStyle({ elevated: true, interactive: true }),
    borderColor: options?.active ? accentColor : T.border,
    boxShadow: options?.active ? `0 22px 55px ${accentColor}20` : T.shadow,
    background: options?.active
      ? `linear-gradient(180deg, rgba(18, 31, 43, 0.98), rgba(8, 13, 24, 0.96))`
      : `linear-gradient(180deg, ${T.bgPanelRaised}, ${T.bgInset})`,
  };
}

export function buildControlStyle(options?: {
  tone?: 'primary' | 'secondary' | 'ghost';
  active?: boolean;
}): CSSProperties {
  const tone = options?.tone ?? 'secondary';

  if (tone === 'primary') {
    return {
      border: `1px solid ${T.accent}`,
      borderRadius: 12,
      padding: '10px 16px',
      background: `linear-gradient(180deg, ${T.accent}, ${T.accentDim})`,
      color: '#04120d',
      fontFamily: FONTS.body,
      fontWeight: 700,
      cursor: 'pointer',
      boxShadow: `0 16px 30px ${T.glow}`,
      transition: 'transform 160ms ease, box-shadow 160ms ease, filter 160ms ease',
    };
  }

  if (tone === 'ghost') {
    return {
      border: `1px solid ${options?.active ? T.borderBright : T.borderSubtle}`,
      borderRadius: 12,
      padding: '10px 14px',
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
      color: options?.active ? T.textBright : T.text,
      fontFamily: FONTS.body,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'border-color 160ms ease, background-color 160ms ease, color 160ms ease',
    };
  }

  return {
    border: `1px solid ${options?.active ? T.borderBright : T.border}`,
    borderRadius: 12,
    padding: '10px 14px',
    background: `linear-gradient(180deg, rgba(15, 22, 36, 0.98), rgba(9, 14, 25, 0.96))`,
    color: options?.active ? T.textBright : T.text,
    fontFamily: FONTS.body,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    transition: 'border-color 160ms ease, transform 160ms ease, color 160ms ease',
  };
}

export function buildHudFrameStyle(options?: {
  highlighted?: boolean;
  compact?: boolean;
}): CSSProperties {
  return {
    border: `1px solid ${options?.highlighted ? T.borderBright : T.border}`,
    borderRadius: options?.compact ? 12 : 16,
    background: `linear-gradient(180deg, rgba(10, 16, 28, 0.94), rgba(5, 10, 19, 0.92))`,
    boxShadow: options?.highlighted ? `0 18px 35px ${T.glow}` : T.shadow,
    backdropFilter: 'blur(12px)',
  };
}
