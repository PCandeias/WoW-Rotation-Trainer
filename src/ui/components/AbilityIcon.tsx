import React, { useState, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { FONTS } from '@ui/theme/elvui';
import { getLocalWowIconPath } from '@ui/assets/wowIcons';

/**
 * Props for the AbilityIcon component.
 *
 * Renders a WoW ability icon loaded from CDN sources with emoji fallback.
 */
export interface AbilityIconProps {
  /** SimC icon name, e.g. "ability_monk_tigerpalm" */
  iconName?: string;
  /** Emoji fallback (e.g. "🐯"), shown when all CDN sources fail or iconName is empty */
  emoji?: string;
  /** Size in px (width and height). Default: 48 */
  size?: number;
  /** Additional style overrides */
  style?: CSSProperties;
  /** Alt text. Defaults to iconName */
  alt?: string;
}

/** Remote CDN sources to try after any bundled local asset. */
const ICON_SOURCES: ((name: string) => string)[] = [
  (name): string => `https://render.worldofwarcraft.com/us/icons/56/${name}.jpg`,
  (name): string => `https://wow.zamimg.com/images/wow/icons/large/${name}.jpg`,
  (name): string => `https://wow.zamimg.com/images/wow/icons/medium/${name}.jpg`,
  (name): string => `https://cdn.wowhead.com/images/wow/icons/large/${name}.jpg`,
];

const SAFE_ICON_NAME_PATTERN = /^[a-z0-9_]+$/;

function normalizeIconName(iconName?: string | null): string | null {
  if (!iconName) {
    return null;
  }

  const trimmed = iconName.trim();
  if (trimmed.length === 0 || !SAFE_ICON_NAME_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function buildIconSources(iconName?: string | null): string[] {
  const normalizedIconName = normalizeIconName(iconName);
  if (!normalizedIconName) {
    return [];
  }

  const localPath = getLocalWowIconPath(normalizedIconName);
  return localPath
    ? [localPath, ...ICON_SOURCES.map((source) => source(normalizedIconName))]
    : ICON_SOURCES.map((source) => source(normalizedIconName));
}

/**
 * Module-level cache: stores the best known source index per iconName.
 * Updated on successful load (to keep using the good source) and on error
 * (to skip known-bad sources on next mount).
 */
const sourceCache = new Map<string, number>();

/** Clears the source cache — useful for testing. */
export function clearIconSourceCache(): void {
  sourceCache.clear();
}

/**
 * AbilityIcon — loads a real WoW ability icon from CDN with emoji fallback.
 *
 * Tries each CDN source in sequence on `onError`. After all 4 sources fail,
 * renders the emoji fallback (or "?" if no emoji is provided).
 * Caches the current source index per iconName (module-level) so that failed
 * sources are skipped on subsequent mounts of the same icon.
 */
const AbilityIcon = React.memo(function AbilityIcon({
  iconName,
  emoji = '?',
  size = 48,
  style,
  alt,
}: AbilityIconProps): React.ReactElement {
  const normalizedIconName = normalizeIconName(iconName);
  const iconSources = buildIconSources(normalizedIconName);
  // prevIconName ref lets us detect iconName changes between renders
  const prevIconNameRef = useRef<string | null>(normalizedIconName);

  const [sourceIdx, setSourceIdx] = useState<number>(() => {
    if (!normalizedIconName) return iconSources.length;
    return sourceCache.get(normalizedIconName) ?? 0;
  });

  // Detect iconName changes and reset sourceIdx accordingly (derived state via ref)
  let currentSourceIdx = sourceIdx;
  if (prevIconNameRef.current !== normalizedIconName) {
    prevIconNameRef.current = normalizedIconName;
    const newIdx = !normalizedIconName
      ? iconSources.length
      : sourceCache.get(normalizedIconName) ?? 0;
    if (newIdx !== sourceIdx) {
      setSourceIdx(newIdx);
    }
    currentSourceIdx = newIdx;
  }

  const showFallback = !normalizedIconName || currentSourceIdx >= iconSources.length;

  const handleError = useCallback(() => {
    setSourceIdx((prev) => {
      const next = prev + 1;
      // Persist the advanced index so remounted instances skip the bad source
      if (normalizedIconName) {
        sourceCache.set(normalizedIconName, next);
      }
      return next;
    });
  }, [normalizedIconName]);

  const handleLoad = useCallback(() => {
    // Cache the successful source index
    if (normalizedIconName) {
      sourceCache.set(normalizedIconName, currentSourceIdx);
    }
  }, [normalizedIconName, currentSourceIdx]);

  if (showFallback) {
    const fallbackStyle: CSSProperties = {
      width: `${size}px`,
      height: `${size}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${size * 0.55}px`,
      fontFamily: FONTS.ui,
      userSelect: 'none',
      ...style,
    };
    return (
      <div style={fallbackStyle}>
        <span>{emoji}</span>
      </div>
    );
  }

  const imgSrc = iconSources[currentSourceIdx];

  const imgStyle: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    objectFit: 'cover',
    display: 'block',
    borderRadius: '10px',
    ...style,
  };

  return (
    <img
      src={imgSrc}
      alt={alt ?? normalizedIconName}
      style={imgStyle}
      onError={handleError}
      onLoad={handleLoad}
      referrerPolicy="no-referrer"
    />
  );
});

export { AbilityIcon };
export default AbilityIcon;
