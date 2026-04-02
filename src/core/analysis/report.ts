import type {
  AnalysisActiveBuffState,
  AnalysisActiveCooldownState,
  AbilityDamageBreakdownRow,
  AbilityDamageBreakdownSide,
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
  TargetDebuffUptimeRow,
} from './types';
import { getResourceWasteMetricsForSpec } from './specResourceMetrics';
import type { BuffDef, SpellDef } from '@core/data';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';

const DAMAGE_BREAKDOWN_SOURCE_ALIASES: Readonly<Record<string, string>> = {
  blackout_kick_free: 'blackout_kick',
  rushing_wind_kick: 'rising_sun_kick',
};

function titleCaseSpellId(spellId: string): string {
  const sharedSpell = SHARED_PLAYER_SPELLS.get(spellId);
  if (sharedSpell?.displayName) {
    return sharedSpell.displayName;
  }
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

function buildCastCountsBySpell(trace: RawRunTrace): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cast of trace.casts) {
    counts.set(cast.spellId, (counts.get(cast.spellId) ?? 0) + 1);
  }
  return counts;
}

interface AnalysisDataRegistry {
  spellbook: ReadonlyMap<string, SpellDef>;
  buffbook: ReadonlyMap<string, BuffDef>;
}

function resolveDamageBreakdownSpellId(
  sourceSpellId: string,
  spellbook: ReadonlyMap<string, SpellDef>,
): string | null {
  const spellId = DAMAGE_BREAKDOWN_SOURCE_ALIASES[sourceSpellId] ?? sourceSpellId;
  const spell = spellbook.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId);
  return spell ? spellId : null;
}

function createEmptyDamageSide(): AbilityDamageBreakdownSide {
  return {
    totalDamage: 0,
    casts: 0,
    crits: 0,
    sources: [],
  };
}

function buildDamageBreakdownSide(
  trace: RawRunTrace,
  spellbook: ReadonlyMap<string, SpellDef>,
): Map<string, AbilityDamageBreakdownSide> {
  const sideBySpellId = new Map<string, AbilityDamageBreakdownSide>();
  const castCounts = buildCastCountsBySpell(trace);

  for (const [sourceSpellId, stats] of Object.entries(trace.damageBySpell)) {
    if (!Number.isFinite(stats.damage) || stats.damage <= 0) {
      continue;
    }

    const displaySpellId = resolveDamageBreakdownSpellId(sourceSpellId, spellbook);
    if (!displaySpellId) {
      continue;
    }

    const side = sideBySpellId.get(displaySpellId) ?? createEmptyDamageSide();
    const casts = Math.max(castCounts.get(sourceSpellId) ?? 0, stats.casts ?? 0);
    side.totalDamage += stats.damage;
    side.casts += casts;
    side.crits += stats.crits;
    side.sources.push({
      spellId: sourceSpellId,
      casts,
      damage: stats.damage,
      crits: stats.crits,
    });
    sideBySpellId.set(displaySpellId, side);
  }

  for (const side of sideBySpellId.values()) {
    side.sources.sort((left, right) => right.damage - left.damage || left.spellId.localeCompare(right.spellId));
  }

  return sideBySpellId;
}

function buildDamageBreakdown(
  player: RawRunTrace,
  trainer: RawRunTrace,
  spellbook: ReadonlyMap<string, SpellDef>,
): AbilityDamageBreakdownRow[] {
  const playerBreakdown = buildDamageBreakdownSide(player, spellbook);
  const trainerBreakdown = buildDamageBreakdownSide(trainer, spellbook);
  const spellIds = new Set<string>([
    ...playerBreakdown.keys(),
    ...trainerBreakdown.keys(),
  ]);

  return [...spellIds]
    .map((spellId) => ({
      spellId,
      player: playerBreakdown.get(spellId) ?? createEmptyDamageSide(),
      trainer: trainerBreakdown.get(spellId) ?? createEmptyDamageSide(),
    }))
    .filter((row) => row.player.totalDamage > 0 || row.trainer.totalDamage > 0)
    .sort(
      (left, right) => (
        (right.player.totalDamage + right.trainer.totalDamage)
        - (left.player.totalDamage + left.trainer.totalDamage)
      ) || left.spellId.localeCompare(right.spellId),
    );
}

function buildResourceWasteSeries(
  specId: string,
  player: RawRunTrace,
  trainer: RawRunTrace,
): ResourceWasteChartPoint[] {
  const wasteMetrics = getResourceWasteMetricsForSpec(specId);
  if (wasteMetrics.length === 0) {
    return [];
  }
  const length = Math.max(
    ...wasteMetrics.flatMap((metric) => [
      player.wasteTimelineBySecond[metric.key]?.length ?? 0,
      trainer.wasteTimelineBySecond[metric.key]?.length ?? 0,
    ]),
  );
  const points: ResourceWasteChartPoint[] = [];
  for (let index = 0; index < length; index += 1) {
    const point: ResourceWasteChartPoint = { time: index };
    for (const metric of wasteMetrics) {
      point[metric.playerSeriesKey] = player.wasteTimelineBySecond[metric.key]?.[index] ?? 0;
      point[metric.trainerSeriesKey] = trainer.wasteTimelineBySecond[metric.key]?.[index] ?? 0;
    }
    points.push(point);
  }
  return points;
}

function buildTargetDebuffUptimeRows(
  player: RawRunTrace,
  trainer: RawRunTrace,
): TargetDebuffUptimeRow[] {
  const buffIds = new Set([
    ...Object.keys(player.targetDebuffUptimes),
    ...Object.keys(trainer.targetDebuffUptimes),
  ]);

  return [...buffIds]
    .map((buffId) => {
      const playerSeconds = player.targetDebuffUptimes[buffId] ?? 0;
      const trainerSeconds = trainer.targetDebuffUptimes[buffId] ?? 0;
      return {
        buffId,
        playerSeconds,
        trainerSeconds,
        playerRatio: player.encounterDuration > 0 ? playerSeconds / player.encounterDuration : 0,
        trainerRatio: trainer.encounterDuration > 0 ? trainerSeconds / trainer.encounterDuration : 0,
      };
    })
    .filter((row) => row.playerSeconds > 0 || row.trainerSeconds > 0)
    .sort(
      (left, right) => (
        Math.max(right.playerSeconds, right.trainerSeconds) - Math.max(left.playerSeconds, left.trainerSeconds)
      ) || left.buffId.localeCompare(right.buffId),
    );
}

function titleCaseBuffId(buffId: string): string {
  return buffId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function hasTrackedBuff(state: AnalysisDecisionState, buffId: string): boolean {
  return state.activeBuffs.some((buff) => buff.buffId === buffId && buff.stacks > 0);
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

function buildCastCount(trace: RawRunTrace, spellId: string): number {
  return trace.casts.filter((entry) => entry.spellId === spellId).length;
}

function buildAplFindings(
  profile: SpecAnalysisProfile,
  player: RawRunTrace,
  trainer: RawRunTrace,
  registry: AnalysisDataRegistry,
): AnalysisFinding[] {
  const grouped = new Map<string, { actualCounts: Map<string, number>; times: number[] }>();
  for (const cast of player.casts) {
    if (!cast.recommendedSpellId || cast.recommendedSpellId === cast.spellId) {
      continue;
    }

    if (
      !isOnGcdSpell(cast.recommendedSpellId, registry.spellbook)
      && !isOnGcdSpell(cast.spellId, registry.spellbook)
    ) {
      continue;
    }

    const playerState = buildDecisionStateForCast(profile, player, cast, registry);
    if (profile.shouldReportRecommendationMismatch?.(cast.recommendedSpellId, cast.spellId, playerState) === false) {
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

function buildOveruseFinding(
  spellId: string,
  playerCount: number,
  trainerCount: number,
  trainer: RawRunTrace,
): AnalysisFinding | null {
  const excessCasts = playerCount - trainerCount;
  if (excessCasts <= 0.35) {
    return null;
  }

  const avgDamage = Math.max(0, getAverageSpellDamage(trainer, spellId));
  const estimatedDpsLoss = Math.round((avgDamage * excessCasts * 0.18) / Math.max(1, trainer.encounterDuration));
  const roundedTrainerCount = Math.round(trainerCount * 10) / 10;
  return {
    id: `overuse-${spellId}`,
    category: 'ability',
    title: `${titleCaseSpellId(spellId)} was overused`,
    summary: `You cast \`${titleCaseSpellId(spellId)}\` ${playerCount} time${playerCount === 1 ? '' : 's'}, while the trainer benchmark averaged ${roundedTrainerCount} cast${roundedTrainerCount === 1 ? '' : 's'}. Those extra globals likely replaced stronger buttons.`,
    fix: `Trim extra \`${titleCaseSpellId(spellId)}\` casts when higher-priority spenders, cooldowns, or proc windows are available.`,
    focusSpellId: spellId,
    estimatedDpsLoss,
    occurrences: Math.max(1, Math.round(excessCasts)),
    severity: excessCasts >= 2 ? 'major' : 'medium',
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
        buildCastCount(player, spellId),
        trainer.damageBySpell[spellId]?.casts ?? buildCastCount(trainer, spellId),
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
        buildCastCount(player, spellId),
        trainer.damageBySpell[spellId]?.casts ?? 0,
        trainer,
      );
    if (finding) {
      findings.push(finding);
    }
  }

  for (const spellId of profile.overuseSpellIds ?? []) {
    const finding = buildOveruseFinding(
      spellId,
      buildCastCount(player, spellId),
      trainer.damageBySpell[spellId]?.casts ?? buildCastCount(trainer, spellId),
      trainer,
    );
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

function buildProcFindings(
  profile: SpecAnalysisProfile,
  player: RawRunTrace,
  trainer: RawRunTrace,
  registry: AnalysisDataRegistry,
): AnalysisFinding[] {
  return (profile.procAnalysisRules ?? []).flatMap((rule) => {
    const findings: AnalysisFinding[] = [];
    const timeline = player.buffStacksTimelineBySecond[rule.buffId];
    if (timeline && timeline.length > 1) {
      const expiredTimes: number[] = [];
      for (let index = 1; index < timeline.length; index += 1) {
        const previousStacks = timeline[index - 1] ?? 0;
        const currentStacks = timeline[index] ?? 0;
        if (previousStacks <= 0 || currentStacks > 0) {
          continue;
        }

        const expiryTime = index;
        const recommended = recommendationAtTime(player, Math.max(0, expiryTime - 0.05));
        if (recommended !== rule.expectedSpellId) {
          continue;
        }
        if (hasCastNearTime(player, rule.expectedSpellId, expiryTime, 1.25)) {
          continue;
        }
        expiredTimes.push(expiryTime);
      }

      if (expiredTimes.length > 0) {
        const avgDamage = Math.max(0, getAverageSpellDamage(trainer, rule.expectedSpellId));
        findings.push({
          id: `missed-proc-${rule.buffId}`,
          category: 'apl',
          title: rule.expireTitle,
          summary: `${rule.expireSummary} This happened ${expiredTimes.length} time${expiredTimes.length === 1 ? '' : 's'} in spots where the APL still wanted \`${titleCaseSpellId(rule.expectedSpellId)}\`.`,
          fix: rule.expireFix,
          focusSpellId: rule.expectedSpellId,
          estimatedDpsLoss: Math.round((avgDamage * expiredTimes.length * 0.35) / Math.max(1, trainer.encounterDuration)),
          occurrences: expiredTimes.length,
          severity: expiredTimes.length >= 2 ? 'major' : 'medium',
          evidence: expiredTimes.slice(0, 3).map((time) => ({
            time,
            expectedSpellId: rule.expectedSpellId,
            note: `${titleCaseBuffId(rule.buffId)} expired without the recommended spender.`,
          })),
        });
      }
    }

    if (rule.misuseSpellId && rule.misuseTitle && rule.misuseSummary && rule.misuseFix) {
      const misuseSpellId = rule.misuseSpellId;
      const misuseTimes = player.casts
        .filter((cast) => cast.spellId === misuseSpellId)
        .filter((cast) => !hasTrackedBuff(buildDecisionStateForCast(profile, player, cast, registry), rule.buffId))
        .filter((cast) => cast.recommendedSpellId !== misuseSpellId)
        .map((cast) => cast.time);

      if (misuseTimes.length > 0) {
        const avgDamage = Math.max(0, getAverageSpellDamage(trainer, misuseSpellId));
        findings.push({
          id: `misuse-${misuseSpellId}-without-${rule.buffId}`,
          category: 'apl',
          title: rule.misuseTitle,
          summary: `${rule.misuseSummary} This happened ${misuseTimes.length} time${misuseTimes.length === 1 ? '' : 's'} when the APL wanted something else.`,
          fix: rule.misuseFix,
          focusSpellId: misuseSpellId,
          comparisonSpellId: rule.expectedSpellId,
          estimatedDpsLoss: Math.round((avgDamage * misuseTimes.length * 0.22) / Math.max(1, trainer.encounterDuration)),
          occurrences: misuseTimes.length,
          severity: misuseTimes.length >= 3 ? 'major' : 'medium',
          evidence: misuseTimes.slice(0, 3).map((time) => ({
            time,
            actualSpellId: misuseSpellId,
            expectedSpellId: recommendationAtTime(player, Math.max(0, time - 0.05)) ?? undefined,
            note: `${titleCaseSpellId(misuseSpellId)} was used without ${titleCaseBuffId(rule.buffId)}.`,
          })),
        });
      }
    }

    return findings;
  });
}

function buildFinisherFindings(profile: SpecAnalysisProfile, player: RawRunTrace, trainer: RawRunTrace): AnalysisFinding[] {
  return (profile.finisherSpellIds ?? []).flatMap((spellId) => {
    const playerCount = buildCastCount(player, spellId);
    const trainerCount = Math.max(trainer.damageBySpell[spellId]?.casts ?? 0, buildCastCount(trainer, spellId));
    const missingCasts = trainerCount - playerCount;
    if (missingCasts <= 0.35) {
      return [];
    }

    const avgDamage = Math.max(0, getAverageSpellDamage(trainer, spellId));
    return [{
      id: `missed-finisher-${spellId}`,
      category: 'ability' as const,
      title: `Missed ${titleCaseSpellId(spellId)} finish window`,
      summary: `The trainer fit ${Math.round(trainerCount * 10) / 10} cast${trainerCount === 1 ? '' : 's'} of \`${titleCaseSpellId(spellId)}\` before the target died, while your run fit ${playerCount}.`,
      fix: `Watch the target's final health window and press \`${titleCaseSpellId(spellId)}\` before the encounter ends when it becomes legal.`,
      focusSpellId: spellId,
      estimatedDpsLoss: Math.round((avgDamage * missingCasts) / Math.max(1, trainer.encounterDuration)),
      occurrences: Math.max(1, Math.round(missingCasts)),
      severity: missingCasts >= 2 ? 'major' : 'medium',
      evidence: [],
    }];
  });
}

function buildResourceFinding(
  specId: string,
  player: RawRunTrace,
  trainer: RawRunTrace,
): AnalysisFinding[] {
  const wasteMetrics = getResourceWasteMetricsForSpec(specId);
  if (wasteMetrics.length === 0) {
    return [];
  }

  const deltas = wasteMetrics.map((metric) => ({
    metric,
    delta: Math.max(
      0,
      lastValue(player.wasteTimelineBySecond[metric.key] ?? []) - lastValue(trainer.wasteTimelineBySecond[metric.key] ?? []),
    ),
  }));
  if (deltas.every(({ metric, delta }) => delta < metric.minorThreshold)) {
    return [];
  }

  const estimatedDpsLoss = Math.round(deltas.reduce((sum, { metric, delta }) => sum + delta * metric.dpsLossPerUnit, 0));
  const occurrences = Math.max(1, Math.round(deltas.reduce((sum, { metric, delta }) => sum + delta / metric.occurrenceWeight, 0)));
  const severity = deltas.some(({ metric, delta }) => delta >= metric.majorThreshold) ? 'major' : 'medium';
  const summary = deltas
    .filter(({ metric, delta }) => delta >= metric.minorThreshold)
    .map(({ metric, delta }) => `${delta.toFixed(1)} more ${metric.summaryLabel}`)
    .join(' and ');

  return [
    {
      id: 'resource-waste',
      category: 'resource',
      title: 'Resource waste cost damage',
      summary: `You wasted ${summary} than the trainer benchmark.`,
      fix: deltas
        .filter(({ metric, delta }) => delta >= metric.minorThreshold)
        .map(({ metric }) => metric.fixHint)
        .join(' '),
      estimatedDpsLoss,
      occurrences,
      severity,
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

function buffStateAtTime(
  trace: RawRunTrace,
  time: number,
  relevantBuffIds: readonly string[],
  buffbook: ReadonlyMap<string, BuffDef>,
): AnalysisActiveBuffState[] {
  if (relevantBuffIds.length === 0) {
    return [];
  }

  const relevantBuffSet = new Set(relevantBuffIds);
  return Object.entries(trace.buffStacksTimelineBySecond)
    .filter(([buffId]) => relevantBuffSet.has(buffId))
    .map(([buffId, timeline]) => {
      const stacks = Math.max(0, Math.round(valueAtTime(timeline, time)));
      if (stacks <= 0) {
        return { buffId, stacks };
      }

      const buffDef = buffbook.get(buffId);
      const timelineIndex = Math.max(0, Math.min(timeline.length - 1, Math.floor(time)));
      let activeSinceIndex = timelineIndex;
      while (activeSinceIndex > 0 && (timeline[activeSinceIndex - 1] ?? 0) > 0) {
        activeSinceIndex -= 1;
      }
      const elapsed = Math.max(0, time - activeSinceIndex);
      const remaining = buffDef && buffDef.duration > 0
        ? Math.max(0, buffDef.duration - elapsed)
        : undefined;

      return {
        buffId,
        stacks,
        remaining,
      };
    })
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
  registry: AnalysisDataRegistry,
): AnalysisDecisionState {
  const snapshotTime = Math.max(0, time - 0.001);
  const topRecommendations = recommendationsAtTime(trace, snapshotTime).slice(0, 3);
  const activeBuffs = buffStateAtTime(trace, snapshotTime, profile.getTrackedBuffIds(), registry.buffbook);
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
  registry: AnalysisDataRegistry,
): AnalysisDecisionState {
  if (cast.preCastState) {
    return filterRecordedDecisionState(profile, cast.preCastState);
  }

  return buildDecisionState(profile, trace, cast.time, registry);
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
  registry: AnalysisDataRegistry,
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
      buffId: 'combo_breaker',
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
        playerState: buildDecisionState(profile, player, expiryTime, registry),
      });
    }

    return mistakes;
  });
}

function buildExactMistakes(
  profile: SpecAnalysisProfile,
  player: RawRunTrace,
  trainer: RawRunTrace,
  registry: AnalysisDataRegistry,
): ExactMistakeEntry[] {
  const exactMistakeSpellIds = new Set(profile.exactMistakeSpellIds);
  const recommendationMistakes = player.casts
    .filter(
      (cast) => cast.recommendedSpellId
        && cast.recommendedSpellId !== cast.spellId
        && exactMistakeSpellIds.has(cast.recommendedSpellId)
        && isOnGcdSpell(cast.recommendedSpellId, registry.spellbook)
        && isOnGcdSpell(cast.spellId, registry.spellbook),
    )
    .map<ExactMistakeEntry | null>((cast) => {
      const expectedSpellId = cast.recommendedSpellId;
      if (!expectedSpellId) {
        return null;
      }
      const playerState = buildDecisionStateForCast(profile, player, cast, registry);
      if (profile.shouldReportRecommendationMismatch?.(expectedSpellId, cast.spellId, playerState) === false) {
        return null;
      }
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

  return [...recommendationMistakes, ...buildExpiredProcMistakes(profile, player, registry)]
    .sort((left, right) => {
      const rightDamage = getAverageSpellDamage(trainer, right.expectedSpellId);
      const leftDamage = getAverageSpellDamage(trainer, left.expectedSpellId);
      return rightDamage - leftDamage || left.time - right.time;
    })
    .slice(0, 8);
}

function isOnGcdSpell(spellId: string, spellbook: ReadonlyMap<string, SpellDef>): boolean {
  const spell = spellbook.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId);
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
  registry: AnalysisDataRegistry,
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
  const exactMistakes = scoreDuration <= 30 ? [] : buildExactMistakes(profile, player, trainer, registry);
  const findings = [
    ...buildCooldownAndAbilityFindings(profile, player, trainer),
    ...buildAplFindings(profile, player, trainer, registry),
    ...buildProcFindings(profile, player, trainer, registry),
    ...buildFinisherFindings(profile, player, trainer),
    ...buildResourceFinding(benchmarkSignature.specId, player, trainer),
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
      resourceWaste: buildResourceWasteSeries(benchmarkSignature.specId, player, trainer),
    },
    damageBreakdown: buildDamageBreakdown(player, trainer, registry.spellbook),
    targetDebuffUptimes: buildTargetDebuffUptimeRows(player, trainer),
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
