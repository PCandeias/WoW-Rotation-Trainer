// src/core/engine/i_game_state.ts
/**
 * IGameState — minimal read interface for Action classes.
 *
 * Exists to break the circular dependency:
 *   action.ts → IGameState ← gameState.ts → Map<string, Action>
 *
 * GameState implements this interface. Actions depend only on IGameState.
 */

import type { SpellDef } from '../data/spells';

export interface IGameStateDamageHooks {
  getActionMultiplier?(spell: SpellDef, state: IGameState): number;
  getMasteryMultiplier?(state: IGameState, isComboStrike: boolean): number;
  getHitComboMultiplier?(state: IGameState): number;
  getTargetMultiplier?(spell: SpellDef, state: IGameState): number;
  getSpellCritChanceBonusPercent?(spell: SpellDef, state: IGameState): number;
  getCritDamageMultiplier?(spell: SpellDef, state: IGameState): number;
  /** Percentage of target armor to ignore (e.g. 12 = 12% armor pen). */
  getArmorPenPercent?(state: IGameState): number;
}

export interface IGameState {
  readonly currentTime: number;
  readonly hitComboStacks: number;
  readonly assumeMysticTouch: boolean;
  /** Number of active enemies in the encounter (default 1). */
  readonly activeEnemies: number;
  /** Physical damage reduction from target armor. 0 = no reduction. */
  readonly targetArmor: number;
  /** Player character level (default 90). Used to compute level-delta avoidance vs target. */
  readonly characterLevel: number;
  /** Target level (default 93 = player + 3, standard raid boss). */
  readonly targetLevel: number;
  /** Player hit percent — reduces auto-attack miss chance. Default 7.5 (SimC player base hit). */
  readonly hitPercent: number;
  /** Player expertise percent — reduces auto-attack dodge/parry. Default 7.5 (SimC player base expertise). */
  readonly expertisePercent: number;
  readonly damageHooks?: IGameStateDamageHooks;

  /** Returns current crit % (including potion/buff bonuses). */
  getCritPercent(): number;
  /** Returns current mastery % (including algethar_puzzle bonus). */
  getMasteryPercent(): number;
  /** Returns current versatility % (including penalties). */
  getVersatilityPercent(): number;
  /** Returns current attack power. */
  getAttackPower(): number;
  /**
   * Returns effective attack power for WEAPON_MAINHAND spells
   * (SimC attack_power_type::WEAPON_MAINHAND).
   *
   * Optional for lightweight test stubs; callers fall back to getAttackPower().
   */
  getWeaponMainHandAttackPower?(): number;
  /**
   * Returns effective attack power for WEAPON_BOTH spells (SimC attack_power_type::WEAPON_BOTH).
   *
   * For dual-wield: base_ap + floor((MH_dps + OH_dps/2) * 2/3 * 6)
   * For equal-DPS weapons this equals WEAPON_MAINHAND.
   * For 2H (no OH): identical to WEAPON_MAINHAND; SimC switches WEAPON_BOTH to WEAPON_MAINHAND
   * for 2H in monk_action_t::init_finished().
   *
   * Optional: if not implemented (e.g. in test stubs), callers fall back to getAttackPower().
   */
  getWeaponBothAttackPower?(): number;
  /** Returns current max health after passive raid buffs. */
  getMaxHealth(): number;
  /** Returns current target health (0 when target health is not tracked). */
  getTargetCurrentHealth?(): number;
  /** Returns configured target max health (0 when target health is not tracked). */
  getTargetMaxHealth?(): number;
  /**
   * Target health as a percentage (0–100). Defaults to 100 when health tracking
   * is disabled or target max health is unknown.
   */
  readonly targetHealthPct: number;

  isBuffActive(buffId: string): boolean;

  // Query methods
  hasTalent(name: string): boolean;
  /** Returns the selected rank of a talent (0 if not selected). */
  getTalentRank(name: string): number;
  getHastePercent(): number;
  /** Auto-attack swing timer haste after auto-attack-specific bonuses such as Martial Agility. */
  getAutoAttackHastePercent(): number;
  /** Additional multiplicative auto-attack speed scaling for true speed effects such as Momentum Boost. */
  getAutoAttackSpeedMultiplier(): number;
  getBuffStacks(buffId: string): number;
  isCooldownReady(spellId: string): boolean;
  getCooldownRemains(spellId: string): number;

  // Mutation methods (SimC: p()->applyBuff / gainChi / etc.)
  gainChi(amount: number): void;
  spendChi(amount: number): void;
  addDamage(amount: number, targetIndex?: number): void;
  applyBuff(id: string, duration: number, stacks?: number): void;
  expireBuff(id: string): void;
  removeBuffStack(id: string): void;
  settleEnergy(): void;
  recomputeEnergyRegenRate(): void;
  startCooldown(spellId: string, duration: number): void;
  adjustCooldown(spellId: string, delta: number): void;
  recordPendingSpellStat(
    spellId: string,
    damage: number,
    casts: number,
    isCrit?: boolean,
    outcome?: 'landed' | 'miss' | 'dodge' | 'parry',
    time?: number,
  ): void;

  // Writable fields
  nextCombatWisdomAt: number;
  flurryCharges: number;
  mhSwingTimer: number;
  ohSwingTimer: number;
  lastComboStrikeAbility?: string | null;
}
