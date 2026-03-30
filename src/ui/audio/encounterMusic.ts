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
const ENCOUNTER_MUSIC_TITLE_OVERRIDES: Readonly<Record<string, string>> = {
  The_Sovereign_s_Last_Sprint: "The Sovereign's Last Sprint",
};

const encounterMusicAssetModules = import.meta.glob<string>('../../../assets/*.mp3', {
  eager: true,
  import: 'default',
});

function toTrackId(basename: string): string {
  return basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toTrackTitle(basename: string): string {
  return basename
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function createEncounterMusicTrack(assetPath: string, src: string): EncounterMusicTrack {
  const basename = assetPath.slice(assetPath.lastIndexOf('/') + 1, assetPath.lastIndexOf('.'));
  const title = ENCOUNTER_MUSIC_TITLE_OVERRIDES[basename] ?? toTrackTitle(basename);

  return {
    id: toTrackId(title),
    title,
    src,
  };
}

/**
 * The encounter playlist used for competitive modes.
 */
export const ENCOUNTER_MUSIC_TRACKS: readonly EncounterMusicTrack[] = Object.freeze(
  Object.entries(encounterMusicAssetModules)
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([assetPath, src]) => createEncounterMusicTrack(assetPath, src)),
);

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

  return indexedTracks[clampCandidateIndex(indexedTracks.length, random())] ?? null;
}

/**
 * Chooses a random follow-up track, preferring songs that still fit the remaining encounter time.
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

  const alternativeTracksIgnoringDuration = indexedTracks.filter((track) => track.index !== currentTrackIndex);
  if (alternativeTracksIgnoringDuration.length > 0) {
    return (
      alternativeTracksIgnoringDuration[clampCandidateIndex(alternativeTracksIgnoringDuration.length, random())] ??
      alternativeTracksIgnoringDuration[0] ??
      null
    );
  }

  return indexedTracks[currentTrackIndex] ?? null;
}

/**
 * Chooses a different track for an explicit user skip, ignoring encounter duration limits.
 */
export function pickSkippedEncounterMusicTrack(
  tracks: readonly ResolvedEncounterMusicTrack[],
  currentTrackIndex: number,
  random: () => number = Math.random,
): IndexedEncounterMusicTrack | null {
  if (tracks.length === 0) {
    return null;
  }

  const indexedTracks = toIndexedTracks(tracks);
  const alternativeTracks = indexedTracks.filter((track) => track.index !== currentTrackIndex);
  if (alternativeTracks.length > 0) {
    return alternativeTracks[clampCandidateIndex(alternativeTracks.length, random())] ?? alternativeTracks[0] ?? null;
  }

  return indexedTracks[currentTrackIndex] ?? indexedTracks[0] ?? null;
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
