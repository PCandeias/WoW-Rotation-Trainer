import { SpellData } from '../dbc/spell_data';

const SHARED_PLAYER_EFFECT_DBC: Record<number, SpellData> = {
  // Skyfury (462854): external raid buff auto-attack repeat driver.
  // Source: SimC SpellDataDump/shaman.txt (proc chance 20%, internal cooldown 0.1s).
  462854: new SpellData(462854, 'Skyfury',
    [
      { _id: 1173055, _subtype: 318, _value: 2, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1286687, _subtype: 0, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0, 1500,
    { _proc_chance_pct: 20, _internal_cooldown_ms: 100, _duration_ms: 3_600_000 }),
};

/**
 * Returns shared player-effect spell data keyed outside any single class/spec DBC module.
 */
export function requireSharedPlayerEffectSpellData(spellId: number): SpellData {
  const spell = SHARED_PLAYER_EFFECT_DBC[spellId];
  if (!spell) {
    throw new Error(`Missing shared player effect spell data for spellId=${spellId}`);
  }
  return spell;
}
