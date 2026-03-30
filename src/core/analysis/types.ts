import type { CharacterLoadout } from '@core/data/loadout';

export const ANALYSIS_VERSION = 'v2';

export interface BenchmarkSignature {
  key: string;
  specId: string;
  encounterDuration: number;
  activeEnemies: number;
  talentsSignature: string;
  loadoutSignature: string;
  aplSignature: string;
  analysisVersion: string;
  rngPolicy: string;
}

export interface AnalysisSpellStats {
  casts: number;
  damage: number;
  crits: number;
}

export interface RecommendationRecord {
  time: number;
  spellIds: string[];
}

export interface RunCastRecord {
  time: number;
  spellId: string;
  recommendedSpellId: string | null;
}

export interface RawRunTrace {
  source: 'player' | 'trainer';
  specId: string;
  encounterDuration: number;
  totalDamage: number;
  dps: number;
  casts: RunCastRecord[];
  recommendations: RecommendationRecord[];
  damageBySpell: Record<string, AnalysisSpellStats>;
  damageTimelineBySecond: number[];
  cumulativeDamageBySecond: number[];
  buffStacksTimelineBySecond: Record<string, number[]>;
  cooldownTimelineBySecond: Record<string, number[]>;
  resourceTimelineBySecond: {
    energy: number[];
    chi: number[];
  };
  wasteTimelineBySecond: {
    energy: number[];
    chi: number[];
  };
  waitingTime: number;
  benchmarkSignature?: BenchmarkSignature;
}

export interface AnalysisChartPoint {
  time: number;
  player: number;
  trainer: number;
}

export interface ResourceWasteChartPoint {
  time: number;
  playerChi: number;
  trainerChi: number;
  playerEnergy: number;
  trainerEnergy: number;
}

export interface CooldownTimelineRow {
  spellId: string;
  label: string;
  playerTimes: number[];
  trainerTimes: number[];
}

export interface SpellTimelineChart {
  player: RunCastRecord[];
  trainer: RunCastRecord[];
}

export interface FindingEvidence {
  time: number;
  actualSpellId?: string;
  expectedSpellId?: string;
  note: string;
}

export interface AnalysisActiveBuffState {
  buffId: string;
  stacks: number;
}

export interface AnalysisActiveCooldownState {
  spellId: string;
  remaining: number;
}

export interface AnalysisDecisionState {
  chi: number;
  energy: number;
  previousAbility: string | null;
  topRecommendations: string[];
  activeBuffs: AnalysisActiveBuffState[];
  activeCooldowns: AnalysisActiveCooldownState[];
}

export interface AnalysisFinding {
  id: string;
  category: 'apl' | 'cooldown' | 'ability' | 'setup' | 'downtime' | 'resource';
  title: string;
  summary: string;
  fix: string;
  focusSpellId?: string;
  comparisonSpellId?: string;
  estimatedDpsLoss: number;
  occurrences: number;
  severity: 'major' | 'medium' | 'minor';
  evidence: FindingEvidence[];
}

export interface AplRuleExplanation {
  title: string;
  summary: string;
  fix: string;
}

export interface ExactMistakeEntry {
  id: string;
  time: number;
  playerSpellId: string | null;
  expectedSpellId: string;
  title: string;
  summary: string;
  fix: string;
  playerState: AnalysisDecisionState;
}

export interface DowntimeContext {
  duration: number;
  startedAt: number;
  endedAt: number;
  topRecommendation: string | null;
  chiBefore: number;
  energyBefore: number;
  chiWasteDelta: number;
  energyWasteDelta: number;
}

export interface SpecAnalysisProfile {
  specId: string;
  importantCooldowns: string[];
  importantAbilities: string[];
  exactMistakeSpellIds: string[];
  explainRecommendedSpell(spellId: string): AplRuleExplanation | null;
  explainExactDecision?(
    expectedSpellId: string,
    actualSpellId: string,
    playerState: AnalysisDecisionState,
  ): AplRuleExplanation | null;
  getTrackedBuffIds(): string[];
  getEssentialCooldownSpellIds(): string[];
  analyzeSetup(player: RawRunTrace, trainer: RawRunTrace): AnalysisFinding[];
  shouldFlagDowntime(context: DowntimeContext): boolean;
}

export interface RunAnalysisReport {
  score: {
    trainerDpsRatio: number;
    playerDps: number;
    trainerDps: number;
    playerTotalDamage: number;
    trainerTotalDamage: number;
    duration: number;
    label: string;
  };
  benchmarkSignature: BenchmarkSignature;
  charts: {
    damageOverTime: AnalysisChartPoint[];
    cumulativeDamage: AnalysisChartPoint[];
    spellTimeline: SpellTimelineChart;
    cooldownUsage: CooldownTimelineRow[];
    resourceWaste: ResourceWasteChartPoint[];
  };
  exactMistakes: ExactMistakeEntry[];
  findings: AnalysisFinding[];
}

export interface AnalysisProfileInput {
  specId: string;
  encounterDuration: number;
  activeEnemies: number;
  talents: ReadonlySet<string>;
  talentRanks: ReadonlyMap<string, number>;
  loadout: CharacterLoadout;
}
