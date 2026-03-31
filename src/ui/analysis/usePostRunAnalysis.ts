import { useEffect, useMemo, useState } from 'react';
import { cloneLoadout, type CharacterLoadout } from '@core/data/loadout';
import { getDefaultMonkWindwalkerProfile } from '@core/data/defaultProfile';
import type { CharacterProfile } from '@core/data/profileParser';
import { createGameState } from '@core/engine/gameState';
import { runHeadless } from '@core/engine/headless';
import { deriveTargetMaxHealthForKillRange } from '@core/engine/target';
import {
  buildBenchmarkSignature,
  buildMonkWindwalkerAnalysisProfile,
  buildRunAnalysisReport,
  buildTrainerBenchmarkTrace,
  buildTraceFromSimResult,
  type BenchmarkSignature,
  type RawRunTrace,
  type RunAnalysisReport,
} from '@core/analysis';

const TRAINER_BENCHMARK_SEEDS = [1337, 7331, 9001, 4242, 2026] as const;
const trainerTraceCache = new Map<string, RawRunTrace>();

interface UsePostRunAnalysisOptions {
  enabled: boolean;
  specId: string;
  encounterDuration: number;
  activeEnemies?: number;
  talents: ReadonlySet<string>;
  talentRanks: ReadonlyMap<string, number>;
  loadout: CharacterLoadout;
  playerTrace: RawRunTrace | null;
}

interface UsePostRunAnalysisResult {
  status: 'idle' | 'loading' | 'ready' | 'error';
  benchmarkSignature: BenchmarkSignature | null;
  report: RunAnalysisReport | null;
  error: string | null;
}

export function usePostRunAnalysis(options: UsePostRunAnalysisOptions): UsePostRunAnalysisResult {
  const { enabled, specId, encounterDuration, activeEnemies = 1, talents, talentRanks, loadout, playerTrace } = options;
  const benchmarkSignature = useMemo(
    () => buildBenchmarkSignature({ specId, encounterDuration, activeEnemies, talents, talentRanks, loadout }),
    [activeEnemies, encounterDuration, loadout, specId, talentRanks, talents],
  );
  const analysisProfile = useMemo(
    () => buildMonkWindwalkerAnalysisProfile(talents),
    [talents],
  );

  const [result, setResult] = useState<UsePostRunAnalysisResult>({
    status: 'idle',
    benchmarkSignature: null,
    report: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !playerTrace) {
      setResult({ status: 'idle', benchmarkSignature: null, report: null, error: null });
      return;
    }

    let cancelled = false;
    setResult({ status: 'loading', benchmarkSignature, report: null, error: null });

    const timerId = window.setTimeout(() => {
      try {
        const trainerTrace = getOrCreateTrainerTrace(benchmarkSignature, {
          talents,
          talentRanks,
          loadout,
          encounterDuration,
          activeEnemies,
        });
        const report = buildRunAnalysisReport(benchmarkSignature, playerTrace, trainerTrace, analysisProfile);
        if (!cancelled) {
          setResult({ status: 'ready', benchmarkSignature, report, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setResult({
            status: 'error',
            benchmarkSignature,
            report: null,
            error: error instanceof Error ? error.message : 'Unknown analysis error',
          });
        }
      }
    }, 0);

    return (): void => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [activeEnemies, analysisProfile, benchmarkSignature, enabled, encounterDuration, loadout, playerTrace, talentRanks, talents]);

  return result;
}

function getOrCreateTrainerTrace(
  benchmarkSignature: BenchmarkSignature,
  options: {
    talents: ReadonlySet<string>;
    talentRanks: ReadonlyMap<string, number>;
    loadout: CharacterLoadout;
    encounterDuration: number;
    activeEnemies: number;
  },
): RawRunTrace {
  const cached = trainerTraceCache.get(benchmarkSignature.key);
  if (cached) {
    return cached;
  }

  const profile = buildProfile(options.talents, options.talentRanks, options.loadout);
  const bootstrapState = createGameState(profile, {
    duration: options.encounterDuration,
    activeEnemies: options.activeEnemies,
  });
  const targetMaxHealth = deriveTargetMaxHealthForKillRange(bootstrapState.getMaxHealth());
  const traces = TRAINER_BENCHMARK_SEEDS.map((seed) => {
    const result = runHeadless({
      profile,
      encounter: {
        duration: options.encounterDuration,
        activeEnemies: options.activeEnemies,
        targetMaxHealth,
      },
      seed,
    });
    return buildTraceFromSimResult(result, profile.spec, benchmarkSignature);
  });
  const trace = buildTrainerBenchmarkTrace(traces, benchmarkSignature);
  trainerTraceCache.set(benchmarkSignature.key, trace);
  return trace;
}

function buildProfile(
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
  loadout: CharacterLoadout,
): CharacterProfile {
  const defaultProfile = getDefaultMonkWindwalkerProfile();
  return {
    ...defaultProfile,
    talents: new Set(talents),
    talentRanks: new Map(talentRanks),
    loadout: cloneLoadout(loadout),
  };
}
