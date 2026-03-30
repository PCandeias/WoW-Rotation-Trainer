import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { buildCardStyle, buildControlStyle, buildPanelStyle } from '@ui/theme/stylePrimitives';
import type { TrainerMode } from '@ui/state/trainerSettings';

export interface MenuScreenProps {
  onStart: (mode: TrainerMode) => void;
}

interface ModeCardProps {
  title: string;
  subtitle: string;
  description: string;
  mode: TrainerMode;
  accentColor: string;
  onStart: (mode: TrainerMode) => void;
}

function ModeCard({ title, subtitle, description, mode, accentColor, onStart }: ModeCardProps): React.ReactElement {
  const [hovered, setHovered] = React.useState(false);

  const card: CSSProperties = {
    ...buildCardStyle({ accentColor }),
    borderColor: hovered ? accentColor : T.border,
    boxShadow: hovered ? `0 24px 48px ${accentColor}22` : T.shadow,
    padding: '22px 24px',
    cursor: 'pointer',
    transition: 'transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
    flex: '1 1 220px',
    maxWidth: 300,
    minHeight: 220,
    textAlign: 'left',
    transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <div
      style={card}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onStart(mode)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onStart(mode)}
    >
      <div
        style={{
          position: 'absolute',
          inset: 'auto -30% 62% 35%',
          height: 120,
          background: `radial-gradient(circle, ${accentColor}24, transparent 68%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ fontSize: '1.1rem', fontFamily: FONTS.display, color: accentColor, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: '0.75rem', fontFamily: FONTS.ui, color: T.textDim, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {subtitle}
      </div>
      <div style={{ fontSize: '0.82rem', fontFamily: FONTS.body, color: T.text, lineHeight: 1.5 }}>
        {description}
      </div>
    </div>
  );
}

/**
 * MenuScreen — main menu with mode selection.
 *
 * Displays the game title and mode cards for the available trainer rulesets.
 */
export function MenuScreen({ onStart }: MenuScreenProps): React.ReactElement {
  const container: CSSProperties = {
    minHeight: '100vh',
    background: `
      radial-gradient(circle at 20% 20%, rgba(86, 221, 179, 0.14), transparent 24%),
      radial-gradient(circle at 80% 0%, rgba(96, 122, 168, 0.18), transparent 28%),
      linear-gradient(180deg, rgba(5, 9, 20, 0.98), rgba(3, 6, 14, 1))
    `,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONTS.body,
    color: T.text,
    padding: '48px 24px',
  };

  const shell: CSSProperties = {
    ...buildPanelStyle({ elevated: true }),
    width: 'min(1240px, 100%)',
    padding: '32px 32px 28px',
    display: 'grid',
    gap: 28,
    position: 'relative',
    overflow: 'hidden',
  };

  const titleBlock: CSSProperties = {
    textAlign: 'center',
    display: 'grid',
    gap: 10,
    justifyItems: 'center',
  };

  const eyebrow: CSSProperties = {
    ...buildControlStyle({ tone: 'ghost', active: true }),
    borderColor: T.borderBright,
    color: T.textBright,
    padding: '8px 14px',
    fontFamily: FONTS.ui,
    fontSize: '0.72rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'default',
  };

  const title: CSSProperties = {
    fontSize: 'clamp(2.5rem, 6vw, 4.25rem)',
    fontFamily: FONTS.display,
    color: T.classMonk,
    margin: 0,
    letterSpacing: '0.06em',
    textShadow: `0 0 32px ${T.classMonk}33`,
  };

  const subtitle: CSSProperties = {
    fontSize: '1rem',
    fontFamily: FONTS.body,
    color: T.textDim,
    margin: 0,
    maxWidth: 760,
    lineHeight: 1.7,
  };

  const cards: CSSProperties = {
    display: 'flex',
    gap: 18,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 1160,
  };

  const statRow: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
  };

  const statCard: CSSProperties = {
    ...buildPanelStyle({ density: 'compact' }),
    padding: '12px 14px',
    textAlign: 'center',
    background: 'linear-gradient(180deg, rgba(17, 25, 41, 0.94), rgba(8, 13, 24, 0.92))',
  };

  const footer: CSSProperties = {
    ...buildControlStyle({ tone: 'ghost' }),
    margin: '0 auto',
    fontSize: '0.74rem',
    fontFamily: FONTS.ui,
    color: T.textDim,
    padding: '10px 14px',
    cursor: 'default',
  };

  return (
    <div style={container}>
      <div style={shell}>
        <div
          style={{
            position: 'absolute',
            inset: 'auto -18% 48% auto',
            width: 360,
            height: 360,
            background: 'radial-gradient(circle, rgba(86, 221, 179, 0.12), transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={titleBlock}>
          <div style={eyebrow}>Windwalker Monk Trainer</div>
          <h1 style={title}>Modern Combat Practice</h1>
          <p style={subtitle}>
            Sharpen your rotation in a cleaner, darker trainer space inspired by raid tools and in-game HUDs.
            Pick a mode, tune the pacing, and jump straight into the encounter.
          </p>
        </div>

        <div style={statRow}>
          <div style={statCard}>
            <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Class
            </div>
            <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '1rem', marginTop: 6 }}>
              Windwalker Monk
            </div>
          </div>
          <div style={statCard}>
            <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Hero Build
            </div>
            <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '1rem', marginTop: 6 }}>
              Shado-Pan
            </div>
          </div>
          <div style={statCard}>
            <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Focus
            </div>
            <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '1rem', marginTop: 6 }}>
              Readability First
            </div>
          </div>
        </div>

        <div style={cards}>
          <ModeCard
            mode="tutorial"
            title="Tutorial"
            subtitle="Learn the rotation"
            description="Step-by-step guidance on each ability, with explanations of when and why to use them."
            accentColor={T.accent}
            onStart={onStart}
          />
          <ModeCard
            mode="practice"
            title="Practice"
            subtitle="Guided play at 75% speed"
            description="Rotation hints enabled. Play at a comfortable pace to build muscle memory before going live."
            accentColor={T.classMonk}
            onStart={onStart}
          />
          <ModeCard
            mode="test"
            title="Test"
            subtitle="No hints, full speed"
            description="Hints disabled. Simulate a real encounter at 1× speed and see your DPS at the end."
            accentColor={T.gold}
            onStart={onStart}
          />
          <ModeCard
            mode="challenge"
            title="Challenge"
            subtitle="Test plus rhythm"
            description="Keep the same full-speed combat score while surviving rhythm mechanics layered on top."
            accentColor={T.red}
            onStart={onStart}
          />
        </div>

        <div style={footer}>Press Enter on a card or click to begin</div>
      </div>
    </div>
  );
}
