import React from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { FONTS, T } from '@ui/theme/elvui';
import type { ChallengeDifficulty } from '@ui/state/trainerSettings';
import type { ChallengeNoteRuntime, ChallengePlayfield, ChallengePoint } from '@ui/challenge/noteTypes';

interface ChallengeOverlayProps {
  difficulty: ChallengeDifficulty;
  playfield: ChallengePlayfield;
  currentTime: number;
  notes: ChallengeNoteRuntime[];
  onPointerMove: (point: ChallengePoint) => void;
  onPointerDown: (point: ChallengePoint) => void;
  onPointerUp: (point: ChallengePoint) => void;
  onPointerLeave: () => void;
}

function toLocalPoint(event: ReactMouseEvent<HTMLDivElement>, playfield: ChallengePlayfield): ChallengePoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * playfield.width,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * playfield.height,
  };
}

export function ChallengeOverlay({
  playfield,
  currentTime,
  notes,
  onPointerMove,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
}: ChallengeOverlayProps): React.ReactElement {
  const root: CSSProperties = {
    position: 'relative',
    width: playfield.width,
    height: playfield.height,
    background: 'radial-gradient(circle at center, rgba(255,255,255,0.04), transparent 60%)',
    overflow: 'hidden',
    borderRadius: 22,
    border: `1px solid ${T.borderSubtle}`,
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04), 0 18px 40px rgba(0,0,0,0.3)',
  };

  const noteFillByType: Record<ChallengeNoteRuntime['note']['type'], string> = {
    tap: 'rgba(0, 204, 122, 0.88)',
    'ordered-chain': 'rgba(68, 136, 255, 0.88)',
    slider: 'rgba(255, 209, 0, 0.88)',
    hold: 'rgba(255, 140, 0, 0.88)',
    repeat: 'rgba(255, 51, 51, 0.88)',
    'hover-key': 'rgba(170, 120, 255, 0.9)',
  };

  return (
    <div
      data-testid="challenge-overlay"
      style={root}
      onMouseMove={(event): void => onPointerMove(toLocalPoint(event, playfield))}
      onMouseDown={(event): void => {
        if (event.button !== 0) {
          return;
        }
        onPointerDown(toLocalPoint(event, playfield));
      }}
      onMouseUp={(event): void => onPointerUp(toLocalPoint(event, playfield))}
      onMouseLeave={onPointerLeave}
    >
      <svg width={playfield.width} height={playfield.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {notes.flatMap((noteRuntime, index) => {
          const isNextNote = index === 0;
          const remainingRatio = Math.max(
            0,
            Math.min(1, (noteRuntime.note.endTime - currentTime) / Math.max(0.25, noteRuntime.note.endTime - noteRuntime.note.startTime)),
          );
          const approachRadius = noteRuntime.note.radius + remainingRatio * 44;

          const sliderDecorations = noteRuntime.note.type === 'slider'
            ? [
              <line
                key={`${noteRuntime.note.id}-track-shadow`}
                x1={noteRuntime.note.path[0]?.x ?? noteRuntime.note.position.x}
                y1={noteRuntime.note.path[0]?.y ?? noteRuntime.note.position.y}
                x2={noteRuntime.note.path[1]?.x ?? noteRuntime.note.position.x}
                y2={noteRuntime.note.path[1]?.y ?? noteRuntime.note.position.y}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="18"
                strokeLinecap="round"
              />,
              <line
                key={`${noteRuntime.note.id}-track`}
                x1={noteRuntime.note.path[0]?.x ?? noteRuntime.note.position.x}
                y1={noteRuntime.note.path[0]?.y ?? noteRuntime.note.position.y}
                x2={noteRuntime.note.path[1]?.x ?? noteRuntime.note.position.x}
                y2={noteRuntime.note.path[1]?.y ?? noteRuntime.note.position.y}
               stroke="rgba(255, 209, 0, 0.72)"
               strokeWidth="10"
               strokeLinecap="round"
              />,
              <circle
                key={`${noteRuntime.note.id}-target`}
                cx={noteRuntime.note.path[1]?.x ?? noteRuntime.note.position.x}
                cy={noteRuntime.note.path[1]?.y ?? noteRuntime.note.position.y}
                r={noteRuntime.note.radius}
                fill="rgba(255, 247, 209, 0.18)"
                stroke="rgba(255,255,255,0.72)"
                strokeWidth="3"
              />,
             ]
            : [];

          return [
            ...sliderDecorations,
            <circle
              key={`${noteRuntime.note.id}-approach`}
              cx={noteRuntime.note.position.x}
              cy={noteRuntime.note.position.y}
              r={approachRadius}
              fill="none"
              stroke={isNextNote ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)'}
              strokeWidth="3"
            />,
          ];
        })}
      </svg>

      {notes.map((noteRuntime, index) => {
        const { note } = noteRuntime;
        const isNextNote = index === 0;
        const progressRatio = Math.max(0, Math.min(1, noteRuntime.progress / (
          note.type === 'hold'
            ? note.holdDuration
            : note.type === 'slider'
              ? note.travelDuration
              : 1
        )));
        const sliderBallProgress = note.type === 'slider'
          ? progressRatio
          : 0;
        const sliderBallPosition = note.type === 'slider'
          ? {
              x: (note.path[0]?.x ?? note.position.x) + ((note.path[1]?.x ?? note.position.x) - (note.path[0]?.x ?? note.position.x)) * sliderBallProgress,
              y: (note.path[0]?.y ?? note.position.y) + ((note.path[1]?.y ?? note.position.y) - (note.path[0]?.y ?? note.position.y)) * sliderBallProgress,
            }
          : note.position;
        const label = note.type === 'ordered-chain'
          ? `${note.orderIndex + 1}`
          : note.type === 'repeat'
            ? `x${note.requiredClicks - noteRuntime.clickCount}`
            : note.type === 'hold'
              ? `Hold ${note.holdDuration < 1 ? note.holdDuration.toFixed(1) : note.holdDuration.toFixed(0)}s`
              : note.type === 'slider'
                ? 'Slide'
                : note.type === 'hover-key'
                  ? note.requiredKey.toUpperCase()
                  : '';

        return (
          <React.Fragment key={note.id}>
            <div
              data-testid={`challenge-note-${note.id}`}
              style={{
                position: 'absolute',
                left: note.position.x - note.radius,
                top: note.position.y - note.radius,
                width: note.radius * 2,
                height: note.radius * 2,
                borderRadius: '50%',
                border: `3px solid ${isNextNote ? '#ffffff' : T.textBright}`,
                backgroundColor: noteFillByType[note.type],
                color: '#05070c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONTS.ui,
                fontSize: note.type === 'hover-key' ? '0.95rem' : '0.72rem',
                fontWeight: 700,
                userSelect: 'none',
                boxShadow: noteRuntime.pointerActive || isNextNote
                  ? `0 0 18px ${T.textBright}`
                  : '0 0 12px rgba(255,255,255,0.22)',
                outline: note.type === 'hover-key' ? '2px solid rgba(255,255,255,0.32)' : 'none',
              }}
            >
              <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
                <span>{label}</span>
                {note.type === 'hover-key' && (
                  <span style={{ fontSize: '0.52rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hover + Key</span>
                )}
              </div>
            </div>
            {(note.type === 'hold' || note.type === 'slider') && (
              <div
                style={{
                  position: 'absolute',
                  left: sliderBallPosition.x - (note.radius + 7),
                  top: sliderBallPosition.y - (note.radius + 7),
                  width: (note.radius + 7) * 2,
                  height: (note.radius + 7) * 2,
                  borderRadius: '50%',
                  border: `4px solid rgba(255,255,255,${0.25 + progressRatio * 0.55})`,
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                }}
              />
            )}
            {note.type === 'slider' && (
              <div
                style={{
                  position: 'absolute',
                  left: sliderBallPosition.x - 10,
                  top: sliderBallPosition.y - 10,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: '#fff7d1',
                  boxShadow: '0 0 14px rgba(255, 255, 255, 0.7)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
