import React, { useEffect, useMemo, useState } from 'react';
import { applyThemeVars, T } from '@ui/theme/elvui';
import { AnalysisReviewScreen, EncounterScreen } from '@ui/screens/EncounterScreen';
import { SpecSelectionScreen } from '@ui/screens/SpecSelectionScreen';
import { SetupScreen, type SetupTab } from '@ui/screens/SetupScreen';
import { cloneLoadout } from '@core/data/loadout';
import {
  resolveEncounterDuration,
  toTalentRankMap,
  toTalentSet,
  useTrainerSettings,
} from '@ui/state/trainerSettings';
import {
  addRunToHistory,
  createStoredRunRecord,
  deleteRunFromHistory,
  saveRunInHistory,
  useRunHistory,
} from '@ui/state/runHistory';

type Screen = 'spec-select' | 'setup' | 'encounter' | 'history-review';

function isBrowserNavigationMouseButton(event: MouseEvent): boolean {
  return event.button === 3 || event.button === 4;
}

function isBrowserNavigationKey(event: KeyboardEvent): boolean {
  return event.key === 'BrowserBack'
    || event.key === 'BrowserForward'
    || event.code === 'BrowserBack'
    || event.code === 'BrowserForward';
}

/**
 * Root application component.
 *
 * Manages top-level navigation between the menu and the encounter view.
 * Applies the ElvUI theme CSS variables on mount.
 */
export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('spec-select');
  const [settings, setSettings] = useTrainerSettings();
  const [history, setHistory] = useRunHistory();
  const [setupInitialTab, setSetupInitialTab] = useState<SetupTab>('mode');
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null);
  const selectedHistoryRun = useMemo(
    () => history.runs.find((run) => run.id === selectedHistoryRunId) ?? null,
    [history.runs, selectedHistoryRunId],
  );

  useEffect(() => {
    applyThemeVars();

    const root = document.documentElement;
    const body = document.body;
    const appRoot = document.getElementById('root');
    const previousRoot = {
      height: root.style.height,
      overflow: root.style.overflow,
    };
    const previousBody = {
      margin: body.style.margin,
      minHeight: body.style.minHeight,
      height: body.style.height,
      overflow: body.style.overflow,
      backgroundColor: body.style.backgroundColor,
    };
    const previousAppRoot = appRoot
      ? {
        width: appRoot.style.width,
        height: appRoot.style.height,
        overflow: appRoot.style.overflow,
      }
      : null;

    root.style.height = '100%';
    root.style.overflow = 'hidden';
    body.style.margin = '0';
    body.style.minHeight = '100%';
    body.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.backgroundColor = T.bg;
    if (appRoot) {
      appRoot.style.width = '100%';
      appRoot.style.height = '100%';
      appRoot.style.overflow = 'hidden';
    }

    return (): void => {
      root.style.height = previousRoot.height;
      root.style.overflow = previousRoot.overflow;
      body.style.margin = previousBody.margin;
      body.style.minHeight = previousBody.minHeight;
      body.style.height = previousBody.height;
      body.style.overflow = previousBody.overflow;
      body.style.backgroundColor = previousBody.backgroundColor;
      if (appRoot && previousAppRoot) {
        appRoot.style.width = previousAppRoot.width;
        appRoot.style.height = previousAppRoot.height;
        appRoot.style.overflow = previousAppRoot.overflow;
      }
    };
  }, []);

  useEffect(() => {
    const handleWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (['+', '=', '-', '_', '0'].includes(event.key)) {
        event.preventDefault();
      }
    };

    const handleNavigationMouseButton = (event: MouseEvent): void => {
      if (isBrowserNavigationMouseButton(event)) {
        event.preventDefault();
      }
    };

    const handleNavigationKey = (event: KeyboardEvent): void => {
      if (isBrowserNavigationKey(event)) {
        event.preventDefault();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keydown', handleNavigationKey, { capture: true });
    window.addEventListener('mousedown', handleNavigationMouseButton, { capture: true });
    window.addEventListener('mouseup', handleNavigationMouseButton, { capture: true });
    window.addEventListener('auxclick', handleNavigationMouseButton, { capture: true });
    return (): void => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleNavigationKey, { capture: true });
      window.removeEventListener('mousedown', handleNavigationMouseButton, { capture: true });
      window.removeEventListener('mouseup', handleNavigationMouseButton, { capture: true });
      window.removeEventListener('auxclick', handleNavigationMouseButton, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (screen === 'history-review' && selectedHistoryRun === null) {
      setSetupInitialTab('history');
      setScreen('setup');
    }
  }, [screen, selectedHistoryRun]);

  if (screen === 'encounter') {
    return (
      <EncounterScreen
        mode={settings.mode}
        speedMultiplier={settings.mode === 'practice' ? settings.practiceSpeedMultiplier : 1}
        challengeSettings={settings.challenge}
        encounterDuration={resolveEncounterDuration(settings)}
        nTargets={settings.nTargets}
        musicVolume={settings.audio.musicVolume}
        initialTalents={toTalentSet(settings)}
        initialTalentRanks={toTalentRankMap(settings)}
        initialLoadout={settings.loadout}
        onMusicVolumeChange={(musicVolume): void => {
          setSettings((current) => ({
            ...current,
            audio: {
              ...current.audio,
              musicVolume,
            },
          }));
        }}
        actionBarSettings={settings.actionBars}
        hudSettings={settings.hud}
        onTalentsChange={(talents, talentRanks): void => {
          setSettings((current) => ({
            ...current,
            talents: [...talents].sort(),
            talentRanks: Object.fromEntries([...talentRanks.entries()].sort(([left], [right]) => left.localeCompare(right))),
          }));
        }}
        onLoadoutChange={(loadout): void => {
          setSettings((current) => ({
            ...current,
            loadout: cloneLoadout(loadout),
          }));
        }}
        onAnalysisReady={(result): void => {
          setHistory((current) => addRunToHistory(current, createStoredRunRecord(result)));
        }}
        onExit={() => {
          setSetupInitialTab('mode');
          setScreen('setup');
        }}
      />
    );
  }

  if (screen === 'history-review' && selectedHistoryRun) {
    return (
      <AnalysisReviewScreen
        mode={selectedHistoryRun.mode}
        duration={selectedHistoryRun.duration}
        endReason={selectedHistoryRun.endReason}
        report={selectedHistoryRun.report}
        onRestart={() => {
          setSetupInitialTab('mode');
          setScreen('encounter');
        }}
        onExit={() => {
          setSetupInitialTab('history');
          setScreen('setup');
        }}
        heading="Saved Analysis"
      />
    );
  }

  if (screen === 'setup') {
    return (
      <SetupScreen
        settings={settings}
        initialTab={setupInitialTab}
        historyRuns={history.runs}
        onBack={(): void => setScreen('spec-select')}
        onChange={setSettings}
        onStart={(): void => {
          setSetupInitialTab('mode');
          setScreen('encounter');
        }}
        onOpenHistoryRun={(runId): void => {
          setSelectedHistoryRunId(runId);
          setScreen('history-review');
        }}
        onSaveHistoryRun={(runId, saved): void => {
          setHistory((current) => saveRunInHistory(current, runId, saved));
        }}
        onDeleteHistoryRun={(runId): void => {
          if (selectedHistoryRunId === runId) {
            setSelectedHistoryRunId(null);
          }
          setHistory((current) => deleteRunFromHistory(current, runId));
        }}
      />
    );
  }

  return (
    <SpecSelectionScreen
      selectedSpec={settings.selectedSpec}
      onSelectSpec={(selectedSpec): void => {
        setSettings((current) => ({ ...current, selectedSpec }));
        setSetupInitialTab('mode');
        setScreen('setup');
      }}
    />
  );
}
