export const TRACKED_BUFF_SPELL_IDS: Record<string, number> = {
  zenith: 1249625,
  hit_combo: 196741,
  rushing_wind_kick: 467307,
  momentum_boost: 451298,
  maelstrom_weapon: 344179,
  stormsurge: 201846,
  stormblast: 470466,
  hot_hand: 215785,
  raging_maelstrom: 384143,
  voltaic_blaze: 470057,
  surging_elements: 382043,
  forceful_winds: 262652,
  lightning_shield: 192106,
  crash_lightning: 187878,
  doom_winds: 384352,
  ascendance: 114051,
  surging_totem: 1221347,
  storm_unleashed: 1262830,
  tempest: 454015,
  primordial_storm: 1218090,
  feral_spirit: 51533,
  amplification_core: 456369,
  whirling_air: 453409,
  whirling_fire: 453405,
  whirling_earth: 453406,
  totemic_rebound: 458269,
  winning_streak: 1218616,
  electrostatic_wager: 1223332,
  blood_fury: 33697,
  algethar_puzzle: 383781,
};

export const TARGET_DEBUFF_SPELL_IDS: Record<string, number> = {
  mystic_touch: 113746,
  chaos_brand: 1490,
  hunters_mark: 257284,
  flame_shock: 470411,
  lashing_flames: 334168,
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
