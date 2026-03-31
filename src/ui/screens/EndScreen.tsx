import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { T, FONTS } from '@ui/theme/elvui';
import { buildControlStyle, buildPanelStyle } from '@ui/theme/stylePrimitives';
import { AbilityIcon } from '@ui/components/AbilityIcon';
import { SPELL_ICONS } from '@ui/components/ActionBar';
import { MONK_BUFF_REGISTRY } from '@core/class_modules/monk/monk_buff_registry';
import { MONK_WW_SPELLS } from '@core/data/spells/monk_windwalker';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';
import { usesCompetitiveTrainerRules, type TrainerMode } from '@ui/state/trainerSettings';
import type { RunAnalysisReport } from '@core/analysis';

// ---------------------------------------------------------------------------
// End Screen
// ---------------------------------------------------------------------------

interface EndScreenProps {
  dps: number;
  totalDamage: number;
  duration: number;
  mode: TrainerMode;
  analysisStatus: 'idle' | 'loading' | 'ready' | 'error';
  analysisReport: RunAnalysisReport | null;
  analysisError: string | null;
  endReason: string | null;
  onRestart: () => void;
  onExit: () => void;
  heading?: string;
  restartLabel?: string;
  exitLabel?: string;
}

const ANALYSIS_SERIES = {
  player: '#17d4ff',
  trainer: '#ffb84d',
  playerChi: '#1fd58f',
  trainerChi: '#ffd166',
  playerEnergy: '#ff6b6b',
  trainerEnergy: '#8ea2ff',
};

function gradeForRatio(ratio: number): { label: string; color: string } {
  if (ratio >= 0.97) return { label: 'S', color: T.gradeS };
  if (ratio >= 0.9) return { label: 'A', color: T.gradeA };
  if (ratio >= 0.8) return { label: 'B', color: T.gradeB };
  if (ratio >= 0.7) return { label: 'C', color: T.gradeC };
  return { label: 'D', color: T.gradeD };
}

function gradeForDps(dps: number): { label: string; color: string } {
  if (dps >= 120_000) return { label: 'S', color: T.gradeS };
  if (dps >= 90_000) return { label: 'A', color: T.gradeA };
  if (dps >= 65_000) return { label: 'B', color: T.gradeB };
  if (dps >= 40_000) return { label: 'C', color: T.gradeC };
  return { label: 'D', color: T.gradeD };
}

export default function EndScreen({
  dps,
  totalDamage,
  duration,
  mode,
  analysisStatus,
  analysisReport,
  analysisError,
  endReason,
  onRestart,
  onExit,
  heading = 'Encounter Complete',
  restartLabel = 'Run Again',
  exitLabel = 'Back to Setup',
}: EndScreenProps): React.ReactElement {
  const trainerRatio = analysisReport?.score.trainerDpsRatio ?? 0;
  const summaryDps = analysisStatus === 'ready' && analysisReport ? analysisReport.score.playerDps : dps;
  const summaryTotalDamage = analysisStatus === 'ready' && analysisReport ? analysisReport.score.playerTotalDamage : totalDamage;
  const { label, color } = analysisStatus === 'ready'
    ? gradeForRatio(analysisReport?.score.trainerDpsRatio ?? 0)
    : gradeForDps(summaryDps);
  const failedChallenge = endReason === 'challenge_failure';

  const overlay: CSSProperties = {
    width: '100%',
    height: '100dvh',
    background: `radial-gradient(circle at top, rgba(96, 122, 168, 0.16), transparent 28%), ${T.bg}`,
    padding: 12,
    boxSizing: 'border-box',
    overflowX: 'hidden',
    overflowY: 'hidden',
  };

  const shell: CSSProperties = {
    width: 'min(1880px, 100%)',
    height: 'calc(100dvh - 24px)',
    margin: '0 auto',
    display: 'grid',
    gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
    gap: 12,
    minHeight: 0,
  };

  const hero: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(280px, 0.9fr) minmax(0, 1.5fr)',
    gap: 14,
    alignItems: 'center',
    minHeight: 0,
  };

  const gradeStyle: CSSProperties = {
    fontSize: '4.5rem',
    fontFamily: FONTS.display,
    color,
    textShadow: `0 0 30px ${color}88`,
    lineHeight: 1,
  };

  const stats: CSSProperties = {
    display: 'flex',
    gap: 18,
    flexWrap: 'wrap',
    fontFamily: FONTS.ui,
    fontSize: '0.9rem',
    color: T.text,
  };

  const benchmarkStrip: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
    alignItems: 'stretch',
  };

  const benchmarkItem: CSSProperties = {
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    padding: '10px 12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    display: 'grid',
    gap: 6,
    minWidth: 0,
  };

  const statItem: CSSProperties = {
    textAlign: 'center',
  };

  const statValue: CSSProperties = {
    fontSize: '1.4rem',
    color: T.textBright,
    display: 'block',
    marginBottom: 4,
  };

  const statLbl: CSSProperties = {
    fontSize: '0.7rem',
    color: T.textDim,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };

  const btnRow: CSSProperties = {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
  };

  const reportGrid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(420px, 1fr) minmax(420px, 1fr) minmax(380px, 0.92fr)',
    gridTemplateRows: 'minmax(286px, 0.82fr) minmax(340px, 1.08fr) minmax(286px, 0.9fr)',
    gap: 12,
    minHeight: 0,
    overflow: 'auto',
    scrollbarGutter: 'stable both-edges',
    alignContent: 'start',
    paddingRight: 4,
    paddingBottom: 4,
  };

  const btnBase: CSSProperties = {
    ...buildControlStyle({ tone: 'secondary' }),
    fontSize: '0.85rem',
    padding: '10px 24px',
  };

  const btnPrimary: CSSProperties = {
    ...btnBase,
    ...buildControlStyle({ tone: 'primary' }),
  };

  const btnSecondary: CSSProperties = {
    ...btnBase,
    ...buildControlStyle({ tone: 'ghost' }),
    color: T.textDim,
  };

  const title: CSSProperties = {
    fontFamily: FONTS.display,
    fontSize: '1.5rem',
    color: T.textBright,
    margin: 0,
  };

  return (
    <div style={overlay}>
      <div style={shell}>
        <div style={{ display: 'grid', gap: 6 }}>
          <h2 style={title}>{heading}</h2>
          {failedChallenge && heading === 'Encounter Complete' && (
            <div style={{ color: T.red, fontFamily: FONTS.ui, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Challenge Failed
            </div>
          )}
        </div>

        <div style={hero}>
          {usesCompetitiveTrainerRules(mode) && <div style={gradeStyle}>{label}</div>}
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Benchmark Score
            </div>
            <div style={{ color: T.textBright, fontSize: '1.2rem' }}>
              {analysisStatus === 'ready'
                ? `${Math.round(trainerRatio * 100)}% of trainer DPS`
                : 'Preparing trainer comparison'}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={benchmarkStrip}>
              <div style={benchmarkItem}>
                <span style={statLbl}>Your DPS</span>
                <span style={{ ...statValue, marginBottom: 0 }}>{Math.round(summaryDps).toLocaleString()}</span>
              </div>
              <div style={benchmarkItem}>
                <span style={statLbl}>Trainer DPS</span>
                <span style={{ ...statValue, marginBottom: 0 }}>
                  {analysisStatus === 'ready' && analysisReport
                    ? Math.round(analysisReport.score.trainerDps).toLocaleString()
                    : '...'}
                </span>
              </div>
              <div style={benchmarkItem}>
                <span style={statLbl}>Current Gap</span>
                <span style={{ ...statValue, marginBottom: 0, fontSize: '1.25rem' }}>
                  {analysisStatus === 'ready' && analysisReport
                    ? formatDpsGap(analysisReport.score.trainerDps, analysisReport.score.playerDps)
                    : 'Preparing benchmark'}
                </span>
              </div>
            </div>
            <div style={stats}>
              <div style={statItem}>
                <span style={statValue}>{(summaryTotalDamage / 1_000_000).toFixed(2)}M</span>
                <span style={statLbl}>Total Damage</span>
              </div>
              <div style={statItem}>
                <span style={statValue}>{duration}s</span>
                <span style={statLbl}>Duration</span>
              </div>
              <div style={statItem}>
                <span style={statValue}>
                  {analysisStatus === 'ready' ? `${Math.round(trainerRatio * 100)}%` : '...'}
                </span>
                <span style={statLbl}>Vs Trainer</span>
              </div>
            </div>
          </div>
        </div>

        <div data-testid="analysis-report-grid" style={reportGrid}>
          <ReportCard
            title="Damage Review"
            subtitle="Compare pacing and total damage against the trainer."
            bodyOverflow="hidden"
            style={{ gridColumn: '1', gridRow: '1' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport
                ? (
                  <DamageChartPanel
                    damageOverTime={analysisReport.charts.damageOverTime}
                    cumulativeDamage={analysisReport.charts.cumulativeDamage}
                  />
                )
                : null,
              'Loading trainer comparison...',
            )}
          />
          <ReportCard
            title="Ability Damage"
            subtitle="Castable ability breakdown, with proc detail on hover."
            bodyOverflow="auto"
            style={{ gridColumn: '2', gridRow: '1' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport
                ? (
                  <AbilityDamageBreakdownPanel
                    rows={analysisReport.damageBreakdown ?? []}
                    playerTotalDamage={analysisReport.score.playerTotalDamage}
                    trainerTotalDamage={analysisReport.score.trainerTotalDamage}
                  />
                )
                : null,
              'Loading trainer comparison...',
            )}
          />
          <ReportCard
            title="Spell Timeline"
            subtitle="Cast-by-cast comparison across the encounter."
            bodyOverflow="auto"
            style={{ gridColumn: '1 / span 2', gridRow: '2' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport ? <SpellTimeline data={analysisReport.charts.spellTimeline} encounterDuration={duration} /> : null,
              'Loading spell timeline...',
            )}
          />
          <ReportCard
            title="Exact Mistakes"
            subtitle="Compare your choice against the trainer's call in the same spot."
            bodyOverflow="auto"
            style={{ gridColumn: '3', gridRow: '1 / span 2' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport
                ? (
                  analysisReport.score.duration <= 30
                    ? (
                      <div>
                        Exact mistakes are disabled for 30-second opener runs because this view is meant for full-fight decision review, not opener-only snapshots.
                      </div>
                    )
                    : <ExactMistakesPanel mistakes={analysisReport.exactMistakes} />
                )
                : null,
              'Loading precise decision review...',
            )}
          />
          <ReportCard
            title="Resource Waste"
            subtitle="Track Chi and Energy waste separately so overcaps are easier to spot."
            bodyOverflow="hidden"
            style={{ gridColumn: '1 / span 2', gridRow: '3' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport ? <ResourceWasteChart data={analysisReport.charts.resourceWaste} /> : null,
              'Loading resource comparison...',
            )}
          />
          <ReportCard
            title="Improvement Notes"
            subtitle="Start with the biggest damage losses first."
            bodyOverflow="auto"
            style={{ gridColumn: '3', gridRow: '3' }}
            body={renderAnalysisState(
              analysisStatus,
              analysisError,
              analysisReport ? <ImprovementNotes findings={analysisReport.findings} /> : null,
              usesCompetitiveTrainerRules(mode)
                ? 'Loading trainer-backed coaching...'
                : 'Loading practice coaching...',
            )}
          />
        </div>

        <div style={btnRow}>
          <button style={btnPrimary} onClick={onRestart}>
            {restartLabel}
          </button>
          <button style={btnSecondary} onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportCard({
  title,
  subtitle,
  body,
  bodyOverflow = 'auto',
  style,
}: {
  title: string;
  subtitle?: string;
  body: React.ReactNode;
  bodyOverflow?: CSSProperties['overflow'];
  style?: CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        ...buildPanelStyle({ elevated: true, density: 'compact' }),
        borderRadius: 18,
        padding: '14px 16px',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          color: T.textBright,
          fontFamily: FONTS.display,
          fontSize: '1.05rem',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div style={{ color: T.textDim, fontSize: '0.74rem', lineHeight: 1.3, marginBottom: 8 }}>
          {subtitle}
        </div>
      )}
      <div style={{ color: T.textDim, lineHeight: 1.5, flex: 1, minHeight: 0, overflow: bodyOverflow }}>
        {body}
      </div>
    </div>
  );
}

function renderAnalysisState(
  status: EndScreenProps['analysisStatus'],
  error: string | null,
  readyBody: React.ReactNode,
  loadingMessage: string,
): React.ReactNode {
  if (status === 'error') {
    return <div>{error ?? 'Analysis could not be generated.'}</div>;
  }

  if (status !== 'ready') {
    return <div>{loadingMessage}</div>;
  }

  return readyBody;
}

function AnalysisLineChart({
  data,
  yFormatter,
  lineType = 'monotone',
}: {
  data: RunAnalysisReport['charts']['damageOverTime'];
  yFormatter: (value: number) => string;
  lineType?: 'monotone' | 'linear';
}): React.ReactElement {
  const axisTick = { fill: T.textDim, fontSize: 11, fontFamily: FONTS.body };
  const chartTooltipStyle = {
    backgroundColor: T.bgPanelRaised,
    borderColor: T.borderBright,
    color: T.textBright,
    borderRadius: 12,
    boxShadow: T.shadow,
  };

  const chart = (width?: number, height?: number): React.ReactElement => (
    <LineChart data={data} width={width} height={height}>
      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="2 6" vertical={false} />
      <XAxis dataKey="time" stroke={T.textMuted} tick={axisTick} tickLine={false} axisLine={false} />
      <YAxis stroke={T.textMuted} tick={axisTick} tickFormatter={yFormatter} width={52} tickLine={false} axisLine={false} />
      <Tooltip
        formatter={(value: number) => yFormatter(value)}
        labelFormatter={(value) => `${value}s`}
        contentStyle={chartTooltipStyle}
      />
      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
      <Line type={lineType} dataKey="player" name="You" stroke={ANALYSIS_SERIES.player} dot={false} strokeWidth={2.75} />
      <Line type={lineType} dataKey="trainer" name="Trainer" stroke={ANALYSIS_SERIES.trainer} strokeDasharray="7 4" dot={false} strokeWidth={2.5} />
    </LineChart>
  );

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 220, minWidth: 0, overflow: 'hidden' }}>
      {typeof ResizeObserver === 'undefined'
        ? chart(520, 220)
        : (
          <ResponsiveContainer width="100%" height="100%" debounce={80}>
            {chart()}
          </ResponsiveContainer>
        )}
    </div>
  );
}

function PanelPaginationControls({
  previousLabel,
  nextLabel,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: {
  previousLabel: string;
  nextLabel: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'inline-flex', gap: 8 }}>
      <button
        type="button"
        aria-label={previousLabel}
        disabled={!canGoPrevious}
        onClick={onPrevious}
        style={{
          ...buildControlStyle({ tone: 'ghost' }),
          width: 32,
          height: 32,
          padding: 0,
          opacity: canGoPrevious ? 1 : 0.45,
        }}
      >
        ←
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={!canGoNext}
        onClick={onNext}
        style={{
          ...buildControlStyle({ tone: 'ghost' }),
          width: 32,
          height: 32,
          padding: 0,
          opacity: canGoNext ? 1 : 0.45,
        }}
      >
        →
      </button>
    </div>
  );
}

function DamageChartPanel({
  damageOverTime,
  cumulativeDamage,
}: {
  damageOverTime: RunAnalysisReport['charts']['damageOverTime'];
  cumulativeDamage: RunAnalysisReport['charts']['cumulativeDamage'];
}): React.ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0);
  const pages = [
    {
      key: 'damage-over-time',
      title: 'Damage Over Time',
      subtitle: 'See where your pace drifted away from the trainer.',
      chart: <AnalysisLineChart data={damageOverTime} yFormatter={formatCompactNumber} />,
    },
    {
      key: 'cumulative-damage',
      title: 'Cumulative Damage',
      subtitle: 'Spot missed burst windows in the total-damage gap.',
      chart: <AnalysisLineChart data={cumulativeDamage} yFormatter={formatCompactNumber} lineType="linear" />,
    },
  ] as const;

  useEffect(() => {
    setCurrentIndex(0);
  }, [damageOverTime, cumulativeDamage]);

  const page = pages[Math.max(0, Math.min(currentIndex, pages.length - 1))]!;
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < pages.length - 1;

  return (
    <div style={{ display: 'grid', gap: 8, height: '100%', minHeight: 0, gridTemplateRows: 'auto auto minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ color: T.textDim, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          View {currentIndex + 1} of {pages.length}
        </div>
        <PanelPaginationControls
          previousLabel="Previous damage chart"
          nextLabel="Next damage chart"
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          onNext={() => setCurrentIndex((index) => Math.min(pages.length - 1, index + 1))}
        />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '0.92rem' }}>{page.title}</div>
        <div style={{ color: T.textDim, fontSize: '0.74rem', lineHeight: 1.25 }}>{page.subtitle}</div>
      </div>
      <div style={{ minHeight: 0 }}>{page.chart}</div>
    </div>
  );
}

function ResourceWasteChart({ data }: { data: RunAnalysisReport['charts']['resourceWaste'] }): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 14,
      }}
    >
      <ResourceWastePanel
        title="Chi Waste"
        data={data}
        playerKey="playerChi"
        trainerKey="trainerChi"
        playerColor={ANALYSIS_SERIES.playerChi}
        trainerColor={ANALYSIS_SERIES.trainerChi}
      />
      <ResourceWastePanel
        title="Energy Waste"
        data={data}
        playerKey="playerEnergy"
        trainerKey="trainerEnergy"
        playerColor={ANALYSIS_SERIES.playerEnergy}
        trainerColor={ANALYSIS_SERIES.trainerEnergy}
      />
    </div>
  );
}

function ResourceWastePanel({
  title,
  data,
  playerKey,
  trainerKey,
  playerColor,
  trainerColor,
}: {
  title: string;
  data: RunAnalysisReport['charts']['resourceWaste'];
  playerKey: 'playerChi' | 'playerEnergy';
  trainerKey: 'trainerChi' | 'trainerEnergy';
  playerColor: string;
  trainerColor: string;
}): React.ReactElement {
  const chartTooltipStyle = {
    backgroundColor: T.bgPanelRaised,
    borderColor: T.borderBright,
    color: T.textBright,
    borderRadius: 12,
    boxShadow: T.shadow,
  };
  const chart = (width?: number, height?: number): React.ReactElement => (
    <LineChart data={data} width={width} height={height}>
      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="2 6" vertical={false} />
      <XAxis dataKey="time" stroke={T.textMuted} tick={{ fill: T.textDim, fontSize: 11, fontFamily: FONTS.body }} tickLine={false} axisLine={false} />
      <YAxis stroke={playerColor} tick={{ fill: playerColor, fontSize: 11, fontFamily: FONTS.body }} width={40} tickLine={false} axisLine={false} />
      <Tooltip labelFormatter={(value) => `${value}s`} contentStyle={chartTooltipStyle} />
      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
      <Line type="monotone" dataKey={playerKey} name="You" stroke={playerColor} dot={false} strokeWidth={2.5} />
      <Line type="monotone" dataKey={trainerKey} name="Trainer" stroke={trainerColor} strokeDasharray="7 4" dot={false} strokeWidth={2} />
    </LineChart>
  );

  return (
    <div style={{ minWidth: 0, height: '100%', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 10 }}>
      <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '0.92rem' }}>{title}</div>
      <div style={{ width: '100%', height: '100%', minHeight: 210, minWidth: 0, overflow: 'hidden' }}>
        {typeof ResizeObserver === 'undefined'
          ? chart(260, 220)
          : (
            <ResponsiveContainer width="100%" height="100%" debounce={80}>
              {chart()}
            </ResponsiveContainer>
          )}
      </div>
    </div>
  );
}

function SpellTimeline({
  data,
  encounterDuration,
}: {
  data: RunAnalysisReport['charts']['spellTimeline'];
  encounterDuration: number;
}): React.ReactElement {
  if (data.player.length === 0 && data.trainer.length === 0) {
    return <div>No cast timeline is available for this encounter.</div>;
  }

  const tickStep = encounterDuration <= 30 ? 5 : encounterDuration <= 90 ? 10 : 15;
  const tickTimes = Array.from({ length: Math.floor(encounterDuration / tickStep) + 1 }, (_, index) => Math.min(encounterDuration, index * tickStep));
  const playerLane = buildSpellTimelineLane(data.player, encounterDuration);
  const trainerLane = buildSpellTimelineLane(data.trainer, encounterDuration);
  const timelineWidth = Math.max(960, Math.round(encounterDuration * 28));
  const labelColumnWidth = 68;

  return (
    <div style={{ display: 'grid', gap: 12, minHeight: 0, height: '100%', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
      <div style={{ color: T.textDim, fontSize: '0.76rem' }}>
        Scroll horizontally to inspect the full encounter timeline.
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', minHeight: 0, paddingBottom: 4 }}>
        <div style={{ display: 'grid', gap: 12, minWidth: labelColumnWidth + 12 + timelineWidth }}>
          <SpellTimelineLane
            label="You"
            lane={playerLane}
            encounterDuration={encounterDuration}
            accent={ANALYSIS_SERIES.player}
            timelineWidth={timelineWidth}
            labelColumnWidth={labelColumnWidth}
          />
          <SpellTimelineLane
            label="Trainer"
            lane={trainerLane}
            encounterDuration={encounterDuration}
            accent={ANALYSIS_SERIES.trainer}
            timelineWidth={timelineWidth}
            labelColumnWidth={labelColumnWidth}
          />
          <div style={{ display: 'grid', gridTemplateColumns: `${labelColumnWidth}px ${timelineWidth}px`, gap: 12 }}>
            <div />
            <div style={{ position: 'relative', height: 18 }}>
              {tickTimes.map((time) => (
                <div
                  key={`tick-${time}`}
                  style={{
                    position: 'absolute',
                    left: `${Math.max(0, Math.min(100, (time / Math.max(1, encounterDuration)) * 100))}%`,
                    transform: 'translateX(-50%)',
                    color: T.textDim,
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {time}s
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImprovementNotes({ findings }: { findings: RunAnalysisReport['findings'] }): React.ReactElement {
  if (findings.length === 0) {
    return <div>Your run stayed close to the trainer benchmark. Nice work.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {findings.map((finding) => (
        <div
          key={finding.id}
          style={{
            border: `1px solid ${T.border}`,
            borderLeft: `4px solid ${severityColor(finding.severity)}`,
            borderRadius: 10,
            padding: '10px 12px',
            backgroundColor: 'rgba(255,255,255,0.02)',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {finding.focusSpellId && <SpellBadge spellId={finding.focusSpellId} compact />}
              <div style={{ color: T.textBright, fontSize: '0.84rem' }}>{finding.title}</div>
            </div>
            <ImpactBadge value={finding.estimatedDpsLoss} severity={finding.severity} />
          </div>
          {finding.comparisonSpellId && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: T.textDim, fontSize: '0.76rem' }}>Common mismatch:</span>
              <SpellBadge spellId={finding.comparisonSpellId} compact />
              {finding.focusSpellId && (
                <>
                  <span style={{ color: T.textDim, fontSize: '0.76rem' }}>instead of</span>
                  <SpellBadge spellId={finding.focusSpellId} compact />
                </>
              )}
            </div>
          )}
          <div>{finding.summary}</div>
          <div style={{ color: T.textDim, fontSize: '0.78rem', marginTop: 2 }}>
            Fix: {finding.fix} {finding.estimatedDpsLoss > 0 ? `(~${finding.estimatedDpsLoss.toLocaleString()} DPS)` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExactMistakesPanel({ mistakes }: { mistakes: RunAnalysisReport['exactMistakes'] }): React.ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [mistakes]);

  if (mistakes.length === 0) {
    return <div>No clear off-priority mistakes stood out against your own moment-to-moment state.</div>;
  }

  const clampedIndex = Math.max(0, Math.min(currentIndex, mistakes.length - 1));
  const mistake = mistakes[clampedIndex]!;
  const canGoPrevious = clampedIndex > 0;
  const canGoNext = clampedIndex < mistakes.length - 1;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            color: T.textDim,
            fontSize: '0.74rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Mistake {clampedIndex + 1} of {mistakes.length}
        </div>
        <PanelPaginationControls
          previousLabel="Previous exact mistake"
          nextLabel="Next exact mistake"
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          onNext={() => setCurrentIndex((index) => Math.min(mistakes.length - 1, index + 1))}
        />
      </div>
      <div
        key={mistake.id}
        style={{
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: '10px 12px',
          backgroundColor: 'rgba(255,255,255,0.02)',
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: T.textBright, fontSize: '0.84rem' }}>{mistake.title}</div>
          <div style={{ color: T.textDim, fontSize: '0.76rem' }}>{mistake.time.toFixed(1)}s</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <SpellDecisionBadge
            label="You pressed"
            spellId={mistake.playerSpellId}
            emptyLabel="No timely cast"
            tone="actual"
          />
          <span style={{ color: T.textDim, fontSize: '0.76rem' }}>→</span>
          <SpellDecisionBadge label="Best button" spellId={mistake.expectedSpellId} tone="expected" />
        </div>
        <div>{mistake.summary}</div>
        <div
          style={{
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.02)',
            padding: '8px 10px',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ color: T.textDim, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Your state
          </div>
          <DecisionStatePanel state={mistake.playerState} />
        </div>
        <div style={{ color: T.textDim, fontSize: '0.78rem' }}>
          Fix: {mistake.fix}
        </div>
      </div>
    </div>
  );
}

function SpellTimelineLane({
  label,
  lane,
  encounterDuration,
  accent,
  timelineWidth,
  labelColumnWidth,
}: {
  label: string;
  lane: { placements: { spellId: string; time: number; level: number }[]; levelCount: number; count: number };
  encounterDuration: number;
  accent: string;
  timelineWidth: number;
  labelColumnWidth: number;
}): React.ReactElement {
  const trackHeight = Math.max(52, lane.levelCount * 34 + 18);
  const tickStep = encounterDuration <= 30 ? 5 : encounterDuration <= 90 ? 10 : 15;
  const tickTimes = Array.from({ length: Math.floor(encounterDuration / tickStep) + 1 }, (_, index) => Math.min(encounterDuration, index * tickStep));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${labelColumnWidth}px ${timelineWidth}px`, gap: 12 }}>
      <div style={{ display: 'grid', gap: 4, alignContent: 'start', paddingTop: 6 }}>
        <div style={{ color: T.textBright, fontFamily: FONTS.display, fontSize: '0.9rem' }}>{label}</div>
        <div style={{ color: T.textDim, fontSize: '0.72rem' }}>{lane.count} casts</div>
      </div>
      <div
        style={{
          position: 'relative',
          height: trackHeight,
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          backgroundColor: 'rgba(255,255,255,0.03)',
          overflow: 'hidden',
        }}
      >
        {tickTimes.map((time) => (
          <div
            key={`${label}-grid-${time}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${Math.max(0, Math.min(100, (time / Math.max(1, encounterDuration)) * 100))}%`,
              width: 1,
              backgroundColor: 'rgba(255,255,255,0.06)',
            }}
          />
        ))}
        {lane.placements.map((entry, index) => {
          const presentation = getSpellPresentation(entry.spellId);
          return (
            <div
              key={`${label}-${entry.spellId}-${entry.time.toFixed(2)}-${index}`}
              title={`${presentation.label} • ${entry.time.toFixed(1)}s`}
              style={{
                position: 'absolute',
                left: `${Math.max(0, Math.min(100, (entry.time / Math.max(1, encounterDuration)) * 100))}%`,
                top: 8 + entry.level * 34,
                transform: 'translateX(-50%)',
                width: 28,
                height: 28,
                borderRadius: 8,
                border: `1px solid ${accent}66`,
                backgroundColor: 'rgba(10, 16, 30, 0.92)',
                boxShadow: `0 0 12px ${accent}44`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <AbilityIcon
                iconName={presentation.iconName}
                emoji={presentation.emoji}
                size={22}
                alt={presentation.label}
                style={{ borderRadius: 6 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildSpellTimelineLane(
  casts: RunAnalysisReport['charts']['spellTimeline']['player'],
  encounterDuration: number,
): {
  placements: { spellId: string; time: number; level: number }[];
  levelCount: number;
  count: number;
} {
  const sortedCasts = [...casts].sort((left, right) => left.time - right.time);
  const levelLastTimes: number[] = [];
  const minimumGap = Math.max(0.9, Math.min(2, encounterDuration / 55));
  const placements = sortedCasts.map((cast) => {
    let level = levelLastTimes.findIndex((lastTime) => cast.time - lastTime >= minimumGap);
    if (level === -1) {
      level = levelLastTimes.length;
      levelLastTimes.push(cast.time);
    } else {
      levelLastTimes[level] = cast.time;
    }

    return {
      spellId: cast.spellId,
      time: cast.time,
      level,
    };
  });

  return {
    placements,
    levelCount: Math.max(1, levelLastTimes.length),
    count: sortedCasts.length,
  };
}

function ImpactBadge({
  value,
  severity,
}: {
  value: number;
  severity: RunAnalysisReport['findings'][number]['severity'];
}): React.ReactElement {
  return (
    <div
      style={{
        color: severity === 'major' ? T.red : severity === 'medium' ? T.gold : T.textDim,
        border: `1px solid ${severityColor(severity)}55`,
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: '0.72rem',
        whiteSpace: 'nowrap',
      }}
    >
      {value > 0 ? `~${value.toLocaleString()} DPS` : 'Low impact'}
    </div>
  );
}

function getSpellPresentation(spellId: string | null | undefined): {
  label: string;
  iconName?: string;
  emoji: string;
} {
  if (!spellId) {
    return {
      label: 'No timely cast',
      iconName: 'inv_misc_questionmark',
      emoji: '…',
    };
  }

  const spell = MONK_WW_SPELLS.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId);
  const icon = SPELL_ICONS[spellId] ?? { iconName: 'inv_misc_questionmark', emoji: '❔' };
  return {
    label: spell?.displayName ?? titleCaseSpellId(spellId),
    iconName: icon.iconName,
    emoji: icon.emoji,
  };
}

function SpellBadge({
  spellId,
  compact = false,
}: {
  spellId: string;
  compact?: boolean;
}): React.ReactElement {
  const presentation = getSpellPresentation(spellId);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <AbilityIcon
        iconName={presentation.iconName}
        emoji={presentation.emoji}
        size={compact ? 22 : 26}
        alt={presentation.label}
        style={{ borderRadius: 6, boxShadow: '0 0 12px rgba(0,0,0,0.35)' }}
      />
      <span style={{ color: T.textBright, fontSize: compact ? '0.76rem' : '0.8rem' }}>{presentation.label}</span>
    </div>
  );
}

function SpellDecisionBadge({
  label,
  spellId,
  emptyLabel,
  tone,
}: {
  label: string;
  spellId: string | null;
  emptyLabel?: string;
  tone: 'actual' | 'expected';
}): React.ReactElement {
  const presentation = getSpellPresentation(spellId);
  const borderColor = tone === 'expected' ? `${T.accent}88` : `${T.red}66`;
  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        backgroundColor: tone === 'expected' ? 'rgba(0,204,122,0.08)' : 'rgba(255,51,51,0.08)',
        borderRadius: 10,
        padding: '8px 10px',
        display: 'grid',
        gap: 6,
        minWidth: 180,
      }}
    >
      <div style={{ color: T.textDim, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AbilityIcon
          iconName={presentation.iconName}
          emoji={presentation.emoji}
          size={28}
          alt={spellId ? presentation.label : emptyLabel ?? presentation.label}
          style={{ borderRadius: 7 }}
        />
        <div style={{ color: T.textBright, fontSize: '0.82rem' }}>
          {spellId ? presentation.label : emptyLabel ?? presentation.label}
        </div>
      </div>
    </div>
  );
}

function DecisionStatePanel({
  state,
}: {
  state: RunAnalysisReport['exactMistakes'][number]['playerState'];
}): React.ReactElement {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StateValue label="Energy" value={Math.round(state.energy).toString()} />
        <StateValue label="Chi" value={Math.round(state.chi).toString()} />
        <StateValue label="Previous" value={state.previousAbility ? getSpellPresentation(state.previousAbility).label : 'None'} />
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ color: T.textDim, fontSize: '0.74rem' }}>Top recommendations</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {state.topRecommendations.length > 0
            ? state.topRecommendations.map((spellId) => <SpellBadge key={spellId} spellId={spellId} compact />)
            : <div style={{ color: T.textDim, fontSize: '0.76rem' }}>No recommendation recorded.</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ color: T.textDim, fontSize: '0.74rem' }}>Tracked buffs</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {state.activeBuffs.length > 0
              ? state.activeBuffs.map((buff) => (
                <BuffBadge
                  key={buff.buffId}
                  buffId={buff.buffId}
                  stacks={buff.stacks}
                  remaining={buff.remaining}
                />
              ))
              : <div style={{ color: T.textDim, fontSize: '0.76rem' }}>No tracked buffs active.</div>}
          </div>
        </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ color: T.textDim, fontSize: '0.74rem' }}>Essential cooldowns</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {state.activeCooldowns.length > 0
            ? state.activeCooldowns.map((cooldown) => (
              <CooldownStateBadge
                key={cooldown.spellId}
                spellId={cooldown.spellId}
                remaining={cooldown.remaining}
                isReady={cooldown.isReady}
                label={cooldown.label}
              />
            ))
            : <div style={{ color: T.textDim, fontSize: '0.76rem' }}>No essential cooldowns recorded.</div>}
        </div>
      </div>
    </div>
  );
}

function StateValue({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: '0.76rem',
        color: T.textBright,
        backgroundColor: 'rgba(255,255,255,0.03)',
      }}
    >
      <span style={{ color: T.textDim }}>{label}:</span> {value}
    </div>
  );
}

function CooldownStateBadge({
  spellId,
  remaining,
  isReady,
  label,
}: {
  spellId: string;
  remaining: number;
  isReady?: boolean;
  label?: string;
}): React.ReactElement {
  const displayLabel = label ?? (remaining > 0 ? `${remaining.toFixed(1)}s` : 'Ready');
  const ready = isReady ?? remaining <= 0;

  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: '6px 8px',
        backgroundColor: 'rgba(255,255,255,0.03)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <SpellBadge spellId={spellId} compact />
      <span style={{ color: ready ? T.accent : T.textDim, fontSize: '0.76rem' }}>
        {displayLabel}
      </span>
    </div>
  );
}

function BuffBadge({
  buffId,
  stacks,
  remaining,
}: {
  buffId: string;
  stacks: number;
  remaining?: number;
}): React.ReactElement {
  const label = MONK_BUFF_REGISTRY[buffId]?.displayName ?? titleCaseSpellId(buffId);
  const iconName = MONK_BUFF_REGISTRY[buffId]?.iconName ?? 'inv_misc_questionmark';
  const hideTimer = MONK_BUFF_REGISTRY[buffId]?.hideTimer === true;
  const timerLabel = !hideTimer && typeof remaining === 'number' && remaining > 0
    ? (remaining >= 10 ? `${Math.ceil(remaining)}s` : `${remaining.toFixed(1)}s`)
    : null;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        padding: '4px 8px 4px 4px',
        backgroundColor: 'rgba(255,255,255,0.03)',
      }}
    >
      <AbilityIcon iconName={iconName} emoji="✨" size={20} alt={label} style={{ borderRadius: 999 }} />
      <span style={{ color: T.textBright, fontSize: '0.75rem' }}>
        {label}
        {stacks > 1 ? ` x${stacks}` : ''}
      </span>
      {timerLabel && <span style={{ color: T.textDim, fontSize: '0.72rem' }}>{timerLabel}</span>}
    </div>
  );
}

function AbilityDamageBreakdownPanel({
  rows,
  playerTotalDamage,
  trainerTotalDamage,
}: {
  rows: RunAnalysisReport['damageBreakdown'];
  playerTotalDamage: number;
  trainerTotalDamage: number;
}): React.ReactElement {
  const breakdownRows = rows ?? [];
  if (breakdownRows.length === 0) {
    return <div>No damaging castable abilities were recorded for this encounter.</div>;
  }

  const maxPlayerDamage = Math.max(1, ...breakdownRows.map((row) => row.player.totalDamage));
  const maxTrainerDamage = Math.max(1, ...breakdownRows.map((row) => row.trainer.totalDamage));

  return (
    <div style={{ display: 'grid', gap: 10, minHeight: 0 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
          gap: 12,
          alignItems: 'end',
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: T.textDim, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>You</div>
          <div style={{ color: T.textBright, fontSize: '0.86rem' }}>{formatCompactNumber(playerTotalDamage)}</div>
        </div>
        <div style={{ color: T.textDim, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Ability
        </div>
        <div>
          <div style={{ color: T.textDim, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Trainer</div>
          <div style={{ color: T.textBright, fontSize: '0.86rem' }}>{formatCompactNumber(trainerTotalDamage)}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {breakdownRows.map((row) => (
          <AbilityDamageBreakdownRowView
            key={row.spellId}
            row={row}
            maxPlayerDamage={maxPlayerDamage}
            maxTrainerDamage={maxTrainerDamage}
            playerTotalDamage={playerTotalDamage}
            trainerTotalDamage={trainerTotalDamage}
          />
        ))}
      </div>
    </div>
  );
}

function AbilityDamageBreakdownRowView({
  row,
  maxPlayerDamage,
  maxTrainerDamage,
  playerTotalDamage,
  trainerTotalDamage,
}: {
  row: NonNullable<RunAnalysisReport['damageBreakdown']>[number];
  maxPlayerDamage: number;
  maxTrainerDamage: number;
  playerTotalDamage: number;
  trainerTotalDamage: number;
}): React.ReactElement {
  const tooltip = formatAbilityBreakdownTooltip(row, playerTotalDamage, trainerTotalDamage);

  return (
    <div
      title={tooltip}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        gap: 12,
        alignItems: 'center',
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: '8px 10px',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <AbilityDamageBreakdownSideView
        side={row.player}
        maxDamage={maxPlayerDamage}
        totalDamage={playerTotalDamage}
        color={ANALYSIS_SERIES.player}
        align="right"
      />
      <div style={{ minWidth: 180, display: 'grid', justifyItems: 'center', gap: 4 }}>
        <SpellBadge spellId={row.spellId} compact />
      </div>
      <AbilityDamageBreakdownSideView
        side={row.trainer}
        maxDamage={maxTrainerDamage}
        totalDamage={trainerTotalDamage}
        color={ANALYSIS_SERIES.trainer}
        align="left"
      />
    </div>
  );
}

function AbilityDamageBreakdownSideView({
  side,
  maxDamage,
  totalDamage,
  color,
  align,
}: {
  side: NonNullable<RunAnalysisReport['damageBreakdown']>[number]['player'];
  maxDamage: number;
  totalDamage: number;
  color: string;
  align: 'left' | 'right';
}): React.ReactElement {
  const percentage = totalDamage > 0 ? (side.totalDamage / totalDamage) * 100 : 0;
  const width = side.totalDamage > 0 ? Math.max(6, (side.totalDamage / Math.max(1, maxDamage)) * 100) : 0;

  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: T.textBright, fontSize: '0.8rem' }}>{formatCompactNumber(side.totalDamage)}</span>
        <span style={{ color: T.textDim, fontSize: '0.74rem' }}>
          {percentage > 0 ? `${percentage.toFixed(1)}%` : '0.0%'} • {side.casts} cast{side.casts === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 220,
            height: 14,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
            display: 'flex',
            justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
          }}
        >
          <div
            style={{
              width: `${width}%`,
              minWidth: width > 0 ? 6 : 0,
              height: '100%',
              background: `linear-gradient(90deg, ${color}aa, ${color})`,
              boxShadow: `0 0 12px ${color}55`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function titleCaseSpellId(spellId: string): string {
  return spellId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return Math.round(value).toString();
}

function formatAbilityBreakdownTooltip(
  row: NonNullable<RunAnalysisReport['damageBreakdown']>[number],
  playerTotalDamage: number,
  trainerTotalDamage: number,
): string {
  const spellLabel = getSpellPresentation(row.spellId).label;
  return [
    spellLabel,
    formatAbilityBreakdownTooltipSection('You', row.player, playerTotalDamage),
    formatAbilityBreakdownTooltipSection('Trainer', row.trainer, trainerTotalDamage),
  ].join('\n\n');
}

function formatAbilityBreakdownTooltipSection(
  label: string,
  side: NonNullable<RunAnalysisReport['damageBreakdown']>[number]['player'],
  totalDamage: number,
): string {
  const share = totalDamage > 0 ? (side.totalDamage / totalDamage) * 100 : 0;
  const lines = [
    `${label}: ${formatCompactNumber(side.totalDamage)} total (${share.toFixed(1)}%) • ${side.casts} cast${side.casts === 1 ? '' : 's'}`,
  ];

  if (side.sources.length === 0) {
    lines.push('  No damage recorded.');
    return lines.join('\n');
  }

  for (const source of side.sources) {
    lines.push(
      `  ${getSpellPresentation(source.spellId).label}: ${formatCompactNumber(source.damage)}`
      + ` • ${source.casts} cast${source.casts === 1 ? '' : 's'}`
      + ` • ${source.crits} crit${source.crits === 1 ? '' : 's'}`,
    );
  }

  return lines.join('\n');
}

function formatDpsGap(trainerDps: number, playerDps: number): string {
  const gap = trainerDps - playerDps;
  return gap > 0 ? `${Math.round(gap).toLocaleString()} behind` : 'At benchmark';
}

function severityColor(severity: RunAnalysisReport['findings'][number]['severity']): string {
  switch (severity) {
    case 'major':
      return T.red;
    case 'medium':
      return T.gradeA;
    default:
      return T.textDim;
  }
}
