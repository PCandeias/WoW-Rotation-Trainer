import React from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { FONTS, T } from '@ui/theme/elvui';
import type { ChallengeDifficulty } from '@ui/state/trainerSettings';
import { describeSliderPath, getSliderEndpoints, getSliderPointAtProgress } from '@ui/challenge/sliderGeometry';
import type {
  ChallengeFeedbackBurst,
  ChallengeNoteRuntime,
  ChallengePlayfield,
  ChallengePoint,
} from '@ui/challenge/noteTypes';
import { getChallengeSequenceInfo } from '@ui/challenge/noteTypes';

interface ChallengeOverlayProps {
  difficulty: ChallengeDifficulty;
  playfield: ChallengePlayfield;
  currentTime: number;
  notes: ChallengeNoteRuntime[];
  feedbackBursts: ChallengeFeedbackBurst[];
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

function buildArrowEndpoints(from: ChallengePoint, to: ChallengePoint, radius: number): { start: ChallengePoint; end: ChallengePoint } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const offsetX = (dx / distance) * (radius + 6);
  const offsetY = (dy / distance) * (radius + 6);

  return {
    start: { x: from.x + offsetX, y: from.y + offsetY },
    end: { x: to.x - offsetX, y: to.y - offsetY },
  };
}

export function ChallengeOverlay({
  playfield,
  currentTime,
  notes,
  feedbackBursts,
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
    spinner: 'rgba(97, 245, 255, 0.92)',
  };

  const orderedNotes = notes.reduce<Record<string, {
    id: string;
    note: ChallengeNoteRuntime['note'];
  }[]>>((groups, noteRuntime) => {
    const sequenceInfo = getChallengeSequenceInfo(noteRuntime.note);
    if (!sequenceInfo) {
      return groups;
    }

    const group = groups[sequenceInfo.sequenceId] ?? [];
    group.push({
      id: noteRuntime.note.id,
      note: noteRuntime.note,
    });
    groups[sequenceInfo.sequenceId] = group;
    return groups;
  }, {});

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
        <defs>
          <marker id="challenge-chain-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.78)" />
          </marker>
        </defs>

        {Object.values(orderedNotes).flatMap((chain) => chain
          .sort((left, right) => {
            const leftSequence = getChallengeSequenceInfo(left.note);
            const rightSequence = getChallengeSequenceInfo(right.note);
            return (leftSequence?.orderIndex ?? 0) - (rightSequence?.orderIndex ?? 0);
          })
          .slice(0, -1)
          .map((noteRuntime, index) => {
            const next = chain[index + 1];
            if (!next) {
              return null;
            }

            const arrow = buildArrowEndpoints(noteRuntime.note.position, next.note.position, noteRuntime.note.radius);
            return (
              <line
                key={`${noteRuntime.id}-to-${next.note.id}`}
                data-testid={`challenge-chain-arrow-${noteRuntime.id}`}
                x1={arrow.start.x}
                y1={arrow.start.y}
                x2={arrow.end.x}
                y2={arrow.end.y}
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="3"
                strokeDasharray="7 5"
                markerEnd="url(#challenge-chain-arrow)"
              />
            );
          }))}

        {notes.flatMap((noteRuntime, index) => {
          const isNextNote = index === 0;
          const remainingRatio = Math.max(
            0,
            Math.min(1, (noteRuntime.note.endTime - currentTime) / Math.max(0.25, noteRuntime.note.endTime - noteRuntime.note.startTime)),
          );
          const approachRadius = noteRuntime.note.radius + remainingRatio * 44;
          let sliderDecorations: React.ReactNode[] = [];
          if (noteRuntime.note.type === 'slider') {
            const { end } = getSliderEndpoints(noteRuntime.note.sliderPath);
            const sliderPath = describeSliderPath(noteRuntime.note.sliderPath);
            sliderDecorations = [
              <path
                key={`${noteRuntime.note.id}-track-shadow`}
                d={sliderPath}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="18"
                strokeLinecap="round"
                fill="none"
              />,
              <path
                key={`${noteRuntime.note.id}-track`}
                d={sliderPath}
                stroke="rgba(255, 209, 0, 0.72)"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />,
              <circle
                key={`${noteRuntime.note.id}-target`}
                cx={end.x}
                cy={end.y}
                r={noteRuntime.note.radius}
                fill="rgba(255, 247, 209, 0.18)"
                stroke="rgba(255,255,255,0.72)"
                strokeWidth="3"
              />,
            ];
          } else if (noteRuntime.note.type === 'spinner') {
            sliderDecorations = [
              <circle
                key={`${noteRuntime.note.id}-spinner-ring`}
                cx={noteRuntime.note.position.x}
                cy={noteRuntime.note.position.y}
                r={noteRuntime.note.radius + 12}
                fill="none"
                stroke="rgba(97, 245, 255, 0.28)"
                strokeWidth="16"
              />,
              <circle
                key={`${noteRuntime.note.id}-spinner-progress`}
                data-testid={`challenge-spinner-${noteRuntime.note.id}`}
                cx={noteRuntime.note.position.x}
                cy={noteRuntime.note.position.y}
                r={noteRuntime.note.radius + 12}
                fill="none"
                stroke="rgba(97, 245, 255, 0.88)"
                strokeWidth="7"
                strokeDasharray={`${2 * Math.PI * (noteRuntime.note.radius + 12)}`}
                strokeDashoffset={`${2 * Math.PI * (noteRuntime.note.radius + 12) * (1 - (noteRuntime.progress / noteRuntime.note.requiredRotation))}`}
                transform={`rotate(-90 ${noteRuntime.note.position.x} ${noteRuntime.note.position.y})`}
              />,
            ];
          }

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
              : note.type === 'spinner'
                ? note.requiredRotation
                : 1
        )));
        const sliderBallPosition = note.type === 'slider'
          ? getSliderPointAtProgress(note.sliderPath, progressRatio)
          : note.position;
        const sequenceInfo = getChallengeSequenceInfo(note);
        const label = note.type === 'ordered-chain'
          ? `${note.orderIndex + 1}`
          : note.type === 'repeat'
            ? `x${Math.max(0, note.requiredClicks - noteRuntime.clickCount)}`
            : note.type === 'hold'
              ? `Hold ${note.holdDuration < 1 ? note.holdDuration.toFixed(1) : note.holdDuration.toFixed(0)}s`
              : note.type === 'slider'
                ? note.sliderPath.kind === 'arc'
                  ? 'Curve'
                  : 'Slide'
                : note.type === 'hover-key'
                  ? note.requiredKey.toUpperCase()
                  : note.type === 'spinner'
                    ? 'Spin'
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
                fontSize: note.type === 'hover-key' ? '0.95rem' : note.type === 'spinner' ? '0.92rem' : '0.72rem',
                fontWeight: 700,
                userSelect: 'none',
                boxShadow: noteRuntime.pointerActive || isNextNote
                  ? `0 0 18px ${T.textBright}`
                  : '0 0 12px rgba(255,255,255,0.22)',
                outline: note.type === 'hover-key' ? '2px solid rgba(255,255,255,0.32)' : 'none',
              }}
            >
              <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
                {sequenceInfo && note.type !== 'ordered-chain' && (
                  <span style={{ fontSize: '0.52rem', lineHeight: 1, opacity: 0.92 }}>
                    #{sequenceInfo.orderIndex + 1}
                  </span>
                )}
                <span>{label}</span>
                {note.type === 'hover-key' && (
                  <span style={{ fontSize: '0.52rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hover + Key</span>
                )}
                {note.type === 'spinner' && (
                  <span style={{ fontSize: '0.5rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {(note.requiredRotation / (Math.PI * 2)).toFixed(1)} turns
                  </span>
                )}
              </div>
            </div>
            {(note.type === 'hold' || note.type === 'slider' || note.type === 'spinner') && (
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

      {feedbackBursts.map((feedback) => {
        const remainingRatio = Math.max(0, Math.min(1, (feedback.expiresAt - currentTime) / Math.max(0.1, feedback.expiresAt - feedback.createdAt)));
        return (
          <div
            key={feedback.id}
            data-testid={`challenge-feedback-${feedback.id}`}
            style={{
              position: 'absolute',
              left: feedback.position.x - 48,
              top: feedback.position.y - 62 - ((1 - remainingRatio) * 30),
              width: 96,
              textAlign: 'center',
              color: feedback.text === 'Perfect' ? '#fff6be' : feedback.text === 'Great' ? '#ffffff' : '#c7f5ff',
              fontFamily: FONTS.ui,
              fontSize: '1rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: remainingRatio,
              textShadow: '0 0 16px rgba(0, 0, 0, 0.65)',
              pointerEvents: 'none',
            }}
          >
            {feedback.text}
          </div>
        );
      })}
    </div>
  );
}
