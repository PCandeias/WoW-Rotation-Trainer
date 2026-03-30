/**
 * monk_proc_spells.ts
 *
 * Central registry of module-scope SpellDef constants used by proc / follow-up
 * damage in the executor and channel system.  Keeping them here avoids scattering
 * inline literals across engine files.
 */

import type { SpellDef } from '../../data/spells/monk_windwalker';
import type { GameState } from '../../engine/gameState';
import type { RngInstance } from '../../engine/rng';
import { rollChance } from '../../engine/rng';
import { requireMonkSpellData } from '../../dbc/monk_spell_data';
import { getSharedTargetDebuffMultiplier } from '../../shared/player_effects';
import { getChiProficiencyMagicDamageMultiplier, getFerocityOfXuenMultiplier } from './monk_runtime';

// ---------------------------------------------------------------------------
// executor.ts procs
// ---------------------------------------------------------------------------

export const ZENITH_STOMP_SPELL: SpellDef = {
  id: 1272696,
  name: 'zenith_stomp',
  displayName: 'Zenith Stomp',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 10,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
  isPhysical: false,
};

export const GLORY_OF_THE_DAWN_RSK_SPELL: SpellDef = {
  id: 392959001,
  name: 'glory_of_the_dawn_rising_sun_kick_damage',
  displayName: 'Glory of the Dawn (RSK)',
  energyCost: 0,
  chiCost: 0,
  chiGain: 1,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 0.5,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
};

export const GLORY_OF_THE_DAWN_RWK_SPELL: SpellDef = {
  ...GLORY_OF_THE_DAWN_RSK_SPELL,
  id: 392959002,
  name: 'glory_of_the_dawn_rushing_wind_kick_damage',
  displayName: 'Glory of the Dawn (RWK)',
};

export const TEACHINGS_OF_THE_MONASTERY_SPELL: SpellDef = {
  id: 228649,
  name: 'teachings_of_the_monastery',
  displayName: 'Teachings of the Monastery',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 0.847,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
};

export const WHIRLING_DRAGON_PUNCH_AOE_SPELL: SpellDef = {
  id: 158221,
  name: 'whirling_dragon_punch_aoe',
  displayName: 'Whirling Dragon Punch (AoE)',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 2.415,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
};

export const WHIRLING_DRAGON_PUNCH_SINGLETARGET_SPELL: SpellDef = {
  id: 451767,
  name: 'whirling_dragon_punch_singletarget',
  displayName: 'Whirling Dragon Punch (Single Target)',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 4.5,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
};

export const COMBAT_WISDOM_EXPEL_HARM_SPELL: SpellDef = {
  id: 451968,
  name: 'expel_harm',
  displayName: 'Expel Harm',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 0,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
  isPhysical: false,
};

// ---------------------------------------------------------------------------
// Expel Harm – Combat Wisdom damage (SimC source of truth: sc_monk.cpp)
// ---------------------------------------------------------------------------
// Parent spell: Combat Wisdom Expel Harm (451968) — a monk_heal_t
// Child spell:  expel_harm_damage (115129) — attribute 93 (no crit),
//               attribute 221 (ignore caster damage modifiers)
//
// Full pipeline (SimC sc_monk.cpp L3683-3749, heal.cpp L83-89):
//   1. SP = round(0.96 × WEAPON_MAINHAND_AP)       [WW passive 1258122 eff#7]
//   2. heal_base = SP × sp_coeff(1.2)               [451968 eff#1]
//   3. heal_da_mul = base_dd_mul × Strength of Spirit
//        base_dd_mul = 4.732                         [137025 eff#9 (+355%) × 450426 eff#2 (+4%)]
//        Strength of Spirit (387276 eff#1): missing_health_func(1.0)
//          At full health → val=1.0, applied as da *= (1+val) = 2.0
//   4. heal_ply_mul = school_damage_multiplier(nature) = 1.0816
//        Chi Proficiency (1.04) × Ferocity of Xuen (1.04)
//   5. × (1 + versatility%)
//   6. Crit roll using SPELL crit (includes TEB via STAT_PCT_BUFF_CRIT)
//   7. heal_received = heal × 1.04                   [Grace of the Crane 388811]
//   8. damage_base = round(heal_received × 0.10)     [451968 eff#2]
//   9. × 1.4 Efficient Training                      [450989 eff#1: +20% × 2 from 1258122 #16]
//  10. × target debuffs (Nature school)

// WW passive (1258122 eff#7): spell_power = 0.96 × attack_power
const WW_SPELL_POWER_PER_AP = 0.96;
// 451968 effectN(1): SP coefficient for the heal
const EXPEL_HARM_SP_COEFF = 1.2;
// 451968 effectN(2): heal-to-damage conversion rate
const EXPEL_HARM_HEAL_CONVERSION = 0.10;
// base_dd_multiplier: 137025 eff#9 (+355%) × 450426 eff#2 (+4%)
const EXPEL_HARM_HEAL_BASE_DD_MUL = (1 + 3.55) * (1 + 0.04); // = 4.732
// Strength of Spirit (387276 eff#1) at full health: da *= (1 + 1.0) = 2.0
const STRENGTH_OF_SPIRIT_FULL_HEALTH_MUL = 2.0;
// Grace of the Crane (388811): +4% healing received
const GRACE_OF_CRANE_HEAL_RECEIVED_MUL = 1.04;
// Efficient Training (450989 eff#1): +20% base, doubled by WW passive (1258122 #16) = +40%
const EFFICIENT_TRAINING_SPELL = requireMonkSpellData(450989);
const EXPEL_HARM_EFFICIENT_TRAINING_MUL = 1 + EFFICIENT_TRAINING_SPELL.effectN(1).percent() * 2;

/**
 * Computes expel_harm_damage from the full SimC heal→damage pipeline.
 *
 * The parent heal uses SP (derived from AP), spec aura multipliers, Strength of
 * Spirit, versatility, and spell crit. The result is converted to damage via
 * effectN(2) and then scaled by Efficient Training and target debuffs.
 */
export function calculateCombatWisdomExpelHarmDamage(state: GameState, rng?: RngInstance): number {
  // Step 1-2: Spell Power → heal base
  const totalAP = state.getWeaponMainHandAttackPower();
  const sp = Math.round(WW_SPELL_POWER_PER_AP * totalAP);
  let heal = sp * EXPEL_HARM_SP_COEFF;

  // Step 3: heal da_mul = base_dd_mul × Strength of Spirit
  heal *= EXPEL_HARM_HEAL_BASE_DD_MUL;
  if (state.hasTalent('strength_of_spirit')) {
    heal *= STRENGTH_OF_SPIRIT_FULL_HEALTH_MUL;
  }

  // Step 4: school_damage_multiplier(nature) — Chi Proficiency × Ferocity of Xuen
  heal *= getChiProficiencyMagicDamageMultiplier(state);
  if (state.hasTalent('ferocity_of_xuen')) {
    heal *= 1 + getFerocityOfXuenMultiplier(state);
  }

  // Step 5: Versatility
  heal *= 1 + state.getVersatilityPercent() / 100;

  // Step 6: Spell crit (STAT_PCT_BUFF_CRIT includes TEB in both melee & spell)
  if (rng && rollChance(rng, state.getCritPercent())) {
    heal *= 2.0;
  }

  // Step 7: healing_received multiplier (Grace of the Crane)
  if (state.hasTalent('grace_of_the_crane')) {
    heal *= GRACE_OF_CRANE_HEAL_RECEIVED_MUL;
  }

  // Step 8: Convert heal result → child damage base (integer truncation in SimC)
  const damageBase = Math.round(heal * EXPEL_HARM_HEAL_CONVERSION);

  // Step 9: Efficient Training (child spell modifier — survives "ignore caster mods")
  let damage = damageBase;
  if (state.hasTalent('efficient_training')) {
    damage *= EXPEL_HARM_EFFICIENT_TRAINING_MUL;
  }

  // Step 10: Target debuffs (Nature school → chaos_brand, hunters_mark)
  damage *= getSharedTargetDebuffMultiplier(state, { isPhysical: false });

  return damage;
}

export const DUAL_THREAT_SPELL: SpellDef = {
  id: 451839,
  name: 'dual_threat',
  displayName: 'Dual Threat',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 3.726,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
};

/**
 * Thunderfist proc damage (393566): Nature school (isPhysical: false → no armor reduction).
 * AP coefficient 1.61 from SimC SpellDataDump/monk.txt, spell 393566.
 * Discharged one stack per successful melee hit when Thunderfist buff has stacks.
 */
export const THUNDERFIST_SPELL: SpellDef = {
  id: 393566,
  name: 'thunderfist',
  displayName: 'Thunderfist',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 1.61,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
  isPhysical: false,
};

// ---------------------------------------------------------------------------
// channel.ts procs
// ---------------------------------------------------------------------------

export const FLURRY_STRIKE_SPELL: SpellDef = {
  id: 450617,
  name: 'flurry_strike',
  displayName: 'Flurry Strike',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 0.6,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
};

export const SHADO_OVER_THE_BATTLEFIELD_SPELL: SpellDef = {
  id: 451250,
  name: 'flurry_strike_shado_over_the_battlefield',
  displayName: 'Flurry Strike (Shado Over the Battlefield)',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 0.52,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
  isPhysical: false,
};

export const STAND_READY_FLURRY_STRIKE_SPELL: SpellDef = {
  ...FLURRY_STRIKE_SPELL,
  id: 999997,
  name: 'flurry_strike_stand_ready',
  displayName: 'Flurry Strike (Stand Ready)',
};

export const WISDOM_OF_THE_WALL_FLURRY_STRIKE_SPELL: SpellDef = {
  ...FLURRY_STRIKE_SPELL,
  id: 999996,
  name: 'flurry_strike_wisdom_of_the_wall',
  displayName: 'Flurry Strike (Wisdom of the Wall)',
};

/**
 * Chi Explosion — triggered by Jade Ignition talent on every SCK cast.
 * DBC: spell 393056, Nature school, AP coefficient 1.8, AoE (8yd radius).
 * SimC: jade_ignition->effectN(1).trigger() → chi_explosion spell.
 */
export const CHI_EXPLOSION_SPELL: SpellDef = {
  id: 393056,
  name: 'chi_explosion',
  displayName: 'Chi Explosion',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 1.8,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
  isPhysical: false,
};

export const JADEFIRE_STOMP_SPELL: SpellDef = {
  id: 1248815,
  name: 'jadefire_stomp',
  displayName: 'Jadefire Stomp',
  energyCost: 0,
  chiCost: 0,
  chiGain: 0,
  cooldown: 0,
  hasteScalesCooldown: false,
  isChanneled: false,
  channelDuration: 0,
  channelTicks: 0,
  isOnGcd: false,
  apCoefficient: 1,
  baseDmgMin: 0,
  baseDmgMax: 0,
  requiresComboStrike: false,
  isWdp: false,
  isZenith: false,
  isExecute: false,
  executeHpDamage: 0,
  isPhysical: false,
};
