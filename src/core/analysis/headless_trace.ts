import type { SimResult } from '@core/engine/headless';
import type { BenchmarkSignature, RawRunTrace } from './types';
import { buildCumulativeDamageTimeline } from './live_trace_collector';

function mapDamageBySpell(source: SimResult['damageBySpell']): RawRunTrace['damageBySpell'] {
  return Object.fromEntries(
    Object.entries(source).map(([spellId, stats]) => [
      spellId,
      {
        casts: stats.casts,
        damage: stats.damage,
        crits: stats.crits,
      },
    ]),
  );
}

export function buildTraceFromSimResult(
  result: SimResult,
  specId: string,
  benchmarkSignature: BenchmarkSignature,
): RawRunTrace {
  return {
    source: 'trainer',
    specId,
    encounterDuration: result.encounterDuration,
    totalDamage: result.totalDamage,
    dps: result.dps,
    casts: result.actionSequence.map((entry) => ({
      time: entry.time,
      spellId: entry.spellId,
      recommendedSpellId: null,
    })),
    recommendations: [],
    damageBySpell: mapDamageBySpell(result.damageBySpell),
    damageTimelineBySecond: [...result.damageTimelineBySecond],
    cumulativeDamageBySecond: buildCumulativeDamageTimeline(result.damageTimelineBySecond),
    buffStacksTimelineBySecond: Object.fromEntries(
      Object.entries(result.buffStacksTimelineBySecond).map(([buffId, timeline]) => [buffId, [...timeline]]),
    ),
    buffRemainingTimelineBySecond: Object.fromEntries(
      Object.entries(result.buffStacksTimelineBySecond).map(([buffId, timeline]) => [buffId, timeline.map(() => 0)]),
    ),
    cooldownTimelineBySecond: {},
    channels: [],
    resourceCaps: {
      chiMax: result.finalState.chiMax,
      energyMax: result.finalState.energyMax,
    },
    resourceTimelineBySecond: {
      energy: [...result.resourceTimelineBySecond.energy],
      chi: [...result.resourceTimelineBySecond.chi],
    },
    wasteTimelineBySecond: {
      energy: [...result.wasteTimelineBySecond.energy],
      chi: [...result.wasteTimelineBySecond.chi],
    },
    waitingTime: result.waitingTime,
    benchmarkSignature,
  };
}

function averageSeries(seriesList: number[][]): number[] {
  const length = Math.max(...seriesList.map((series) => series.length), 0);
  const averaged: number[] = [];

  for (let index = 0; index < length; index += 1) {
    let total = 0;
    let count = 0;
    for (const series of seriesList) {
      const value = series[index];
      if (value === undefined) {
        continue;
      }
      total += value;
      count += 1;
    }
    averaged.push(count > 0 ? total / count : 0);
  }

  return averaged;
}

function averageDamageBySpell(traces: RawRunTrace[]): RawRunTrace['damageBySpell'] {
  const spellIds = new Set(traces.flatMap((trace) => Object.keys(trace.damageBySpell)));
  const averaged: RawRunTrace['damageBySpell'] = {};

  for (const spellId of spellIds) {
    let casts = 0;
    let damage = 0;
    let crits = 0;
    let count = 0;

    for (const trace of traces) {
      const stats = trace.damageBySpell[spellId];
      if (!stats) {
        continue;
      }
      casts += stats.casts;
      damage += stats.damage;
      crits += stats.crits;
      count += 1;
    }

    averaged[spellId] = {
      casts: count > 0 ? casts / count : 0,
      damage: count > 0 ? damage / count : 0,
      crits: count > 0 ? crits / count : 0,
    };
  }

  return averaged;
}

function averageBuffTimelines(traces: RawRunTrace[]): RawRunTrace['buffStacksTimelineBySecond'] {
  const buffIds = new Set(traces.flatMap((trace) => Object.keys(trace.buffStacksTimelineBySecond)));
  return Object.fromEntries(
    [...buffIds].map((buffId) => [
      buffId,
      averageSeries(
        traces
          .map((trace) => trace.buffStacksTimelineBySecond[buffId])
          .filter((series): series is number[] => series !== undefined),
      ),
    ]),
  );
}

function averageRemainingBuffTimelines(traces: RawRunTrace[]): RawRunTrace['buffRemainingTimelineBySecond'] {
  const buffIds = new Set(traces.flatMap((trace) => Object.keys(trace.buffRemainingTimelineBySecond)));
  return Object.fromEntries(
    [...buffIds].map((buffId) => [
      buffId,
      averageSeries(
        traces
          .map((trace) => trace.buffRemainingTimelineBySecond[buffId])
          .filter((series): series is number[] => series !== undefined),
      ),
    ]),
  );
}

function buildAverageCasts(traces: RawRunTrace[]): RawRunTrace['casts'] {
  const spellIds = new Set(traces.flatMap((trace) => trace.casts.map((cast) => cast.spellId)));
  const averagedCasts: RawRunTrace['casts'] = [];

  for (const spellId of spellIds) {
    const castsByTrace = traces.map((trace) => trace.casts.filter((cast) => cast.spellId === spellId));
    const averageCount = castsByTrace.reduce((sum, casts) => sum + casts.length, 0) / Math.max(1, castsByTrace.length);
    const targetCount = Math.max(0, Math.round(averageCount));

    for (let index = 0; index < targetCount; index += 1) {
      let timeTotal = 0;
      let timeCount = 0;
      for (const casts of castsByTrace) {
        const cast = casts[index];
        if (!cast) {
          continue;
        }
        timeTotal += cast.time;
        timeCount += 1;
      }

      if (timeCount === 0) {
        continue;
      }

      averagedCasts.push({
        time: timeTotal / timeCount,
        spellId,
        recommendedSpellId: null,
      });
    }
  }

  return averagedCasts.sort((left, right) => left.time - right.time || left.spellId.localeCompare(right.spellId));
}

export function buildAverageTrainerTrace(
  traces: RawRunTrace[],
  benchmarkSignature: BenchmarkSignature,
): RawRunTrace {
  if (traces.length === 0) {
    throw new Error('Cannot average zero trainer traces.');
  }

  return {
    source: 'trainer',
    specId: traces[0].specId,
    encounterDuration: traces[0].encounterDuration,
    totalDamage: traces.reduce((sum, trace) => sum + trace.totalDamage, 0) / traces.length,
    dps: traces.reduce((sum, trace) => sum + trace.dps, 0) / traces.length,
    casts: buildAverageCasts(traces),
    recommendations: [],
    damageBySpell: averageDamageBySpell(traces),
    damageTimelineBySecond: averageSeries(traces.map((trace) => trace.damageTimelineBySecond)),
    cumulativeDamageBySecond: averageSeries(traces.map((trace) => trace.cumulativeDamageBySecond)),
    buffStacksTimelineBySecond: averageBuffTimelines(traces),
    buffRemainingTimelineBySecond: averageRemainingBuffTimelines(traces),
    cooldownTimelineBySecond: {},
    channels: [],
    resourceCaps: {
      chiMax: traces.reduce((sum, trace) => sum + trace.resourceCaps.chiMax, 0) / traces.length,
      energyMax: traces.reduce((sum, trace) => sum + trace.resourceCaps.energyMax, 0) / traces.length,
    },
    resourceTimelineBySecond: {
      energy: averageSeries(traces.map((trace) => trace.resourceTimelineBySecond.energy)),
      chi: averageSeries(traces.map((trace) => trace.resourceTimelineBySecond.chi)),
    },
    wasteTimelineBySecond: {
      energy: averageSeries(traces.map((trace) => trace.wasteTimelineBySecond.energy)),
      chi: averageSeries(traces.map((trace) => trace.wasteTimelineBySecond.chi)),
    },
    waitingTime: traces.reduce((sum, trace) => sum + trace.waitingTime, 0) / traces.length,
    benchmarkSignature,
  };
}

/**
 * Selects the single trainer trace that best represents the averaged benchmark output.
 */
export function selectRepresentativeTrainerTrace(traces: RawRunTrace[]): RawRunTrace {
  if (traces.length === 0) {
    throw new Error('Cannot select a representative trainer trace from zero traces.');
  }

  const [firstTrace, ...remainingTraces] = traces;
  const averageDps = traces.reduce((sum, trace) => sum + trace.dps, 0) / traces.length;
  const averageTotalDamage = traces.reduce((sum, trace) => sum + trace.totalDamage, 0) / traces.length;

  return remainingTraces.reduce((best, candidate) => {
    const bestScore = Math.abs(best.dps - averageDps) + (Math.abs(best.totalDamage - averageTotalDamage) / Math.max(1, averageTotalDamage));
    const candidateScore = Math.abs(candidate.dps - averageDps)
      + (Math.abs(candidate.totalDamage - averageTotalDamage) / Math.max(1, averageTotalDamage));
    return candidateScore < bestScore ? candidate : best;
  }, firstTrace);
}

/**
 * Builds the trainer benchmark trace while preserving casts from a single real trainer run.
 */
export function buildTrainerBenchmarkTrace(
  traces: RawRunTrace[],
  benchmarkSignature: BenchmarkSignature,
): RawRunTrace {
  const averagedTrace = buildAverageTrainerTrace(traces, benchmarkSignature);
  const representativeTrace = selectRepresentativeTrainerTrace(traces);

  return {
    ...averagedTrace,
    casts: representativeTrace.casts.map((cast) => ({ ...cast })),
  };
}
