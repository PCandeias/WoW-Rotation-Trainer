import React, { useState, useEffect } from 'react';
import { applyThemeVars, T } from '@ui/theme/elvui';
import { EncounterScreen } from '@ui/screens/EncounterScreen';
import { SpecSelectionScreen } from '@ui/screens/SpecSelectionScreen';
import { SetupScreen } from '@ui/screens/SetupScreen';
import { cloneLoadout } from '@core/data/loadout';
import {
  resolveEncounterDuration,
  toTalentRankMap,
  toTalentSet,
  useTrainerSettings,
} from '@ui/state/trainerSettings';

type Screen = 'spec-select' | 'setup' | 'encounter';

/**
 * Root application component.
 *
 * Manages top-level navigation between the menu and the encounter view.
 * Applies the ElvUI theme CSS variables on mount.
 */
export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('spec-select');
  const [settings, setSettings] = useTrainerSettings();

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

  if (screen === 'encounter') {
    return (
      <EncounterScreen
        mode={settings.mode}
        speedMultiplier={settings.mode === 'practice' ? settings.practiceSpeedMultiplier : 1}
        challengeSettings={settings.challenge}
        encounterDuration={resolveEncounterDuration(settings)}
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
        onExit={() => setScreen('setup')}
      />
    );
  }

  if (screen === 'setup') {
    return (
      <SetupScreen
        settings={settings}
        onBack={(): void => setScreen('spec-select')}
        onChange={setSettings}
        onStart={(): void => setScreen('encounter')}
      />
    );
  }

  return (
    <SpecSelectionScreen
      selectedSpec={settings.selectedSpec}
      onSelectSpec={(selectedSpec): void => {
        setSettings((current) => ({ ...current, selectedSpec }));
        setScreen('setup');
      }}
    />
  );
}
