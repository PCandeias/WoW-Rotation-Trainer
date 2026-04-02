import type { GameStateSnapshot } from '@core/engine/gameState';
import { EventType, type SimEvent } from '@core/engine/eventQueue';
import type {
  AnalysisDecisionState,
  AnalysisSpellStats,
  RawRunTrace,
  RecommendationRecord,
} from './types';

function fillTimelineGaps(timeline: number[]): number[] {
  if (timeline.length === 0) {
    return timeline;
  }

  let firstKnown = -1;
  for (let i = 0; i < timeline.length; i += 1) {
    if (!Number.isNaN(timeline[i])) {
      firstKnown = i;
      break;
    }
  }

  if (firstKnown === -1) {
    timeline.fill(0);
    return timeline;
  }

  for (let i = 0; i < firstKnown; i += 1) {
    timeline[i] = timeline[firstKnown];
  }

  let last = timeline[firstKnown];
  for (let i = firstKnown + 1; i < timeline.length; i += 1) {
    if (Number.isNaN(timeline[i])) {
      timeline[i] = last;
      continue;
    }
    last = timeline[i];
  }

  return timeline;
}

function buildCumulativeTimeline(values: number[]): number[] {
  const output: number[] = [];
  let total = 0;
  for (const value of values) {
    total += value;
    output.push(total);
  }
  return output;
}

export class LiveTraceCollector {
  private readonly timelineLength: number;
  private readonly casts: RawRunTrace['casts'] = [];
  private readonly damageBySpell: Record<string, AnalysisSpellStats> = {};
  private readonly recommendations: RecommendationRecord[] = [];
  private readonly buffStacksTimelineBySecond: Record<string, number[]> = {};
  private readonly targetDebuffStacksTimelineBySecond: Record<string, number[]> = {};
  private readonly cooldownTimelineBySecond: Record<string, number[]> = {};
  private readonly damageTimelineBySecond: number[];
  private readonly cumulativeDamageBySecond: number[];
  private readonly energyTimelineBySecond: number[];
  private readonly chiTimelineBySecond: number[];
  private readonly energyWasteTimelineBySecond: number[];
  private readonly chiWasteTimelineBySecond: number[];
  private readonly primaryTargetDebuffStart = new Map<string, number>();
  private readonly primaryTargetDebuffUptimeAccum = new Map<string, number>();
  private lastRecommendationSignature = '';

  constructor(
    private readonly specId: string,
    private readonly encounterDuration: number,
  ) {
    this.timelineLength = Math.max(1, Math.ceil(encounterDuration));
    this.damageTimelineBySecond = Array<number>(this.timelineLength).fill(0);
    this.cumulativeDamageBySecond = Array<number>(this.timelineLength).fill(Number.NaN);
    this.energyTimelineBySecond = Array<number>(this.timelineLength).fill(Number.NaN);
    this.chiTimelineBySecond = Array<number>(this.timelineLength).fill(Number.NaN);
    this.energyWasteTimelineBySecond = Array<number>(this.timelineLength).fill(Number.NaN);
    this.chiWasteTimelineBySecond = Array<number>(this.timelineLength).fill(Number.NaN);
  }

  recordFrame(snapshot: GameStateSnapshot, recommendationSpellIds: string[]): void {
    const second = Math.max(0, Math.min(this.timelineLength - 1, Math.floor(snapshot.currentTime)));
    this.cumulativeDamageBySecond[second] = snapshot.totalDamage;
    this.energyTimelineBySecond[second] = snapshot.energyAtLastUpdate;
    this.chiTimelineBySecond[second] = snapshot.chi;
    this.energyWasteTimelineBySecond[second] = snapshot.energyWasted;
    this.chiWasteTimelineBySecond[second] = snapshot.chiWasted;

    const activeBuffIds = new Set<string>();
    for (const [buffId, buff] of snapshot.buffs.entries()) {
      activeBuffIds.add(buffId);
      const timeline = this.buffStacksTimelineBySecond[buffId]
        ?? (this.buffStacksTimelineBySecond[buffId] = Array<number>(this.timelineLength).fill(Number.NaN));
      timeline[second] = Math.max(1, buff.stacks ?? 1);
    }

    for (const [buffId, timeline] of Object.entries(this.buffStacksTimelineBySecond)) {
      if (!activeBuffIds.has(buffId)) {
        timeline[second] = 0;
      }
    }

    const primaryTarget = snapshot.targets[0];
    const activePrimaryTargetDebuffIds = new Set<string>();
    for (const [debuffId, debuff] of primaryTarget?.debuffs ?? []) {
      activePrimaryTargetDebuffIds.add(debuffId);
      const timeline = this.targetDebuffStacksTimelineBySecond[debuffId]
        ?? (this.targetDebuffStacksTimelineBySecond[debuffId] = Array<number>(this.timelineLength).fill(Number.NaN));
      timeline[second] = Math.max(1, debuff.stacks ?? 1);
      if (!this.primaryTargetDebuffStart.has(debuffId)) {
        this.primaryTargetDebuffStart.set(debuffId, snapshot.currentTime);
      }
    }

    for (const [debuffId, timeline] of Object.entries(this.targetDebuffStacksTimelineBySecond)) {
      if (activePrimaryTargetDebuffIds.has(debuffId)) {
        continue;
      }
      timeline[second] = 0;
      const startedAt = this.primaryTargetDebuffStart.get(debuffId);
      if (startedAt !== undefined) {
        this.primaryTargetDebuffUptimeAccum.set(
          debuffId,
          (this.primaryTargetDebuffUptimeAccum.get(debuffId) ?? 0) + Math.max(0, snapshot.currentTime - startedAt),
        );
        this.primaryTargetDebuffStart.delete(debuffId);
      }
    }

    for (const [spellId, cooldown] of snapshot.cooldowns.entries()) {
      const timeline = this.cooldownTimelineBySecond[spellId]
        ?? (this.cooldownTimelineBySecond[spellId] = Array<number>(this.timelineLength).fill(Number.NaN));
      timeline[second] = Math.max(0, (cooldown.readyAt ?? snapshot.currentTime) - snapshot.currentTime);
    }

    const signature = recommendationSpellIds.join('|');
    if (signature !== this.lastRecommendationSignature) {
      this.recommendations.push({ time: snapshot.currentTime, spellIds: [...recommendationSpellIds] });
      this.lastRecommendationSignature = signature;
    }
  }

  recordCast(spellId: string, time: number, preCastSnapshot: GameStateSnapshot): void {
    this.casts.push({
      time,
      spellId,
      recommendedSpellId: this.getRecommendationAt(time),
      preCastState: buildAnalysisDecisionState(preCastSnapshot, this.getRecommendationsAt(time), time),
    });
  }

  recordDamage(spellId: string, amount: number, isCrit: boolean, time: number): void {
    const entry = this.damageBySpell[spellId] ?? { casts: 0, damage: 0, crits: 0 };
    entry.damage += amount;
    if (isCrit) {
      entry.crits += 1;
    }
    this.damageBySpell[spellId] = entry;

    const second = Math.max(0, Math.min(this.timelineLength - 1, Math.floor(time)));
    this.damageTimelineBySecond[second] += amount;
  }

  recordCombatEvent(event: SimEvent): void {
    if (event.type === EventType.BUFF_APPLY || event.type === EventType.BUFF_EXPIRE || event.type === EventType.BUFF_STACK_CHANGE) {
      return;
    }
  }

  finalize(snapshot: GameStateSnapshot, simTime: number): RawRunTrace {
    if (this.timelineLength > 0) {
      const lastSecond = Math.max(0, Math.min(this.timelineLength - 1, Math.floor(simTime)));
      this.cumulativeDamageBySecond[lastSecond] = snapshot.totalDamage;
      this.energyTimelineBySecond[lastSecond] = snapshot.energyAtLastUpdate;
      this.chiTimelineBySecond[lastSecond] = snapshot.chi;
      this.energyWasteTimelineBySecond[lastSecond] = snapshot.energyWasted;
      this.chiWasteTimelineBySecond[lastSecond] = snapshot.chiWasted;
    }

    fillTimelineGaps(this.cumulativeDamageBySecond);
    fillTimelineGaps(this.energyTimelineBySecond);
    fillTimelineGaps(this.chiTimelineBySecond);
    fillTimelineGaps(this.energyWasteTimelineBySecond);
    fillTimelineGaps(this.chiWasteTimelineBySecond);
    for (const timeline of Object.values(this.buffStacksTimelineBySecond)) {
      fillTimelineGaps(timeline);
    }
    for (const timeline of Object.values(this.targetDebuffStacksTimelineBySecond)) {
      fillTimelineGaps(timeline);
    }
    for (const timeline of Object.values(this.cooldownTimelineBySecond)) {
      fillTimelineGaps(timeline);
    }

    for (const [debuffId, startedAt] of this.primaryTargetDebuffStart) {
      this.primaryTargetDebuffUptimeAccum.set(
        debuffId,
        (this.primaryTargetDebuffUptimeAccum.get(debuffId) ?? 0) + Math.max(0, simTime - startedAt),
      );
    }
    this.primaryTargetDebuffStart.clear();

    return {
      source: 'player',
      specId: this.specId,
      encounterDuration: this.encounterDuration,
      totalDamage: snapshot.totalDamage,
      dps: snapshot.totalDamage / Math.max(0.1, simTime),
      casts: [...this.casts].sort((left, right) => left.time - right.time),
      recommendations: [...this.recommendations],
      damageBySpell: { ...this.damageBySpell },
      damageTimelineBySecond: [...this.damageTimelineBySecond],
      cumulativeDamageBySecond: [...this.cumulativeDamageBySecond],
      buffStacksTimelineBySecond: Object.fromEntries(
        Object.entries(this.buffStacksTimelineBySecond).map(([buffId, timeline]) => [buffId, [...timeline]]),
      ),
      targetDebuffStacksTimelineBySecond: Object.fromEntries(
        Object.entries(this.targetDebuffStacksTimelineBySecond).map(([buffId, timeline]) => [buffId, [...timeline]]),
      ),
      cooldownTimelineBySecond: Object.fromEntries(
        Object.entries(this.cooldownTimelineBySecond).map(([spellId, timeline]) => [spellId, [...timeline]]),
      ),
      resourceTimelineBySecond: {
        energy: [...this.energyTimelineBySecond],
        chi: [...this.chiTimelineBySecond],
      },
      wasteTimelineBySecond: {
        energy: [...this.energyWasteTimelineBySecond],
        chi: [...this.chiWasteTimelineBySecond],
      },
      waitingTime: estimateWaitingTime(this.casts, simTime),
      targetDebuffUptimes: Object.fromEntries(this.primaryTargetDebuffUptimeAccum),
    };
  }

  private getRecommendationAt(time: number): string | null {
    return this.getRecommendationsAt(time)[0] ?? null;
  }

  private getRecommendationsAt(time: number): string[] {
    let current: RecommendationRecord | null = null;
    for (const record of this.recommendations) {
      if (record.time > time) {
        break;
      }
      current = record;
    }

    return current?.spellIds ?? [];
  }

}

export function buildAnalysisDecisionState(
  snapshot: GameStateSnapshot,
  recommendationSpellIds: readonly string[],
  time = snapshot.currentTime,
): AnalysisDecisionState {
  const activeBuffs = [...snapshot.buffs.entries()]
    .map(([buffId, buff]) => ({
      buffId,
      stacks: Math.max(1, buff.stacks ?? 1),
      remaining: buff.expiresAt > 0 ? Math.max(0, buff.expiresAt - time) : undefined,
    }))
    .sort((left, right) => right.stacks - left.stacks || left.buffId.localeCompare(right.buffId));

  const activeCooldowns = [...snapshot.cooldowns.entries()]
    .map(([spellId, cooldown]) => ({
      spellId,
      remaining: Math.max(0, (cooldown.readyAt ?? time) - time),
    }))
    .sort((left, right) => right.remaining - left.remaining || left.spellId.localeCompare(right.spellId));

  return {
    chi: snapshot.chi,
    energy: snapshot.energyAtLastUpdate,
    previousAbility: snapshot.prevGcdAbility,
    topRecommendations: [...recommendationSpellIds].slice(0, 3),
    activeBuffs,
    activeCooldowns,
  };
}

function estimateWaitingTime(casts: RawRunTrace['casts'], simTime: number): number {
  if (casts.length === 0) {
    return simTime;
  }

  let waitingTime = Math.max(0, casts[0].time);
  for (let index = 1; index < casts.length; index += 1) {
    const gap = casts[index].time - casts[index - 1].time;
    if (gap > 1.5) {
      waitingTime += gap - 1.5;
    }
  }

  const tailGap = simTime - casts[casts.length - 1].time;
  if (tailGap > 1.5) {
    waitingTime += tailGap - 1.5;
  }

  return waitingTime;
}

export function buildCumulativeDamageTimeline(damageTimelineBySecond: number[]): number[] {
  return buildCumulativeTimeline(damageTimelineBySecond);
}
