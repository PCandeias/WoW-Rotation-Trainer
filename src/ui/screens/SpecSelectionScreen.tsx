import React from 'react';
import type { CSSProperties } from 'react';
import { AbilityIcon } from '@ui/components/AbilityIcon';
import { FONTS, T } from '@ui/theme/elvui';
import { buildCardStyle } from '@ui/theme/stylePrimitives';
import { getPlayableTrainerSpecs, type TrainerSpecId } from '@ui/specs/specCatalog';

export interface SpecSelectionScreenProps {
  selectedSpec: TrainerSpecId;
  onSelectSpec: (specId: TrainerSpecId) => void;
}

const SPEC_OPTIONS = getPlayableTrainerSpecs();

/**
 * First-run entry screen that selects the active spec before setup.
 */
export function SpecSelectionScreen({
  selectedSpec,
  onSelectSpec,
}: SpecSelectionScreenProps): React.ReactElement {
  const root: CSSProperties = {
    minHeight: '100vh',
    background: `radial-gradient(circle at top, rgba(96, 122, 168, 0.22), transparent 34%), ${T.bg}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: T.text,
    fontFamily: FONTS.body,
    padding: '48px 24px',
  };

  const cardGrid: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'center',
  };

  return (
    <div style={root}>
      <div style={{ textAlign: 'center', marginBottom: 44, display: 'grid', gap: 12, maxWidth: 760 }}>
        <div style={{ color: T.accentWarm, fontFamily: FONTS.ui, fontSize: '0.8rem', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          WoW Rotation Trainer
        </div>
        <h1 style={{ margin: 0, color: T.textBright, fontFamily: FONTS.display, fontSize: '2.8rem', textShadow: '0 10px 30px rgba(0, 0, 0, 0.35)' }}>
          Choose Your Spec
        </h1>
        <p style={{ margin: 0, color: T.text, fontSize: '1rem', lineHeight: 1.7 }}>
          Choose a spec, then configure your encounter. The new UI keeps the combat model intact while making the trainer feel closer to a polished raid-analysis and game HUD experience.
        </p>
      </div>

      <div style={cardGrid}>
        {SPEC_OPTIONS.map((option) => {
          const active = option.id === selectedSpec;
          const cardStyle: CSSProperties = {
            ...buildCardStyle({ active, accentColor: option.accentColor }),
            width: 320,
            padding: '28px 28px 24px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            position: 'relative',
          };

          return (
            <button
              key={option.id}
              type="button"
              style={cardStyle}
              onClick={(): void => onSelectSpec(option.id)}
              aria-pressed={active}
            >
              {option.stampLabel ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    transform: 'rotate(10deg)',
                    border: `1px solid ${option.accentColor}`,
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontFamily: FONTS.ui,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: option.accentColor,
                    background: 'rgba(7, 10, 18, 0.88)',
                    boxShadow: `0 0 0 1px ${option.accentColor}20 inset`,
                  }}
                >
                  {option.stampLabel}
                </div>
              ) : null}
              <div
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: '50%',
                  border: `3px solid ${option.accentColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.14), rgba(5,8,14,0.96))',
                  boxShadow: `0 18px 34px ${option.accentColor}26`,
                  overflow: 'hidden',
                }}
              >
                <AbilityIcon iconName={option.iconName} emoji={option.emoji} size={96} alt={option.specName} />
              </div>
              <div style={{ color: option.accentColor, fontFamily: FONTS.display, fontSize: '1.55rem' }}>{option.specName}</div>
              <div style={{ color: T.textBright, fontFamily: FONTS.body, fontWeight: 700, fontSize: '1rem' }}>{option.className}</div>
              <div style={{ color: T.text, fontSize: '0.92rem', lineHeight: 1.55, textAlign: 'center' }}>
                {option.description}
              </div>
              <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {option.footerLabel}
              </div>
              <div style={{ color: active ? option.accentColor : T.textDim, fontFamily: FONTS.ui, fontSize: '0.76rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {active ? 'Selected Spec' : 'Ready to Select'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
