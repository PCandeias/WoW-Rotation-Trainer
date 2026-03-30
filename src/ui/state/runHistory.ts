import { useCallback, useState } from 'react';
import type { RunAnalysisReport } from '@core/analysis';
import type { TrainerMode } from './trainerSettings';

const RUN_HISTORY_STORAGE_KEY = 'wow_trainer_run_history_v1';
const MAX_RECENT_RUNS = 5;

export interface StoredRunRecord {
  id: string;
  createdAt: string;
  saved: boolean;
  mode: TrainerMode;
  duration: number;
  endReason: string | null;
  report: RunAnalysisReport;
}

export interface RunHistoryState {
  runs: StoredRunRecord[];
}

export type RunHistoryUpdater = RunHistoryState | ((current: RunHistoryState) => RunHistoryState);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRunAnalysisReport(value: unknown): value is RunAnalysisReport {
  if (!isRecord(value)) {
    return false;
  }

  return isRecord(value.score)
    && isRecord(value.benchmarkSignature)
    && isRecord(value.charts)
    && Array.isArray(value.exactMistakes)
    && Array.isArray(value.findings);
}

function normalizeStoredRun(value: unknown): StoredRunRecord | null {
  if (!isRecord(value) || !isRunAnalysisReport(value.report)) {
    return null;
  }

  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString();
  const mode = value.mode === 'tutorial' || value.mode === 'practice' || value.mode === 'test' || value.mode === 'challenge'
    ? value.mode
    : 'test';

  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    saved: value.saved === true,
    mode,
    duration: typeof value.duration === 'number' && Number.isFinite(value.duration) ? value.duration : 0,
    endReason: typeof value.endReason === 'string' ? value.endReason : null,
    report: value.report,
  };
}

export function pruneRunHistory(runs: readonly StoredRunRecord[]): StoredRunRecord[] {
  const sorted = [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const keptUnsaved: StoredRunRecord[] = [];
  const keptSaved: StoredRunRecord[] = [];

  sorted.forEach((run) => {
    if (run.saved) {
      keptSaved.push(run);
      return;
    }

    if (keptUnsaved.length < MAX_RECENT_RUNS) {
      keptUnsaved.push(run);
    }
  });

  return [...keptSaved, ...keptUnsaved].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function normalizeRunHistory(value: unknown): RunHistoryState {
  if (!isRecord(value) || !Array.isArray(value.runs)) {
    return { runs: [] };
  }

  return {
    runs: pruneRunHistory(value.runs.map(normalizeStoredRun).filter((run): run is StoredRunRecord => run !== null)),
  };
}

function readRunHistory(): RunHistoryState {
  try {
    const raw = localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    if (raw === null) {
      return { runs: [] };
    }

    return normalizeRunHistory(JSON.parse(raw) as unknown);
  } catch {
    return { runs: [] };
  }
}

export function createStoredRunRecord(input: {
  mode: TrainerMode;
  duration: number;
  endReason: string | null;
  report: RunAnalysisReport;
}): StoredRunRecord {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    saved: false,
    mode: input.mode,
    duration: input.duration,
    endReason: input.endReason,
    report: input.report,
  };
}

export function addRunToHistory(history: RunHistoryState, run: StoredRunRecord): RunHistoryState {
  return {
    runs: pruneRunHistory([run, ...history.runs.filter((candidate) => candidate.id !== run.id)]),
  };
}

export function saveRunInHistory(history: RunHistoryState, runId: string, saved: boolean): RunHistoryState {
  return {
    runs: pruneRunHistory(history.runs.map((run) => run.id === runId ? { ...run, saved } : run)),
  };
}

export function deleteRunFromHistory(history: RunHistoryState, runId: string): RunHistoryState {
  return {
    runs: history.runs.filter((run) => run.id !== runId),
  };
}

export function getSavedRuns(history: RunHistoryState): StoredRunRecord[] {
  return history.runs.filter((run) => run.saved);
}

export function getRecentRuns(history: RunHistoryState): StoredRunRecord[] {
  return history.runs.filter((run) => !run.saved).slice(0, MAX_RECENT_RUNS);
}

export function useRunHistory(): [RunHistoryState, (next: RunHistoryUpdater) => void] {
  const [history, setHistoryState] = useState<RunHistoryState>(readRunHistory);

  const setHistory = useCallback((next: RunHistoryUpdater): void => {
    setHistoryState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      const normalized = normalizeRunHistory(resolved);
      try {
        localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // Storage unavailable — keep using in-memory state.
      }
      return normalized;
    });
  }, []);

  return [history, setHistory];
}
