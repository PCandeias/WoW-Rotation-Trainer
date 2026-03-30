/**
 * UI theme tokens for the trainer's darker, Warcraft-Logs-meets-ElvUI refresh.
 *
 * The exported legacy names remain stable so existing components can adopt the
 * new visual language without a large rename sweep.
 */
export const T = {
  bg: '#050914',
  bgPanel: 'rgba(11, 17, 30, 0.92)',
  bgPanelRaised: 'rgba(16, 24, 40, 0.95)',
  bgPanelAlt: 'rgba(8, 13, 24, 0.9)',
  bgSlot: '#0d1526',
  bgInset: '#0a1020',
  bgOverlay: 'rgba(4, 8, 16, 0.78)',

  border: '#24324a',
  borderActive: '#3b4f73',
  borderBright: '#607aa8',
  borderSubtle: 'rgba(129, 151, 186, 0.28)',

  text: '#d3ddf0',
  textDim: '#8c99b2',
  textMuted: '#65748d',
  textBright: '#f3f7ff',

  accent: '#56ddb3',
  accentDim: '#2d9a79',
  accentSoft: 'rgba(86, 221, 179, 0.16)',
  accentWarm: '#f3ca75',

  gold: '#f5c56c',
  red: '#ff6b78',
  orange: '#ff9b5c',

  energy: '#f0d46e',
  chi: '#47dcff',
  health: '#41da8f',
  healthBg: '#13231c',
  targetHp: '#ff7a7a',

  classMonk: '#4ef2b4',

  cdSweep: 'rgba(3, 7, 14, 0.78)',

  glow: 'rgba(86, 221, 179, 0.35)',
  glowStrong: 'rgba(86, 221, 179, 0.72)',
  glowBlue: 'rgba(71, 220, 255, 0.5)',

  dmgCrit: '#ffe48a',
  dmgNormal: '#f8fbff',

  gradeS: '#ffd76f',
  gradeA: '#5de4b6',
  gradeB: '#68b3ff',
  gradeC: '#ffb26b',
  gradeD: '#ff6b78',

  shadow: '0 18px 45px rgba(0, 0, 0, 0.28)',
  shadowStrong: '0 24px 60px rgba(0, 0, 0, 0.4)',
} as const;

export const FONTS = {
  ui: "'JetBrains Mono', 'IBM Plex Mono', 'SFMono-Regular', monospace",
  display: "'Cinzel', 'Georgia', serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

export const SIZES = {
  actionSlot: 52,
  actionSlotLg: 60,
  actionSlotSm: 36,
  cooldownIconLg: 40,
  cooldownIconSm: 26,
  chiOrb: 14,
  borderRadius: 10,
  borderRadiusSm: 6,
  borderRadiusLg: 20,
} as const;

export const CSS_VARS = {
  '--color-bg': T.bg,
  '--color-bg-panel': T.bgPanel,
  '--color-bg-panel-raised': T.bgPanelRaised,
  '--color-bg-slot': T.bgSlot,
  '--color-border': T.border,
  '--color-border-bright': T.borderBright,
  '--color-accent': T.accent,
  '--color-text': T.text,
  '--color-text-dim': T.textDim,
  '--color-energy': T.energy,
  '--color-chi': T.chi,
  '--color-health': T.health,
  '--color-class-monk': T.classMonk,
  '--font-ui': FONTS.ui,
  '--font-display': FONTS.display,
  '--font-body': FONTS.body,
} as const satisfies Record<string, string>;

export function applyThemeVars(): void {
  const root = document.documentElement;
  Object.entries(CSS_VARS).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
