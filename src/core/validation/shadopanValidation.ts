import type { CharacterProfile } from '../data/profileParser';
import { createGameState } from '../engine/gameState';

export interface ValidationStats {
  attackPower: number;
  critPercent: number;
  hastePercent: number;
  versatilityPercent: number;
  masteryPercent: number;
  maxHealth: number;
}

export interface SimcAbilitySummary {
  casts: number;
  damage: number;
  /** Sum of landed non-crit result damage (direct + tick, including children). */
  hitDamage: number;
  /** Sum of landed crit result damage (direct + tick, including children). */
  critDamage: number;
  hits: number;
  crits: number;
  misses: number;
  dodges: number;
  parries: number;
  /** Total execute time in seconds (SimC total_execute_time.mean). */
  executeTime: number;
  /** Mean interval between executes in seconds (SimC total_intervals.mean). */
  interval: number;
  /** Per-resource gain metadata from SimC stats[*].resource_gain. */
  resourceGain: Record<string, { actual: number; overflow: number; count: number }>;
  /** Total seconds this ability spent channeling (SimC total_tick_time.mean). */
  channelTime: number;
}

const L90_RATING_TO_PCT = {
  crit: 0.030670,
  haste: 0.022727,
  mastery: 0.062986,
  versatility: 0.018525,
} as const;

const LEVEL_90_HEALTH_PER_STAMINA = 20;

interface SimcBuffedStats {
  attack_power?: number;
  crit_pct?: number;
  crit_rating?: number;
  haste_pct?: number;
  haste_rating?: number;
  mastery_pct?: number;
  mastery_rating?: number;
  versatility_pct?: number;
  versatility_rating?: number;
}

interface SimcBuffedAttributes {
  stamina?: number;
}

interface SimcCollectedData {
  buffed_stats?: {
    stats?: SimcBuffedStats;
    attribute?: SimcBuffedAttributes;
  };
}

interface SimcPlayer {
  collected_data?: SimcCollectedData;
}

interface SimcJson {
  sim?: {
    players?: SimcPlayer[];
  };
}

type SimcMeanValue = number | { mean?: number };

interface SimcResultBucket {
  count?: SimcMeanValue;
  avg_actual_amount?: SimcMeanValue;
  actual_amount?: SimcMeanValue;
}

interface SimcResourceGainEntry {
  actual?: number;
  overflow?: number;
  count?: number;
}

interface SimcStatNode {
  name: string;
  actual_amount?: { mean?: number };
  children?: SimcStatNode[];
  direct_results?: Record<string, SimcResultBucket | undefined>;
  tick_results?: Record<string, SimcResultBucket | undefined>;
  total_execute_time?: { mean?: number };
  total_intervals?: { mean?: number };
  total_tick_time?: { mean?: number };
  num_executes?: { mean?: number };
  resource_gain?: Record<string, SimcResourceGainEntry | undefined>;
}

function getSimcBuffedStats(simcJson: SimcJson): SimcBuffedStats | null {
  return simcJson?.sim?.players?.[0]?.collected_data?.buffed_stats?.stats ?? null;
}

function getSimcBuffedAttributes(simcJson: SimcJson): SimcBuffedAttributes | null {
  return simcJson?.sim?.players?.[0]?.collected_data?.buffed_stats?.attribute ?? null;
}

function percentFromPctOrRating(
  pctValue: number | undefined,
  ratingValue: number | undefined,
  ratingFactor: number,
  profilePercent: number,
): number {
  if (pctValue !== undefined) {
    return pctValue > 1 ? pctValue : pctValue * 100;
  }

  if (ratingValue !== undefined) {
    return ratingValue * ratingFactor;
  }

  return profilePercent;
}

export function buildShadoPanValidationStats(
  parsedProfile: CharacterProfile,
  simcJson: SimcJson,
): ValidationStats {
  const buffedStats = getSimcBuffedStats(simcJson);
  const buffedAttributes = getSimcBuffedAttributes(simcJson);
  const s = parsedProfile.stats;

  // SimC exports buffed_stats.attack_power as already-buffed player AP.
  // Keep that value as-is for trainer validation so weapon-based damage paths
  // continue to assemble their own weapon roll and AP term separately.
  const attackPower = buffedStats?.attack_power ?? s.attackPower;

  // Prefer SimC buffed stamina when available; it already reflects raid-buff
  // baselines for the exported profile and keeps Touch of Death aligned.
  const maxHealth = buffedAttributes?.stamina !== undefined
    ? buffedAttributes.stamina * LEVEL_90_HEALTH_PER_STAMINA
    : (s.maxHealth ?? 0);

  return {
    attackPower,
    critPercent: percentFromPctOrRating(
      buffedStats?.crit_pct,
      buffedStats?.crit_rating,
      L90_RATING_TO_PCT.crit,
      s.critPercent,
    ),
    hastePercent: percentFromPctOrRating(
      buffedStats?.haste_pct,
      buffedStats?.haste_rating,
      L90_RATING_TO_PCT.haste,
      s.hastePercent,
    ),
    versatilityPercent: percentFromPctOrRating(
      buffedStats?.versatility_pct,
      buffedStats?.versatility_rating,
      L90_RATING_TO_PCT.versatility,
      s.versatilityPercent,
    ),
    masteryPercent: percentFromPctOrRating(
      buffedStats?.mastery_pct,
      buffedStats?.mastery_rating,
      L90_RATING_TO_PCT.mastery,
      s.masteryPercent,
    ),
    maxHealth,
  };
}

export function collectEffectiveValidationStats(profile: CharacterProfile): ValidationStats {
  const state = createGameState(profile, { duration: 1 });

  return {
    attackPower: state.getAttackPower(),
    critPercent: state.getCritPercent(),
    hastePercent: state.getHastePercent(),
    versatilityPercent: state.getVersatilityPercent(),
    masteryPercent: state.getMasteryPercent(),
    maxHealth: state.getMaxHealth(),
  };
}

export function resolveSimcDamage(stat: SimcStatNode): number {
  let damage = stat.actual_amount?.mean ?? 0;

  if (Array.isArray(stat.children)) {
    damage += stat.children.reduce(
      (sum: number, child) => sum + resolveSimcDamage(child),
      0,
    );
  }

  return damage;
}

export function collectSimcAbilitySummaries(stats: SimcStatNode[] | undefined): Record<string, SimcAbilitySummary> {
  const abilities: Record<string, SimcAbilitySummary> = {};

  const mean = (value: SimcMeanValue | undefined | null): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const candidate = (value as { mean?: unknown }).mean;
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
    }
    return 0;
  };

  const resultCount = (stat: SimcStatNode, key: string): number => {
    const direct = mean(stat?.direct_results?.[key]?.count);
    const tick = mean(stat?.tick_results?.[key]?.count);
    const value = (typeof direct === 'number' ? direct : 0) + (typeof tick === 'number' ? tick : 0);
    return typeof value === 'number' ? value : 0;
  };

  const resultDamage = (stat: SimcStatNode, key: string): number => {
    // Use actual_amount (per-event average) instead of avg_actual_amount
    // (per-iteration average).  avg_actual_amount is diluted by iterations
    // that had zero events of this result type, producing phantom gaps for
    // rare outcomes like crits on infrequent abilities.
    const directCount = mean(stat?.direct_results?.[key]?.count);
    const directAvg = mean(stat?.direct_results?.[key]?.actual_amount);
    const tickCount = mean(stat?.tick_results?.[key]?.count);
    const tickAvg = mean(stat?.tick_results?.[key]?.actual_amount);
    return (directCount * directAvg) + (tickCount * tickAvg);
  };

  const resolveResultCount = (stat: SimcStatNode, key: string): number => {
    let count = resultCount(stat, key);
    if (Array.isArray(stat?.children)) {
      count += stat.children.reduce(
        (sum: number, child) => sum + resolveResultCount(child, key),
        0,
      );
    }
    return count;
  };

  const resolveResultDamage = (stat: SimcStatNode, key: string): number => {
    let damage = resultDamage(stat, key);
    if (Array.isArray(stat?.children)) {
      damage += stat.children.reduce(
        (sum: number, child) => sum + resolveResultDamage(child, key),
        0,
      );
    }
    return damage;
  };

  const normalizeResourceGain = (
    resourceGain: SimcStatNode['resource_gain'],
  ): SimcAbilitySummary['resourceGain'] => {
    const out: Record<string, { actual: number; overflow: number; count: number }> = {};
    if (!resourceGain || typeof resourceGain !== 'object') {
      return out;
    }

    for (const [resourceId, rawValue] of Object.entries(resourceGain)) {
      if (!rawValue || typeof rawValue !== 'object') continue;
      const actual = typeof rawValue.actual === 'number' ? rawValue.actual : 0;
      const overflow = typeof rawValue.overflow === 'number' ? rawValue.overflow : 0;
      const count = typeof rawValue.count === 'number' ? rawValue.count : 0;
      if (actual === 0 && overflow === 0 && count === 0) continue;
      out[resourceId] = { actual, overflow, count };
    }
    return out;
  };

  function visit(stat: SimcStatNode): void {
    const executeTime = typeof stat?.total_execute_time?.mean === 'number'
      ? stat.total_execute_time.mean
      : 0;
    const interval = typeof stat?.total_intervals?.mean === 'number'
      ? stat.total_intervals.mean
      : 0;
    const channelTime = typeof stat?.total_tick_time?.mean === 'number'
      ? stat.total_tick_time.mean
      : 0;
    abilities[stat.name] = {
      casts: mean(stat.num_executes),
      damage: resolveSimcDamage(stat),
      hitDamage: resolveResultDamage(stat, 'hit'),
      critDamage: resolveResultDamage(stat, 'crit'),
      hits: resolveResultCount(stat, 'hit'),
      crits: resolveResultCount(stat, 'crit'),
      misses: resolveResultCount(stat, 'miss'),
      dodges: resolveResultCount(stat, 'dodge'),
      parries: resolveResultCount(stat, 'parry'),
      executeTime,
      interval,
      resourceGain: normalizeResourceGain(stat?.resource_gain),
      channelTime,
    };

    if (Array.isArray(stat.children)) {
      for (const child of stat.children) {
        visit(child);
      }
    }
  }

  for (const stat of stats ?? []) {
    visit(stat);
  }

  return abilities;
}
