import type { ActionSequenceEntry, SpellEventEntry } from '../engine/headless';

export interface OpeningSpellReportRow {
  name: string;
  trainerCasts: number;
  simcCasts: number;
  trainerExecuteTime: number;
  simcExecuteTime: number;
  trainerChannelTime: number;
  simcChannelTime: number;
  trainerDamage: number;
  simcDamage: number;
}

export interface OpeningTooltipResolverConfig {
  openingTooltipSpellAliases: Record<string, string>;
  simcToTrainerAbilityNames: Record<string, string>;
  parentToTrainerChildren: Record<string, string[]>;
}

export interface OpeningTooltipMetrics {
  casts: number;
  totalDamage: number;
  totalExecuteTime: number;
  totalChannelTime: number;
  perCastDamage: number | null;
  damageSource: 'trainer-events' | 'simc-aggregate' | 'aggregate';
}

export interface NormalizedOpeningSequenceEntry {
  time: number;
  spellId: string;
}

export interface NormalizedOpeningWaitEntry {
  time: number;
  wait: number;
}

export type NormalizedOpeningTimelineEntry =
  | NormalizedOpeningSequenceEntry
  | NormalizedOpeningWaitEntry;

interface OpeningTooltipResolutionParams {
  spellId: string;
  lane: 'trainer' | 'simc';
  laneEventIndex: number;
  laneEvents: { spellId: string; time: number }[];
  trainerActionSequence?: ActionSequenceEntry[];
  trainerSpellEvents?: SpellEventEntry[];
  spellReportBySpellId: Map<string, OpeningSpellReportRow>;
  fallbackDuration: number;
  config: OpeningTooltipResolverConfig;
}

/** Returns a short hover description for a report section title. */
export function resolveSectionDescription(title: string): string | null {
  const normalized = title.trim().toLowerCase();

  if (normalized === 'spell report') {
    return 'Combined per-spell comparison of casts, execute/channel time, damage, damage per cast, and crit rate.';
  }
  if (normalized === 'timeseries') {
    return 'Per-second fight timelines for damage and key resources, shown side-by-side for trainer and SimC.';
  }
  if (normalized === 'action sequence openings') {
    return 'Opening cast order comparison across captured trainer seeds versus the SimC opener.';
  }
  if (normalized === 'cast counts') {
    return 'How often each spell was executed, with crit counts and crit-rate context.';
  }
  if (normalized === 'damage by ability') {
    return 'Per-ability damage breakdown with total, normalized, non-crit, and crit slices for trainer versus SimC.';
  }
  if (normalized === 'timeline damage (simc / trainer)') {
    return 'Burst-shape summary over time, including peak windows, spikes, and opener-versus-closer damage.';
  }
  if (normalized === 'resources (timeline/end)') {
    return 'Resource pacing comparison covering energy and chi timelines, end-state values, waste, and overflow.';
  }
  if (normalized === 'tempo / waiting') {
    return 'Foreground action pace comparison, including actions per second, waiting time, and active time.';
  }
  if (normalized === 'buff uptimes (simc / trainer)') {
    return 'Buff uptime comparison showing how long key effects remained active in trainer versus SimC.';
  }
  if (normalized === 'proc counts') {
    return 'Proc frequency comparison for tracked effects, including counts and uptime-adjacent context.';
  }
  if (normalized === 'procs (simc / trainer)') {
    return 'Proc summary from SimC and trainer, used to spot frequency and interval mismatches.';
  }
  if (normalized === 'resource gain by ability') {
    return 'Per-ability resource generation and spend comparison, useful for tracking chi and energy drift.';
  }
  if (normalized === 'resource gains (simc gains)') {
    return 'SimC-reported resource gain breakdown, normalized into comparable per-ability rows.';
  }
  if (normalized === 'miss / dodge / parry counts') {
    return 'Attack-table outcome comparison for misses, dodges, and parries by ability.';
  }
  if (normalized === 'result quality') {
    return 'Outcome-quality comparison for hit, crit, miss, dodge, and parry distributions plus average hit sizes.';
  }
  if (normalized === 'pets (simc)') {
    return 'Pet-only contribution rows from SimC, shown separately from the trainer player actor.';
  }
  if (normalized.startsWith('action sequence (opening #')) {
    return 'Cast-by-cast opening comparison. Hover a spell on the timeline to inspect that cast rather than the spell\'s overall totals.';
  }

  if (normalized === 'attack power timeline' || normalized === 'attack power timeline (base ap)') {
    return 'Per-second base Attack Power comparison (no weapon AP term). Trainer reflects live base AP including procs; SimC is reconstructed from buffed_stats baseline plus known buff deltas.';
  }
  if (normalized === 'weapon attack power timeline') {
    return 'Per-second WEAPON_MAINHAND Attack Power comparison (base AP plus weapon AP term). SimC line is reconstructed using profile weapon AP with active AP multipliers.';
  }
  if (normalized === 'crit % timeline') {
    return 'Per-second Crit % comparison. Trainer reflects live stat; SimC is reconstructed.';
  }
  if (normalized === 'haste % timeline') {
    return 'Per-second Haste % comparison. Trainer reflects live stat; SimC is reconstructed.';
  }
  if (normalized === 'mastery % timeline') {
    return 'Per-second Mastery % comparison. Trainer reflects live stat; SimC is reconstructed.';
  }
  if (normalized === 'versatility % timeline') {
    return 'Per-second Versatility % comparison. Trainer reflects live stat; SimC is reconstructed.';
  }
  if (normalized.includes('timeline')) {
    return 'Time-ordered comparison section derived from the trainer run and SimC report.';
  }
  if (normalized.includes('buff')) {
    return 'Buff-state comparison between the trainer run and SimC output.';
  }
  if (normalized.includes('resource')) {
    return 'Resource-focused comparison between the trainer run and SimC output.';
  }

  return null;
}

/** Resolves opening tooltip metrics for a lane, using exact trainer spell events when available. */
export function resolveOpeningTooltipMetrics({
  spellId,
  lane,
  laneEventIndex,
  laneEvents,
  trainerActionSequence,
  trainerSpellEvents,
  spellReportBySpellId,
  fallbackDuration,
  config,
}: OpeningTooltipResolutionParams): OpeningTooltipMetrics | null {
  const candidateSpellIds = buildCandidateSpellIds(spellId, config);
  const aggregateRow = candidateSpellIds
    .map((candidate) => spellReportBySpellId.get(candidate))
    .find((row): row is OpeningSpellReportRow => row !== undefined);

  if (!aggregateRow) {
    return null;
  }

  const aggregateMetrics: OpeningTooltipMetrics = lane === 'trainer'
    ? {
        casts: aggregateRow.trainerCasts,
        totalDamage: aggregateRow.trainerDamage,
        totalExecuteTime: aggregateRow.trainerExecuteTime,
        totalChannelTime: aggregateRow.trainerChannelTime,
        perCastDamage: aggregateRow.trainerCasts > 0 ? aggregateRow.trainerDamage / aggregateRow.trainerCasts : null,
        damageSource: 'aggregate',
      }
    : {
        casts: aggregateRow.simcCasts,
        totalDamage: aggregateRow.simcDamage,
        totalExecuteTime: aggregateRow.simcExecuteTime,
        totalChannelTime: aggregateRow.simcChannelTime,
        perCastDamage: aggregateRow.simcCasts > 0 ? aggregateRow.simcDamage / aggregateRow.simcCasts : null,
        damageSource: 'simc-aggregate',
      };

  if (lane !== 'trainer' || !trainerActionSequence || !trainerSpellEvents) {
    return aggregateMetrics;
  }

  const action = trainerActionSequence[laneEventIndex];
  const event = laneEvents[laneEventIndex];
  if (action?.spellId !== event?.spellId || Math.abs(action.time - event.time) > 0.0005) {
    return aggregateMetrics;
  }

  const derivedDuration = aggregateMetrics.casts > 0
    ? Math.max(
        aggregateMetrics.totalChannelTime / aggregateMetrics.casts,
        aggregateMetrics.totalExecuteTime / aggregateMetrics.casts,
      )
    : 0;
  const nextActionTime = trainerActionSequence[laneEventIndex + 1]?.time ?? laneEvents[laneEventIndex + 1]?.time ?? null;
  const windowEnd = nextActionTime !== null && nextActionTime > action.time
    ? nextActionTime
    : action.time + Math.max(fallbackDuration, derivedDuration, 0.05);
  const matchedSpellIds = expandTrainerSpellIds(candidateSpellIds, config.parentToTrainerChildren);
  const perCastDamage = trainerSpellEvents.reduce((sum, spellEvent) => {
    if (spellEvent.outcome !== 'landed') return sum;
    if (!matchedSpellIds.has(spellEvent.spellId)) return sum;
    if (spellEvent.time < action.time || spellEvent.time >= windowEnd) return sum;
    return sum + spellEvent.damage;
  }, 0);

  return {
    ...aggregateMetrics,
    perCastDamage,
    damageSource: 'trainer-events',
  };
}

export function normalizeOpeningSequenceEntries(
  rawEntries: unknown,
  options: {
    aliasMap?: Record<string, string>;
    excludedSpellIds?: Iterable<string>;
  } = {},
): NormalizedOpeningSequenceEntry[] {
  if (!Array.isArray(rawEntries)) {
    return [];
  }

  const aliasMap = options.aliasMap ?? {};
  const excludedSpellIds = new Set(options.excludedSpellIds ?? []);

  return rawEntries
    .filter((entry) => entry && typeof entry === 'object' && (entry as { queue_failed?: boolean }).queue_failed !== true)
    .map((entry) => {
      const rawName = typeof (entry as { name?: unknown }).name === 'string'
        ? (entry as { name: string }).name.trim()
        : '';
      if (rawName.length === 0) {
        return null;
      }

      const spellId = aliasMap[rawName] ?? rawName;
      if (excludedSpellIds.has(spellId)) {
        return null;
      }

      return {
        time: typeof (entry as { time?: unknown }).time === 'number' && Number.isFinite((entry as { time: number }).time)
          ? (entry as { time: number }).time
          : 0,
        spellId,
      };
    })
    .filter((entry): entry is NormalizedOpeningSequenceEntry => entry !== null);
}

export function normalizeOpeningTimelineEntries(
  rawEntries: unknown,
  options: {
    aliasMap?: Record<string, string>;
    excludedSpellIds?: Iterable<string>;
  } = {},
): NormalizedOpeningTimelineEntry[] {
  if (!Array.isArray(rawEntries)) {
    return [];
  }

  const aliasMap = options.aliasMap ?? {};
  const excludedSpellIds = new Set(options.excludedSpellIds ?? []);

  return rawEntries
    .filter((entry) => entry && typeof entry === 'object' && (entry as { queue_failed?: boolean }).queue_failed !== true)
    .map((entry) => {
      const time = typeof (entry as { time?: unknown }).time === 'number' && Number.isFinite((entry as { time: number }).time)
        ? (entry as { time: number }).time
        : 0;
      const wait = typeof (entry as { wait?: unknown }).wait === 'number' && Number.isFinite((entry as { wait: number }).wait)
        ? (entry as { wait: number }).wait
        : null;

      if (wait !== null && wait > 0) {
        return { time, wait } satisfies NormalizedOpeningWaitEntry;
      }

      const rawName = typeof (entry as { name?: unknown }).name === 'string'
        ? (entry as { name: string }).name.trim()
        : '';
      if (rawName.length === 0) {
        return null;
      }

      const spellId = aliasMap[rawName] ?? rawName;
      if (excludedSpellIds.has(spellId)) {
        return null;
      }

      return { time, spellId } satisfies NormalizedOpeningSequenceEntry;
    })
    .filter((entry): entry is NormalizedOpeningTimelineEntry => entry !== null);
}

function buildCandidateSpellIds(
  spellId: string,
  config: OpeningTooltipResolverConfig,
): string[] {
  const candidates = [
    spellId,
    config.openingTooltipSpellAliases[spellId],
    config.simcToTrainerAbilityNames[spellId],
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
  return [...new Set(candidates)];
}

function expandTrainerSpellIds(
  candidateSpellIds: string[],
  parentToTrainerChildren: Record<string, string[]>,
): Set<string> {
  const expanded = new Set<string>();
  for (const candidate of candidateSpellIds) {
    expanded.add(candidate);
    const children = parentToTrainerChildren[candidate] ?? [];
    for (const child of children) {
      expanded.add(child);
    }
  }
  return expanded;
}
