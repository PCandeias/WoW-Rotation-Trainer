import { useCallback, useEffect, useRef } from 'react';
import type { CountdownValue } from '@ui/sim/useSimulation';
import type { TrainerMode } from '@ui/state/trainerSettings';
import {
  loadEncounterMusicCatalog,
  pickEncounterMusicStartTrack,
  pickNextEncounterMusicTrack,
  pickSkippedEncounterMusicTrack,
  type ResolvedEncounterMusicTrack,
} from './encounterMusic';

export interface UseEncounterMusicOptions {
  mode: TrainerMode;
  encounterDuration: number;
  simTime: number;
  countdownValue: CountdownValue;
  hasStarted: boolean;
  isPaused: boolean;
  isEnded: boolean;
  musicVolume: number;
}

export interface UseEncounterMusicResult {
  skipToNextTrack: () => void;
}

/**
 * Manages competitive-mode encounter music playback and playlist cycling.
 */
export function useEncounterMusic({
  mode,
  encounterDuration,
  simTime,
  countdownValue,
  hasStarted,
  isPaused,
  isEnded,
  musicVolume,
}: UseEncounterMusicOptions): UseEncounterMusicResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackCatalogRef = useRef<ResolvedEncounterMusicTrack[] | null>(null);
  const currentTrackIndexRef = useRef<number | null>(null);
  const simTimeRef = useRef(simTime);
  const encounterDurationRef = useRef(encounterDuration);

  simTimeRef.current = simTime;
  encounterDurationRef.current = encounterDuration;

  const stopAndReset = useCallback((): void => {
    currentTrackIndexRef.current = null;
    if (audioRef.current === null) {
      return;
    }

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }, []);

  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current === null) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }

    return audioRef.current;
  }, []);

  const applyVolume = useCallback(
    (audio: HTMLAudioElement): void => {
      audio.volume = Math.min(1, Math.max(0, musicVolume / 100));
    },
    [musicVolume],
  );

  const playTrack = useCallback(
    async (catalog: readonly ResolvedEncounterMusicTrack[], trackIndex: number): Promise<void> => {
      const track = catalog[trackIndex];
      if (!track) {
        return;
      }

      const audio = ensureAudio();
      currentTrackIndexRef.current = trackIndex;
      applyVolume(audio);
      audio.src = track.src;
      audio.currentTime = 0;

      try {
        await audio.play();
      } catch (error) {
        console.warn('Encounter music playback was blocked by the browser.', error);
      }
    },
    [applyVolume, ensureAudio],
  );

  const skipToNextTrack = useCallback((): void => {
    const eligibleMode = mode === 'test' || mode === 'challenge';
    if (!eligibleMode || !hasStarted || countdownValue !== null || isEnded) {
      return;
    }

    void (async (): Promise<void> => {
      const catalog = trackCatalogRef.current ?? await loadEncounterMusicCatalog();
      trackCatalogRef.current = catalog;
      if (catalog.length === 0) {
        return;
      }

      if (currentTrackIndexRef.current === null) {
        const remainingDuration = Math.max(0, encounterDurationRef.current - simTimeRef.current);
        const startTrack = pickEncounterMusicStartTrack(catalog, remainingDuration);
        if (startTrack !== null) {
          await playTrack(catalog, startTrack.index);
        }
        return;
      }

      const nextTrack = pickSkippedEncounterMusicTrack(catalog, currentTrackIndexRef.current);
      if (nextTrack !== null) {
        await playTrack(catalog, nextTrack.index);
      }
    })();
  }, [countdownValue, hasStarted, isEnded, mode, playTrack]);

  useEffect(() => {
    if (audioRef.current !== null) {
      applyVolume(audioRef.current);
    }
  }, [applyVolume]);

  useEffect(() => {
    let cancelled = false;

    void loadEncounterMusicCatalog().then((catalog) => {
      if (cancelled) {
        return;
      }
      trackCatalogRef.current = catalog;
    });

    return (): void => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const audio = ensureAudio();

    const handleEnded = (): void => {
      const catalog = trackCatalogRef.current;
      const currentTrackIndex = currentTrackIndexRef.current;
      if (!catalog || currentTrackIndex === null) {
        return;
      }

      const remainingDuration = encounterDurationRef.current - simTimeRef.current;
      const nextTrack = pickNextEncounterMusicTrack(catalog, currentTrackIndex, remainingDuration);
      if (nextTrack === null) {
        currentTrackIndexRef.current = null;
        return;
      }

      void playTrack(catalog, nextTrack.index);
    };

    audio.addEventListener('ended', handleEnded);
    return (): void => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [ensureAudio, playTrack]);

  useEffect(() => {
    const eligibleMode = mode === 'test' || mode === 'challenge';
    const shouldReset = !eligibleMode || !hasStarted || countdownValue !== null || isEnded;
    const shouldPause = eligibleMode && isPaused && !shouldReset;

    if (shouldReset) {
      stopAndReset();
      return;
    }

    const audio = ensureAudio();
    applyVolume(audio);

    if (shouldPause) {
      audio.pause();
      return;
    }

    if (currentTrackIndexRef.current !== null) {
      if (audio.paused) {
        void audio.play().catch((error) => {
          console.warn('Encounter music playback was blocked by the browser.', error);
        });
      }
      return;
    }

    let cancelled = false;

    const startPlayback = async (): Promise<void> => {
      const catalog = trackCatalogRef.current ?? await loadEncounterMusicCatalog();
      if (cancelled) {
        return;
      }

      trackCatalogRef.current = catalog;
      const startTrack = pickEncounterMusicStartTrack(catalog, encounterDuration);
      if (startTrack === null) {
        return;
      }

      await playTrack(catalog, startTrack.index);
    };

    void startPlayback();

    return (): void => {
      cancelled = true;
    };
  }, [
    applyVolume,
    countdownValue,
    encounterDuration,
    ensureAudio,
    hasStarted,
    isEnded,
    isPaused,
    mode,
    playTrack,
    stopAndReset,
  ]);

  useEffect((): (() => void) => () => {
    stopAndReset();
  }, [stopAndReset]);

  return {
    skipToNextTrack,
  };
}
