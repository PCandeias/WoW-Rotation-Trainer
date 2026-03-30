/**
 * Damage Calculator.
 *
 * The engine owns the generic damage pipeline:
 *   direct_amount = (baseDmg + apCoefficient × attackPower)
 *     × actionMultiplier × playerMultiplier × masteryMultiplier
 *     × hitComboMultiplier × versatilityMultiplier × targetMultiplier
 *   if crit: × critDamageMultiplier
 *
 * Spec- and spell-specific modifiers are provided through `damageHooks`.
 */

import type { SpellDef } from '../data/spells';
import { getSharedPlayerDamageMultiplier } from '../shared/player_effects';
import type { IGameState } from './i_game_state';
import { computePhysicalArmorMultiplier } from './armor';
import { rollChance, rollRange } from './rng';
import type { RngInstance } from './rng';

// ---------------------------------------------------------------------------
// DamageSnapshot
// ---------------------------------------------------------------------------

/**
 * Captures all multipliers and base values at cast-start for channeled spells.
 * Ticks use the snapshot instead of reading current state.
 */
export interface DamageSnapshot {
  /** Ability-specific multiplier (talent bonuses etc.) */
  actionMultiplier: number;
  /** Global player damage modifier (potions, racials) */
  playerMultiplier: number;
  /** Mastery (Combo Strikes) multiplier */
  masteryMultiplier: number;
  /** Hit Combo stacks multiplier */
  hitComboMultiplier: number;
  /** Versatility damage multiplier */
  versatilityMultiplier: number;
  /** Target debuff multiplier */
  targetMultiplier: number;
  /** Attack power coefficient for this spell */
  apCoefficient: number;
  /** Attack power at snapshot time */
  attackPower: number;
  /** Minimum base damage at snapshot time */
  baseDmgMin: number;
  /** Maximum base damage at snapshot time */
  baseDmgMax: number;
  /** Crit chance (%) at snapshot time — channel ticks roll at cast-time crit rate */
  critChance: number;
  /** Simulation time when snapshot was captured */
  snapshotTime: number;
}

// ---------------------------------------------------------------------------
// DamageResult
// ---------------------------------------------------------------------------

export interface DamageResult {
  /** Pre-multiplier, pre-crit damage (baseDmg + AP scaling) */
  baseDamage: number;
  /** Final damage after all multipliers and crit */
  finalDamage: number;
  /** Whether this hit was a critical strike */
  isCrit: boolean;
  /** Individual multiplier breakdown */
  multipliers: {
    action: number;
    player: number;
    mastery: number;
    hitCombo: number;
    versatility: number;
    target: number;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers — multiplier calculations
// ---------------------------------------------------------------------------

function computeActionMultiplier(spell: SpellDef, state: IGameState): number {
  return state.damageHooks?.getActionMultiplier?.(spell, state) ?? 1.0;
}

/**
 * Compute the global player damage multiplier.
 * Blood Fury (Orc racial): ×1.2 AP buff approximated as direct damage mult
 *
 * Note: Berserking (Troll racial) is haste-only — no damage multiplier.
 * Its haste contribution is already handled in GameState.getHastePercent().
 */
function computePlayerMultiplier(state: IGameState): number {
  return getSharedPlayerDamageMultiplier(state);
}

function computeMasteryMultiplier(state: IGameState, isComboStrike: boolean): number {
  return state.damageHooks?.getMasteryMultiplier?.(state, isComboStrike) ?? 1.0;
}

function computeHitComboMultiplier(state: IGameState): number {
  return state.damageHooks?.getHitComboMultiplier?.(state) ?? 1.0;
}

function computeVersatilityMultiplier(state: IGameState): number {
  return 1 + state.getVersatilityPercent() / 100;
}

function computeTargetMultiplier(spell: SpellDef, state: IGameState): number {
  const hookTargetMult = state.damageHooks?.getTargetMultiplier?.(spell, state) ?? 1.0;

  // Physical damage reduction from boss armor.
  // Nature/magic spells set isPhysical: false to bypass armor entirely.
  const applyArmor = spell.isPhysical !== false;
  const armorPen = state.damageHooks?.getArmorPenPercent?.(state) ?? 0;
  const armorFactor = applyArmor
    ? computePhysicalArmorMultiplier(state, armorPen)
    : 1.0;

  return hookTargetMult * armorFactor;
}

function computeSpellCritChance(_spell: SpellDef, state: IGameState): number {
  let critChance = state.getCritPercent();
  critChance += state.damageHooks?.getSpellCritChanceBonusPercent?.(_spell, state) ?? 0;
  return Math.min(100, critChance);
}

function computeCritDamageMultiplier(spell: SpellDef, state: IGameState): number {
  return state.damageHooks?.getCritDamageMultiplier?.(spell, state) ?? 2.0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture a damage snapshot at cast-start for channeled spells.
 * The snapshot freezes all multipliers so ticks use cast-time values.
 */
export function captureSnapshot(
  spell: SpellDef,
  state: IGameState,
  isComboStrike: boolean
): DamageSnapshot {
  return {
    actionMultiplier: computeActionMultiplier(spell, state),
    playerMultiplier: computePlayerMultiplier(state),
    masteryMultiplier: computeMasteryMultiplier(state, isComboStrike),
    hitComboMultiplier: computeHitComboMultiplier(state),
    versatilityMultiplier: computeVersatilityMultiplier(state),
    targetMultiplier: computeTargetMultiplier(spell, state),
    apCoefficient: spell.apCoefficient,
    attackPower: state.getWeaponMainHandAttackPower?.() ?? state.getAttackPower(),
    baseDmgMin: spell.baseDmgMin,
    baseDmgMax: spell.baseDmgMax,
    critChance: computeSpellCritChance(spell, state),
    snapshotTime: state.currentTime,
  };
}

/**
 * Calculate damage for a spell cast.
 *
 * If a `snapshot` is provided (channeled tick), its multipliers and base values
 * are used instead of reading from current state.
 *
 * Zero-damage spells (execute utility, zero AP coefficient and zero base damage)
 * return baseDamage=0 and finalDamage=0 immediately.
 */
export function calculateDamage(
  spell: SpellDef,
  state: IGameState,
  rng: RngInstance,
  isComboStrike: boolean,
  snapshot?: DamageSnapshot
): DamageResult {
  // Execute spells (Touch of Death) — damage is based on target HP, handled externally
  // Zero-coefficient utility spells return zero immediately
  if (spell.isExecute || (spell.apCoefficient === 0 && spell.baseDmgMin === 0 && spell.baseDmgMax === 0)) {
    return {
      baseDamage: 0,
      finalDamage: 0,
      isCrit: false,
      multipliers: {
        action: 1.0,
        player: 1.0,
        mastery: 1.0,
        hitCombo: 1.0,
        versatility: 1.0,
        target: 1.0,
      },
    };
  }

  // Resolve multipliers — use snapshot values if provided
  const actionMult = snapshot?.actionMultiplier ?? computeActionMultiplier(spell, state);
  const playerMult = snapshot?.playerMultiplier ?? computePlayerMultiplier(state);
  const masteryMult = snapshot?.masteryMultiplier ?? computeMasteryMultiplier(state, isComboStrike);
  const hitComboMult = snapshot?.hitComboMultiplier ?? computeHitComboMultiplier(state);
  const versMult = snapshot?.versatilityMultiplier ?? computeVersatilityMultiplier(state);
  const targetMult = snapshot?.targetMultiplier ?? computeTargetMultiplier(spell, state);

  // Resolve base values — use snapshot if provided
  const apCoeff = snapshot?.apCoefficient ?? spell.apCoefficient;
  const ap = snapshot?.attackPower ?? (state.getWeaponMainHandAttackPower?.() ?? state.getAttackPower());
  const dmgMin = snapshot?.baseDmgMin ?? spell.baseDmgMin;
  const dmgMax = snapshot?.baseDmgMax ?? spell.baseDmgMax;

  // Roll base damage
  const baseDmg = dmgMin === dmgMax
    ? dmgMin
    : rollRange(rng, dmgMin, dmgMax);

  // Base damage = rolled base + AP scaling
  const baseDamage = baseDmg + apCoeff * ap;

  // Apply multipliers
  const combined = actionMult * playerMult * masteryMult * hitComboMult * versMult * targetMult;
  let finalDamage = baseDamage * combined;

  // Crit roll — use snapshotted crit chance for channel ticks
  const critChance = snapshot?.critChance ?? computeSpellCritChance(spell, state);
  const isCrit = rollChance(rng, critChance);
  if (isCrit) {
    finalDamage *= computeCritDamageMultiplier(spell, state);
  }

  return {
    baseDamage,
    finalDamage,
    isCrit,
    multipliers: {
      action: actionMult,
      player: playerMult,
      mastery: masteryMult,
      hitCombo: hitComboMult,
      versatility: versMult,
      target: targetMult,
    },
  };
}
