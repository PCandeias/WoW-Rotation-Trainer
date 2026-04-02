import {
  buildAnalysisDecisionState,
  getAnalysisProfileForSpec,
  type AplRuleExplanation,
  type AnalysisDecisionState,
} from '@core/analysis';
import type { GameStateSnapshot } from '@core/engine/gameState';

export interface TutorialPrompt {
  expectedSpellId: string;
  actualSpellId: string | null;
  title: string;
  summary: string;
  fix: string;
  topRecommendations: string[];
  playerState: AnalysisDecisionState;
  phaseLabel: 'Opener' | 'Priority';
}

export interface BuildTutorialPromptArgs {
  analysisSpecId: string;
  talents: ReadonlySet<string>;
  snapshot: GameStateSnapshot;
  recommendations: readonly string[];
  actualSpellId: string;
}

export function buildTutorialPrompt({
  analysisSpecId,
  talents,
  snapshot,
  recommendations,
  actualSpellId,
}: BuildTutorialPromptArgs): TutorialPrompt | null {
  const expectedSpellId = recommendations[0] ?? null;
  if (expectedSpellId === null || expectedSpellId === actualSpellId) {
    return null;
  }

  const profile = getAnalysisProfileForSpec(analysisSpecId, talents);
  const playerState = buildAnalysisDecisionState(snapshot, recommendations);
  if (profile.shouldReportRecommendationMismatch?.(expectedSpellId, actualSpellId, playerState) === false) {
    return null;
  }

  const explanation =
    profile.explainExactDecision?.(expectedSpellId, actualSpellId, playerState)
    ?? profile.explainRecommendedSpell(expectedSpellId);
  if (explanation === null) {
    return null;
  }

  return {
    expectedSpellId,
    actualSpellId,
    topRecommendations: recommendations.slice(0, 4),
    playerState,
    phaseLabel: getTutorialPhaseLabel(snapshot.currentTime),
    ...explanation,
  };
}

export function buildTutorialReadyPrompt({
  analysisSpecId,
  talents,
  snapshot,
  recommendations,
}: Omit<BuildTutorialPromptArgs, 'actualSpellId'>): TutorialPrompt | null {
  const expectedSpellId = recommendations[0] ?? null;
  if (expectedSpellId === null) {
    return null;
  }

  const profile = getAnalysisProfileForSpec(analysisSpecId, talents);
  const playerState = buildAnalysisDecisionState(snapshot, recommendations);
  const explanation = profile.explainRecommendedSpell(expectedSpellId);
  if (explanation === null) {
    return null;
  }

  return {
    expectedSpellId,
    actualSpellId: null,
    topRecommendations: recommendations.slice(0, 4),
    playerState,
    phaseLabel: getTutorialPhaseLabel(snapshot.currentTime),
    ...explanation,
  };
}

function getTutorialPhaseLabel(currentTime: number): 'Opener' | 'Priority' {
  return currentTime < 2 ? 'Opener' : 'Priority';
}

export function formatTutorialWhyText(explanation: Pick<AplRuleExplanation, 'summary' | 'fix'>): string {
  return `${explanation.summary} ${explanation.fix}`.trim();
}
