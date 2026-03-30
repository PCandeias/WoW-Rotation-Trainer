export const TRACKED_BUFF_SPELL_IDS: Record<string, number> = {
  zenith: 1249625,
  hit_combo: 196741,
  rushing_wind_kick: 467307,
  momentum_boost: 451298,
};

export const TARGET_DEBUFF_SPELL_IDS: Record<string, number> = {
  mystic_touch: 113746,
  chaos_brand: 1490,
  hunters_mark: 257284,
};

/** Resolves tracker aura ids from a numeric spell-id blacklist. */
export function buildTrackerBlacklist(
  spellIdsByAuraId: Readonly<Record<string, number>>,
  blacklistSpellIds: readonly number[],
): string[] {
  if (blacklistSpellIds.length === 0) {
    return [];
  }

  const blacklistSet = new Set(blacklistSpellIds);
  return Object.entries(spellIdsByAuraId)
    .filter(([, spellId]) => blacklistSet.has(spellId))
    .map(([auraId]) => auraId);
}
