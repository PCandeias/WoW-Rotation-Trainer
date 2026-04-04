/**
 * Shared buff filtering and enrichment utilities.
 *
 * Both BuffTracker and BuffBarTracker need to:
 *  1. Find active buffs from game state.
 *  2. Apply a whitelist or blacklist.
 *  3. Enrich each entry with display metadata from the registry and resolver.
 *  4. Optionally reorder the result to match the whitelist order.
 *
 * This module centralises that logic so each component only handles its own
 * rendering concerns.
 */

import type { GameStateSnapshot } from '@core/engine/gameState';
import type { BuffState } from '@core/engine/gameState';
import type { BuffRegistry } from './BuffTracker';

export interface EnrichedBuff {
  buffId: string;
  buffState: BuffState;
  iconName: string | undefined;
  emoji: string;
  displayName: string;
  hideTimer: boolean;
}

export interface PrepareBuffEntriesOptions {
  registry?: BuffRegistry;
  iconNameResolver?: (buffId: string, gameState: GameStateSnapshot, fallback?: string) => string | undefined;
  whitelist?: string[];
  blacklist?: string[];
}

/** Returns only buffs that are currently active (permanent or not yet expired). */
export function filterActiveBuffs(
  gameState: GameStateSnapshot,
  currentTime: number,
): [string, BuffState][] {
  return Array.from(gameState.buffs.entries()).filter(
    ([, state]) => state.expiresAt === 0 || state.expiresAt > currentTime,
  );
}

/**
 * Applies whitelist or blacklist filtering.
 * A non-empty whitelist takes precedence over the blacklist.
 */
export function applyWhitelistBlacklist(
  pairs: [string, BuffState][],
  whitelist?: string[],
  blacklist?: string[],
): [string, BuffState][] {
  const useWhitelist = Array.isArray(whitelist) && whitelist.length > 0;
  return pairs.filter(([buffId]) => {
    if (useWhitelist && whitelist) return whitelist.includes(buffId);
    if (blacklist && blacklist.length > 0) return !blacklist.includes(buffId);
    return true;
  });
}

/** Adds display metadata (icon, emoji, displayName, hideTimer) to each buff pair. */
export function enrichBuffEntries(
  pairs: [string, BuffState][],
  gameState: GameStateSnapshot,
  registry?: BuffRegistry,
  iconNameResolver?: (buffId: string, gameState: GameStateSnapshot, fallback?: string) => string | undefined,
): EnrichedBuff[] {
  return pairs.map(([buffId, buffState]) => {
    const def = registry?.[buffId];
    return {
      buffId,
      buffState,
      iconName: iconNameResolver?.(buffId, gameState, def?.iconName) ?? def?.iconName,
      emoji: def?.emoji ?? '?',
      displayName: def?.displayName ?? buffId,
      hideTimer: def?.hideTimer === true,
    };
  });
}

/**
 * When a whitelist is active, reorders enriched entries to match the
 * whitelist order so the display is stable and predictable.
 */
export function orderByWhitelist(enriched: EnrichedBuff[], whitelist?: string[]): EnrichedBuff[] {
  if (!Array.isArray(whitelist) || whitelist.length === 0) return enriched;
  return whitelist.flatMap((buffId) => enriched.find((entry) => entry.buffId === buffId) ?? []);
}

/**
 * Full pipeline: filter → whitelist/blacklist → enrich → order.
 *
 * Use this in place of the four manual steps inside each tracker component.
 */
export function prepareBuffEntries(
  gameState: GameStateSnapshot,
  currentTime: number,
  { registry, iconNameResolver, whitelist, blacklist }: PrepareBuffEntriesOptions,
): EnrichedBuff[] {
  const active = filterActiveBuffs(gameState, currentTime);
  const filtered = applyWhitelistBlacklist(active, whitelist, blacklist);
  const enriched = enrichBuffEntries(filtered, gameState, registry, iconNameResolver);
  return orderByWhitelist(enriched, whitelist);
}
