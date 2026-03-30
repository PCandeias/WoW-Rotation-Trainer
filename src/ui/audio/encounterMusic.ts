export interface EncounterMusicTrack {
  id: string;
  title: string;
  src: string;
}

export interface ResolvedEncounterMusicTrack extends EncounterMusicTrack {
  durationSeconds: number | null;
}

export interface IndexedEncounterMusicTrack extends ResolvedEncounterMusicTrack {
  index: number;
}

const TRACK_FIT_BUFFER_SECONDS = 2;

/**
 * The encounter playlist used for competitive modes.
 */
export const ENCOUNTER_MUSIC_TRACKS: readonly EncounterMusicTrack[] = [
  {
    id: 'across-the-ancient-canopy',
    title: 'Across the Ancient Canopy',
    src: new URL('../../../assets/Across_the_Ancient_Canopy.mp3', import.meta.url).href,
  },
  {
    id: 'apex-of-the-siege',
    title: 'Apex of the Siege',
    src: new URL('../../../assets/Apex_of_the_Siege.mp3', import.meta.url).href,
  },
  {
    id: 'ascent-of-the-final-peak',
    title: 'Ascent of the Final Peak',
    src: new URL('../../../assets/Ascent_of_the_Final_Peak.mp3', import.meta.url).href,
  },
  {
    id: 'beneath-the-heavy-gate',
    title: 'Beneath the Heavy Gate',
    src: new URL('../../../assets/Beneath_the_Heavy_Gate.mp3', import.meta.url).href,
  },
  {
    id: 'golden-horizon-charge',
    title: 'Golden Horizon Charge',
    src: new URL('../../../assets/Golden_Horizon_Charge.mp3', import.meta.url).href,
  },
  {
    id: 'iron-against-scales',
    title: 'Iron Against Scales',
    src: new URL('../../../assets/Iron_Against_Scales.mp3', import.meta.url).href,
  },
  {
    id: 'leap-above-the-canopy',
    title: 'Leap Above the Canopy',
    src: new URL('../../../assets/Leap_Above_the_Canopy.mp3', import.meta.url).href,
  },
  {
    id: 'over-the-ramparts',
    title: 'Over the Ramparts',
    src: new URL('../../../assets/Over_the_Ramparts.mp3', import.meta.url).href,
  },
  {
    id: 'siege-of-the-high-peak',
    title: 'Siege of the High Peak',
    src: new URL('../../../assets/Siege_of_the_High_Peak.mp3', import.meta.url).href,
  },
  {
    id: 'storming-the-great-hall',
    title: 'Storming the Great Hall',
    src: new URL('../../../assets/Storming_the_Great_Hall.mp3', import.meta.url).href,
  },
  {
    id: 'the-final-gauntlet',
    title: 'The Final Gauntlet',
    src: new URL('../../../assets/The_Final_Gauntlet.mp3', import.meta.url).href,
  },
  {
    id: 'the-forge-sovereign',
    title: 'The Forge Sovereign',
    src: new URL('../../../assets/The_Forge_Sovereign.mp3', import.meta.url).href,
  },
  {
    id: 'the-final-gatekeeper',
    title: 'The Final Gatekeeper',
    src: new URL('../../../assets/The_Final_Gatekeeper.mp3', import.meta.url).href,
  },
  {
    id: 'the-last-corridor',
    title: 'The Last Corridor',
    src: new URL('../../../assets/The_Last_Corridor.mp3', import.meta.url).href,
  },
  {
    id: 'the-last-platform',
    title: 'The Last Platform',
    src: new URL('../../../assets/The_Last_Platform.mp3', import.meta.url).href,
  },
  {
    id: 'the-obsidian-gate-remains',
    title: 'The Obsidian Gate Remains',
    src: new URL('../../../assets/The_Obsidian_Gate_Remains.mp3', import.meta.url).href,
  },
  {
    id: 'the-sovereigns-last-sprint',
    title: "The Sovereign's Last Sprint",
    src: new URL('../../../assets/The_Sovereign_s_Last_Sprint.mp3', import.meta.url).href,
  },
  {
    id: 'the-weight-of-every-step',
    title: 'The Weight of Every Step',
    src: new URL('../../../assets/The_Weight_Of_Every_Step.mp3', import.meta.url).href,
  },
] as const;

let cachedCatalogPromise: Promise<ResolvedEncounterMusicTrack[]> | null = null;

function createBrowserAudio(): HTMLAudioElement {
  return new Audio();
}

function clampCandidateIndex(length: number, randomValue: number): number {
  if (length <= 1) {
    return 0;
  }

  const normalized = Number.isFinite(randomValue) ? randomValue : 0;
  return Math.min(length - 1, Math.max(0, Math.floor(normalized * length)));
}

function trackFitsDuration(track: ResolvedEncounterMusicTrack, durationSeconds: number): boolean {
  return track.durationSeconds !== null && track.durationSeconds <= durationSeconds + TRACK_FIT_BUFFER_SECONDS;
}

function toIndexedTracks(tracks: readonly ResolvedEncounterMusicTrack[]): IndexedEncounterMusicTrack[] {
  return tracks.map((track, index) => ({ ...track, index }));
}

function findShortestKnownTrack(tracks: readonly IndexedEncounterMusicTrack[]): IndexedEncounterMusicTrack | null {
  return tracks.reduce<IndexedEncounterMusicTrack | null>((shortest, track) => {
    if (track.durationSeconds === null) {
      return shortest;
    }

    if (shortest === null) {
      return track;
    }

    if (shortest.durationSeconds === null || track.durationSeconds < shortest.durationSeconds) {
      return track;
    }

    return shortest;
  }, null);
}

/**
 * Chooses the first encounter track, preferring songs that fit the full run length.
 */
export function pickEncounterMusicStartTrack(
  tracks: readonly ResolvedEncounterMusicTrack[],
  encounterDurationSeconds: number,
  random: () => number = Math.random,
): IndexedEncounterMusicTrack | null {
  if (tracks.length === 0) {
    return null;
  }

  const indexedTracks = toIndexedTracks(tracks);
  const fittingTracks = indexedTracks.filter((track) => trackFitsDuration(track, encounterDurationSeconds));
  if (fittingTracks.length > 0) {
    return fittingTracks[clampCandidateIndex(fittingTracks.length, random())] ?? fittingTracks[0] ?? null;
  }

  const shortestKnownTrack = findShortestKnownTrack(indexedTracks);
  if (shortestKnownTrack !== null) {
    return shortestKnownTrack;
  }

  return indexedTracks[clampCandidateIndex(indexedTracks.length, random())] ?? null;
}

/**
 * Chooses a random follow-up track that still fits the remaining encounter time.
 */
export function pickNextEncounterMusicTrack(
  tracks: readonly ResolvedEncounterMusicTrack[],
  currentTrackIndex: number,
  remainingDurationSeconds: number,
  random: () => number = Math.random,
): IndexedEncounterMusicTrack | null {
  if (tracks.length === 0 || remainingDurationSeconds <= 0) {
    return null;
  }

  const indexedTracks = toIndexedTracks(tracks);
  const alternativeTracks = indexedTracks.filter(
    (track) => track.index !== currentTrackIndex && trackFitsDuration(track, remainingDurationSeconds),
  );
  if (alternativeTracks.length > 0) {
    return alternativeTracks[clampCandidateIndex(alternativeTracks.length, random())] ?? alternativeTracks[0] ?? null;
  }

  const currentTrack = indexedTracks[currentTrackIndex];
  if (currentTrack && trackFitsDuration(currentTrack, remainingDurationSeconds)) {
    return currentTrack;
  }

  return null;
}

function resolveTrackDuration(
  src: string,
  createAudio: () => HTMLAudioElement,
): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = createAudio();
    let settled = false;

    const finish = (duration: number | null): void => {
      if (settled) {
        return;
      }

      settled = true;
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      resolve(duration);
    };

    const handleLoadedMetadata = (): void => {
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    };

    const handleError = (): void => {
      finish(null);
    };

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    audio.src = src;
    audio.load();
  });
}

/**
 * Loads playlist durations once so playback decisions can account for encounter length.
 */
export function loadEncounterMusicCatalog(
  createAudio: () => HTMLAudioElement = createBrowserAudio,
): Promise<ResolvedEncounterMusicTrack[]> {
  if (createAudio === createBrowserAudio && cachedCatalogPromise !== null) {
    return cachedCatalogPromise;
  }

  const catalogPromise = Promise.all(
    ENCOUNTER_MUSIC_TRACKS.map(async (track) => ({
      ...track,
      durationSeconds: await resolveTrackDuration(track.src, createAudio),
    })),
  );

  if (createAudio === createBrowserAudio) {
    cachedCatalogPromise = catalogPromise;
  }

  return catalogPromise;
}
