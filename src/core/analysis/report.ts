import type {
  AnalysisActiveBuffState,
  AnalysisActiveCooldownState,
  AnalysisChartPoint,
  AnalysisDecisionState,
  AnalysisFinding,
  BenchmarkSignature,
  CooldownTimelineRow,
  ExactMistakeEntry,
  RawRunTrace,
  ResourceWasteChartPoint,
  RunAnalysisReport,
  SpellTimelineChart,
  SpecAnalysisProfile,
} from './types';
import { MONK_WW_SPELLS } from '@core/data/spells/monk_windwalker';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';

function titleCaseSpellId(spellId: string): string {
  return spellId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getAverageSpellDamage(trace: RawRunTrace, spellId: string): number {
  const stats = trace.damageBySpell[spellId];
  if (!stats || stats.casts <= 0) {
    return 0;
  }

  return stats.damage / stats.casts;
}

function buildRatioLabel(ratio: number): string {
  if (ratio >= 0.97) return 'S';
  if (ratio >= 0.9) return 'A';
  if (ratio >= 0.8) return 'B';
  if (ratio >= 0.7) return 'C';
  return 'D';
}

function buildDamageSeries(player: RawRunTrace, trainer: RawRunTrace): AnalysisChartPoint[] {
  const length = Math.max(player.damageTimelineBySecond.length, trainer.damageTimelineBySecond.length);
  const points: AnalysisChartPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    points.push({
      time: index,
      player: player.damageTimelineBySecond[index] ?? 0,
      trainer: trainer.damageTimelineBySecond[index] ?? 0,
    });
  }
  return points;
}

function buildCumulativeSeries(player: RawRunTrace, trainer: RawRunTrace): AnalysisChartPoint[] {
  const length = Math.max(player.cumulativeDamageBySecond.length, trainer.cumulativeDamageBySecond.length);
  const points: AnalysisChartPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    points.push({
      time: index,
      player: player.cumulativeDamageBySecond[index] ?? player.totalDamage,
      trainer: trainer.cumulativeDamageBySecond[index] ?? trainer.totalDamage,
    });
  }
  return points;
}

function buildResourceWasteSeries(player: RawRunTrace, trainer: RawRunTrace): ResourceWasteChartPoint[] {
  const length = Math.max(player.wasteTimelineBySecond.energy.length, trainer.wasteTimelineBySecond.energy.length);
  const points: ResourceWasteChartPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    points.push({
      time: index,
      playerChi: player.wasteTimelineBySecond.chi[index] ?? 0,
      trainerChi: trainer.wasteTimelineBySecond.chi[index] ?? 0,
      playerEnergy: player.wasteTimelineBySecond.energy[index] ?? 0,
      trainerEnergy: trainer.wasteTimelineBySecond.energy[index] ?? 0,
    });
  }
  return points;
}

function titleCaseBuffId(buffId: string): string {
  return buffId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildCooldownRows(profile: SpecAnalysisProfile, player: RawRunTrace, trainer: RawRunTrace): CooldownTimelineRow[] {
  return profile.importantCooldowns.map((spellId) => ({
    spellId,
    label: titleCaseSpellId(spellId),
    playerTimes: player.casts.filter((entry) => entry.spellId === spellId).map((entry) => entry.time),
    trainerTimes: trainer.casts.filter((entry) => entry.spellId === spellId).map((entry) => entry.time),
  }));
}

function buildSpellTimelineChart(player: RawRunTrace, trainer: RawRunTrace): SpellTimelineChart {
  return {
    player: [...player.casts].sort((left, right) => left.time - right.time),
    trainer: [...trainer.casts].sort((left, right) => left.time - right.time),
  };
}

function buildAplFindings(profile: SpecAnalysisProfile, player: RawRunTrace, trainer: RawRunTrace): AnalysisFinding[] {
  const grouped = new Map<string, { actualCounts: Map<string, number>; times: number[] }>();
  for (const cast of player.casts) {
    if (!cast.recommendedSpellId || cast.recommendedSpellId === cast.spellId) {
      continue;
    }

    const explanation = profile.explainRecommendedSpell(cast.recommendedSpellId);
    if (!explanation) {
      continue;
    }

    const existing = grouped.get(cast.recommendedSpellId) ?? { actualCounts: new Map<string, number>(), times: [] };
    existing.actualCounts.set(cast.spellId, (existing.actualCounts.get(cast.spellId) ?? 0) + 1);
    existing.times.push(cast.time);
    grouped.set(cast.recommendedSpellId, existing);
  }

  return [...grouped.entries()].flatMap(([expectedSpellId, details]) => {
    const explanation = profile.explainRecommendedSpell(expectedSpellId);
    if (!explanation) {
      return [];
    }

    const averageExpectedDamage = getAverageSpellDamage(trainer, expectedSpellId);
    const mostCommonActual = [...details.actualCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'other_spell';
    const estimatedDpsLoss = Math.round((averageExpectedDamage * Math.max(1, details.times.length) * 0.35) / Math.max(1, trainer.encounterDuration));

      return {
        id: `apl-${expectedSpellId}`,
        category: 'apl' as const,
        title: explanation.title,
        summary: `${explanation.summary} This happened ${details.times.length} time${details.times.length === 1 ? '' : 's'}, most often when you cast \`${titleCaseSpellId(mostCommonActual)}\` instead.`,
        fix: explanation.fix,
        focusSpellId: expectedSpellId,
        comparisonSpellId: mostCommonActual === 'other_spell' ? undefined : mostCommonActual,
        estimatedDpsLoss,
        occurrences: details.times.length,
        severity: details.times.length >= 3 ? 'major' : 'medium',
      evidence: details.times.slice(0, 3).map((time) => ({
        time,
        expectedSpellId,
        actualSpellId: mostCommonActual,
        note: `Top recommendation was ${titleCaseSpellId(expectedSpellId)}.`,
      })),
    };
  });
}

function buildUnderuseFinding(
  category: 'cooldown' | 'ability',
  spellId: string,
  playerCount: number,
  trainerCount: number,
  trainer: RawRunTrace,
): AnalysisFinding | null {
  const missingCasts = trainerCount - playerCount;
  if (missingCasts <= 0.35) {
    return null;
  }

  const avgDamage = getAverageSpellDamage(trainer, spellId);
  const estimatedDpsLoss = Math.round((avgDamage * missingCasts) / Math.max(1, trainer.encounterDuration));
  const roundedTrainerCount = Math.round(trainerCount * 10) / 10;
  return {
    id: `${category}-${spellId}`,
    category,
    title: `${titleCaseSpellId(spellId)} was underused`,
    summary: `The trainer benchmark averaged ${roundedTrainerCount} cast${roundedTrainerCount === 1 ? '' : 's'} of \`${titleCaseSpellId(spellId)}\`, while your run fit ${playerCount}.`,
    fix: `Look for earlier windows to cast \`${titleCaseSpellId(spellId)}\` so it does not drift or lose a use over the encounter.`,
    focusSpellId: spellId,
    estimatedDpsLoss,
    occurrences: Math.max(1, Math.round(missingCasts)),
    severity: missingCasts >= 2 ? 'major' : 'medium',
    evidence: [],
  };
}

function buildCooldownAndAbilityFindings(profile: SpecAnalysisProfile, player: RawRunTrace, trainer: RawRunTrace): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const cooldownSet = new Set(profile.importantCooldowns);

  for (const spellId of profile.importantCooldowns) {
    const finding = buildUnderuseFinding(
      'cooldown',
      spellId,
      player.casts.filter((entry) => entry.spellId === spellId).length,
      trainer.damageBySpell[spellId]?.casts ?? 0,
      trainer,
    );
    if (finding) {
      findings.push(finding);
    }
  }

  for (const spellId of profile.importantAbilities) {
    if (cooldownSet.has(spellId)) {
      continue;
    }
    const finding = buildUnderuseFinding(
      'ability',
      spellId,
      player.casts.filter((entry) => entry.spellId === spellId).length,
      trainer.damageBySpell[spellId]?.casts ?? 0,
      trainer,
    );
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

function buildResourceFinding(player: RawRunTrace, trainer: RawRunTrace): AnalysisFinding[] {
  const chiDelta = Math.max(0, lastValue(player.wasteTimelineBySecond.chi) - lastValue(trainer.wasteTimelineBySecond.chi));
  const energyDelta = Math.max(0, lastValue(player.wasteTimelineBySecond.energy) - lastValue(trainer.wasteTimelineBySecond.energy));
  if (chiDelta < 1 && energyDelta < 15) {
    return [];
  }

  const estimatedDpsLoss = Math.round(chiDelta * 180 + energyDelta * 12);
  return [
    {
      id: 'resource-waste',
      category: 'resource',
      title: 'Resource waste cost damage',
      summary: `You wasted ${chiDelta.toFixed(1)} more Chi and ${energyDelta.toFixed(1)} more Energy than the trainer benchmark.`,
      fix: 'Spend Chi before it caps and use filler earlier when Energy is about to overflow.',
      estimatedDpsLoss,
      occurrences: Math.max(1, Math.round(chiDelta + energyDelta / 25)),
      severity: chiDelta >= 2 || energyDelta >= 30 ? 'major' : 'medium',
      evidence: [],
    },
  ];
}

function valueAtTime(values: number[], time: number): number {
  const index = Math.max(0, Math.min(values.length - 1, Math.floor(time)));
  return values[index] ?? 0;
}

function recommendationsAtTime(trace: RawRunTrace, time: number): string[] {
  let current: string[] = [];
  for (const recommendation of trace.recommendations) {
    if (recommendation.time > time) {
      break;
    }
    current = recommendation.spellIds;
  }
  return current;
}

function recommendationAtTime(trace: RawRunTrace, time: number): string | null {
  return recommendationsAtTime(trace, time)[0] ?? null;
}

function lastValue(values: number[]): number {
  return values.length > 0 ? values[values.length - 1] : 0;
}

function resolveTraceTotalDamage(trace: RawRunTrace): number {
  const lastCumulativeDamage = trace.cumulativeDamageBySecond[trace.cumulativeDamageBySecond.length - 1];
  return Number.isFinite(lastCumulativeDamage) ? lastCumulativeDamage : trace.totalDamage;
}

function buffStateAtTime(trace: RawRunTrace, time: number, relevantBuffIds: readonly string[]): AnalysisActiveBuffState[] {
  if (relevantBuffIds.length === 0) {
    return [];
  }

  const relevantBuffSet = new Set(relevantBuffIds);
  return Object.entries(trace.buffStacksTimelineBySecond)
    .filter(([buffId]) => relevantBuffSet.has(buffId))
    .map(([buffId, timeline]) => ({
      buffId,
      stacks: Math.max(0, Math.round(valueAtTime(timeline, time))),
    }))
    .filter((buff) => buff.stacks > 0)
    .sort((left, right) => right.stacks - left.stacks || left.buffId.localeCompare(right.buffId))
    .slice(0, 6);
}

function cooldownStateAtTime(trace: RawRunTrace, time: number, relevantSpellIds: readonly string[]): AnalysisActiveCooldownState[] {
  if (relevantSpellIds.length === 0) {
    return [];
  }

  return [...new Set(relevantSpellIds)]
    .map((spellId) => ({
      spellId,
      remaining: Math.max(0, valueAtTime(trace.cooldownTimelineBySecond[spellId] ?? [], time)),
    }));
}

function normalizeCooldownDisplayStates(
  relevantSpellIds: readonly string[],
  activeBuffs: AnalysisDecisionState['activeBuffs'],
  activeCooldowns: readonly AnalysisActiveCooldownState[],
): AnalysisActiveCooldownState[] {
  const cooldownBySpellId = new Map(activeCooldowns.map((cooldown) => [cooldown.spellId, cooldown]));
  const hasWhirlingDragonPunchWindow = activeBuffs.some((buff) => buff.buffId === 'whirling_dragon_punch' && buff.stacks > 0);

  return [...new Set(relevantSpellIds)]
    .map((spellId) => {
      const existing = cooldownBySpellId.get(spellId);
      const remaining = Math.max(0, existing?.remaining ?? 0);

      if (spellId !== 'whirling_dragon_punch') {
        return {
          spellId,
          remaining,
          isReady: existing?.isReady ?? remaining <= 0,
          ...(existing?.label ? { label: existing.label } : {}),
        };
      }

      if (remaining > 0) {
        return {
          spellId,
          remaining,
          isReady: false,
        };
      }

      return hasWhirlingDragonPunchWindow
        ? {
          spellId,
          remaining: 0,
          isReady: true,
          label: 'Ready',
        }
        : {
          spellId,
          remaining: 0,
          isReady: false,
          label: 'Needs FoF + RSK',
        };
    })
    .sort((left, right) => right.remaining - left.remaining || left.spellId.localeCompare(right.spellId));
}

function previousAbilityAtTime(trace: RawRunTrace, time: number): string | null {
  let previousAbility: string | null = null;
  for (const cast of trace.casts) {
    if (cast.time >= time) {
      break;
    }
    previousAbility = cast.spellId;
  }
  return previousAbility;
}

function buildDecisionState(
  profile: SpecAnalysisProfile,
  trace: RawRunTrace,
  time: number,
): AnalysisDecisionState {
  const snapshotTime = Math.max(0, time - 0.001);
  const topRecommendations = recommendationsAtTime(trace, snapshotTime).slice(0, 3);
  const activeBuffs = buffStateAtTime(trace, snapshotTime, profile.getTrackedBuffIds());
  const activeCooldowns = normalizeCooldownDisplayStates(
    profile.getEssentialCooldownSpellIds(),
    activeBuffs,
    cooldownStateAtTime(trace, snapshotTime, profile.getEssentialCooldownSpellIds()),
  );

  return {
    chi: valueAtTime(trace.resourceTimelineBySecond.chi, snapshotTime),
    energy: valueAtTime(trace.resourceTimelineBySecond.energy, snapshotTime),
    previousAbility: previousAbilityAtTime(trace, snapshotTime),
    topRecommendations,
    activeBuffs,
    activeCooldowns,
  };
}

function filterRecordedDecisionState(
  profile: SpecAnalysisProfile,
  state: AnalysisDecisionState,
): AnalysisDecisionState {
  const relevantBuffIds = new Set(profile.getTrackedBuffIds());
  const relevantCooldownIds = profile.getEssentialCooldownSpellIds();
  const filteredBuffs = state.activeBuffs
    .filter((buff) => relevantBuffIds.has(buff.buffId) && buff.stacks > 0)
    .sort((left, right) => right.stacks - left.stacks || left.buffId.localeCompare(right.buffId))
    .slice(0, 6);

  return {
    chi: state.chi,
    energy: state.energy,
    previousAbility: state.previousAbility,
    topRecommendations: state.topRecommendations.slice(0, 3),
    activeBuffs: filteredBuffs,
    activeCooldowns: normalizeCooldownDisplayStates(
      relevantCooldownIds,
      filteredBuffs,
      state.activeCooldowns.filter((cooldown) => relevantCooldownIds.includes(cooldown.spellId)),
    ),
  };
}

function buildDecisionStateForCast(
  profile: SpecAnalysisProfile,
  trace: RawRunTrace,
  cast: RawRunTrace['casts'][number],
): AnalysisDecisionState {
  if (cast.preCastState) {
    return filterRecordedDecisionState(profile, cast.preCastState);
  }

  return buildDecisionState(profile, trace, cast.time);
}

function findLatestCastBeforeTime(
  trace: RawRunTrace,
  time: number,
  windowSeconds: number,
): RawRunTrace['casts'][number] | null {
  let latest: RawRunTrace['casts'][number] | null = null;
  for (const cast of trace.casts) {
    if (cast.time > time) {
      break;
    }
    if (time - cast.time <= windowSeconds) {
      latest = cast;
    }
  }
  return latest;
}

function hasCastNearTime(trace: RawRunTrace, spellId: string, time: number, windowSeconds: number): boolean {
  return trace.casts.some((cast) => cast.spellId === spellId && Math.abs(cast.time - time) <= windowSeconds);
}

function buildExpiredProcMistakes(
  profile: SpecAnalysisProfile,
  player: RawRunTrace,
): ExactMistakeEntry[] {
  const procRules = [
    {
      buffId: 'dance_of_chi_ji',
      expectedSpellId: 'spinning_crane_kick',
      title: 'A Dance of Chi-Ji proc expired unused',
      summary: 'You let `Dance of Chi-Ji` fall off without converting it into `Spinning Crane Kick`, giving up a high-value proc window.',
      fix: 'Track `Dance of Chi-Ji` more aggressively and spend it before it expires or gets crowded out by other buttons.',
    },
    {
      buffId: 'blackout_reinforcement',
      expectedSpellId: 'blackout_kick',
      title: 'A Blackout Kick! proc expired unused',
      summary: 'You let `Blackout Kick!` expire instead of spending the free `Blackout Kick` for damage and cooldown reduction.',
      fix: 'Spend `Blackout Kick!` before it falls off, especially if another stack could arrive soon.',
    },
  ] as const;

  return procRules.flatMap((rule) => {
    const timeline = player.buffStacksTimelineBySecond[rule.buffId];
    if (!timeline || timeline.length < 2) {
      return [];
    }

    const mistakes: ExactMistakeEntry[] = [];
    for (let index = 1; index < timeline.length; index += 1) {
      const previousStacks = timeline[index - 1] ?? 0;
      const currentStacks = timeline[index] ?? 0;
      if (previousStacks <= 0 || currentStacks > 0) {
        continue;
      }

      const expiryTime = index;
      if (hasCastNearTime(player, rule.expectedSpellId, expiryTime, 1.25)) {
        continue;
      }

      const latestPlayerCast = findLatestCastBeforeTime(player, expiryTime, 1.75);
      mistakes.push({
        id: `expired-proc-${rule.buffId}-${expiryTime}`,
        time: expiryTime,
        playerSpellId: latestPlayerCast?.spellId ?? null,
        expectedSpellId: rule.expectedSpellId,
        title: rule.title,
        summary: rule.summary,
        fix: rule.fix,
        playerState: buildDecisionState(profile, player, expiryTime),
      });
    }

    return mistakes;
  });
}

function buildExactMistakes(
  profile: SpecAnalysisProfile,
  player: RawRunTrace,
  trainer: RawRunTrace,
): ExactMistakeEntry[] {
  const exactMistakeSpellIds = new Set(profile.exactMistakeSpellIds);
  const recommendationMistakes = player.casts
    .filter(
      (cast) => cast.recommendedSpellId
        && cast.recommendedSpellId !== cast.spellId
        && exactMistakeSpellIds.has(cast.recommendedSpellId)
        && isOnGcdSpell(cast.spellId),
    )
    .map<ExactMistakeEntry | null>((cast) => {
      const expectedSpellId = cast.recommendedSpellId;
      if (!expectedSpellId) {
        return null;
      }
      const playerState = buildDecisionStateForCast(profile, player, cast);
      const explanation = profile.explainExactDecision?.(expectedSpellId, cast.spellId, playerState)
        ?? profile.explainRecommendedSpell(expectedSpellId);

      if (!explanation) {
        return null;
      }

      return {
        id: `exact-${cast.time.toFixed(2)}-${cast.spellId}-${expectedSpellId}`,
        time: cast.time,
        playerSpellId: cast.spellId,
        expectedSpellId,
        title: explanation.title,
        summary: explanation.summary,
        fix: explanation.fix,
        playerState,
      };
    })
    .filter((entry): entry is ExactMistakeEntry => entry !== null);

  return [...recommendationMistakes, ...buildExpiredProcMistakes(profile, player)]
    .sort((left, right) => {
      const rightDamage = getAverageSpellDamage(trainer, right.expectedSpellId);
      const leftDamage = getAverageSpellDamage(trainer, left.expectedSpellId);
      return rightDamage - leftDamage || left.time - right.time;
    })
    .slice(0, 8);
}

function isOnGcdSpell(spellId: string): boolean {
  const spell = MONK_WW_SPELLS.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId);
  return spell?.isOnGcd === true;
}

function buildDowntimeFinding(profile: SpecAnalysisProfile, player: RawRunTrace): AnalysisFinding[] {
  const gaps: AnalysisFinding['evidence'] = [];
  let totalLostTime = 0;

  for (let index = 1; index < player.casts.length; index += 1) {
    const previous = player.casts[index - 1];
    const current = player.casts[index];
    const duration = current.time - previous.time;
    const startedAt = previous.time;
    const endedAt = current.time;
    const context = {
      duration,
      startedAt,
      endedAt,
      topRecommendation: recommendationAtTime(player, endedAt - 0.05),
      chiBefore: valueAtTime(player.resourceTimelineBySecond.chi, startedAt),
      energyBefore: valueAtTime(player.resourceTimelineBySecond.energy, startedAt),
      chiWasteDelta: valueAtTime(player.wasteTimelineBySecond.chi, endedAt) - valueAtTime(player.wasteTimelineBySecond.chi, startedAt),
      energyWasteDelta: valueAtTime(player.wasteTimelineBySecond.energy, endedAt) - valueAtTime(player.wasteTimelineBySecond.energy, startedAt),
    };

    if (!profile.shouldFlagDowntime(context)) {
      continue;
    }

    totalLostTime += Math.max(0, duration - 1.5);
    gaps.push({
      time: startedAt,
      expectedSpellId: context.topRecommendation ?? undefined,
      note: `Gap of ${duration.toFixed(1)}s with ${context.topRecommendation ? titleCaseSpellId(context.topRecommendation) : 'no clear recommendation'} available.`,
    });
  }

  if (gaps.length === 0) {
    return [];
  }

  return [
    {
      id: 'downtime',
      category: 'downtime',
      title: 'Some downtime was avoidable',
      summary: `You had ${gaps.length} gap${gaps.length === 1 ? '' : 's'} that looked longer than expected for Windwalker, adding up to about ${totalLostTime.toFixed(1)}s of avoidable inactivity.`,
      fix: 'Use natural Windwalker pauses to plan ahead, but avoid waiting through extra gaps when a safe spender or builder is already available.',
      focusSpellId: gaps[0]?.expectedSpellId,
      estimatedDpsLoss: Math.round(totalLostTime * 1500),
      occurrences: gaps.length,
      severity: totalLostTime >= 4 ? 'major' : 'medium',
      evidence: gaps.slice(0, 3),
    },
  ];
}

export function buildRunAnalysisReport(
  benchmarkSignature: BenchmarkSignature,
  player: RawRunTrace,
  trainer: RawRunTrace,
  profile: SpecAnalysisProfile,
): RunAnalysisReport {
  const scoreDuration = Math.max(
    0.1,
    benchmarkSignature.encounterDuration,
    player.encounterDuration,
    trainer.encounterDuration,
  );
  const playerTotalDamage = resolveTraceTotalDamage(player);
  const trainerTotalDamage = resolveTraceTotalDamage(trainer);
  const playerDps = playerTotalDamage / scoreDuration;
  const trainerDps = trainerTotalDamage / scoreDuration;
  const ratio = trainerDps > 0 ? playerDps / trainerDps : 0;
  const exactMistakes = buildExactMistakes(profile, player, trainer);
  const findings = [
    ...buildCooldownAndAbilityFindings(profile, player, trainer),
    ...buildAplFindings(profile, player, trainer),
    ...buildResourceFinding(player, trainer),
    ...profile.analyzeSetup(player, trainer),
    ...buildDowntimeFinding(profile, player),
  ]
    .sort((left, right) => right.estimatedDpsLoss - left.estimatedDpsLoss || right.occurrences - left.occurrences)
    .slice(0, 6);

  return {
    score: {
      trainerDpsRatio: ratio,
      playerDps,
      trainerDps,
      playerTotalDamage,
      trainerTotalDamage,
      duration: scoreDuration,
      label: buildRatioLabel(ratio),
    },
    benchmarkSignature,
    charts: {
      damageOverTime: buildDamageSeries(player, trainer),
      cumulativeDamage: buildCumulativeSeries(player, trainer),
      spellTimeline: buildSpellTimelineChart(player, trainer),
      cooldownUsage: buildCooldownRows(profile, player, trainer),
      resourceWaste: buildResourceWasteSeries(player, trainer),
    },
    exactMistakes,
    findings,
  };
}

export function formatDecisionStateLabel(state: AnalysisDecisionState): string {
  const recommendations = state.topRecommendations.length > 0
    ? state.topRecommendations.map(titleCaseSpellId).join(', ')
    : 'None';
  const buffs = state.activeBuffs.length > 0
    ? state.activeBuffs.map((buff) => `${titleCaseBuffId(buff.buffId)}${buff.stacks > 1 ? ` x${buff.stacks}` : ''}`).join(', ')
    : 'None';
  const cooldowns = state.activeCooldowns.length > 0
    ? state.activeCooldowns.map((cooldown) => `${titleCaseSpellId(cooldown.spellId)} ${cooldown.label ?? (cooldown.remaining > 0 ? `${cooldown.remaining.toFixed(1)}s` : 'Ready')}`).join(', ')
    : 'None';

  return `Energy ${Math.round(state.energy)} • Chi ${Math.round(state.chi)} • Prev ${state.previousAbility ? titleCaseSpellId(state.previousAbility) : 'None'} • Top ${recommendations} • Buffs ${buffs} • CDs ${cooldowns}`;
}
