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
  getTargetMultiplier?(spell: SpellDef, state: IGameState, targetIndex?: number): number;
  getSpellCritChanceBonusPercent?(spell: SpellDef, state: IGameState): number;
  getCritDamageMultiplier?(spell: SpellDef, state: IGameState): number;
  /** Percentage of target armor to ignore (e.g. 12 = 12% armor pen). */
  getArmorPenPercent?(state: IGameState): number;
}

export interface IGameState {
  readonly currentTime: number;
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
  /** Returns current spell power after spec-owned bonuses and AP→SP bridges. */
  getSpellPower?(): number;
  /**
   * Returns effective attack power for WEAPON_MAINHAND spells
   * (SimC attack_power_type::WEAPON_MAINHAND).
   *
   * Optional for lightweight test stubs; callers fall back to getAttackPower().
   */
  getWeaponMainHandAttackPower?(): number;
  /**
   * Returns effective attack power for WEAPON_OFF_HAND spells.
   *
   * Mirrors SimC's off-hand weapon AP path: base AP plus the off-hand weapon AP
   * term. Returns 0 when no off-hand weapon is equipped.
   */
  getWeaponOffHandAttackPower?(): number;
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
  /** Returns the rating-derived haste percent before shared or spec hook multipliers. */
  getBaseHastePercent?(): number;
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
  getBuffRemains?(buffId: string): number;
  getBuffStacks(buffId: string): number;
  getOptionalNumericState?(stateId: string): number | undefined;
  getNumericState?(stateId: string): number;
  isTargetDebuffActive?(debuffId: string, targetId?: number): boolean;
  getTargetDebuffRemains?(debuffId: string, targetId?: number): number;
  getTargetDebuffStacks?(debuffId: string, targetId?: number): number;
  getTargetDebuffInstanceId?(debuffId: string, targetId?: number): number;
  isCooldownReady(spellId: string): boolean;
  getCooldownRemains(spellId: string): number;

  // Mutation methods (SimC: p()->applyBuff / gainChi / etc.)
  gainChi(amount: number): void;
  spendChi(amount: number): void;
  addDamage(amount: number, targetIndex?: number): void;
  applyBuff(id: string, duration: number, stacks?: number): void;
  applyTargetDebuff?(debuffId: string, duration: number, targetId?: number, stacks?: number): number;
  expireBuff(id: string): void;
  expireTargetDebuff?(debuffId: string, targetId?: number): void;
  removeBuffStack(id: string): void;
  setOptionalNumericState?(stateId: string, value: number | undefined): void;
  setNumericState?(stateId: string, value: number): void;
  adjustNumericState?(stateId: string, delta: number): number;
  settleEnergy(): void;
  recomputeEnergyRegenRate(): void;
  startCooldown(spellId: string, duration: number): void;
  adjustCooldown(spellId: string, delta: number): void;
  resetCooldown?(spellId: string): void;
  restoreCooldownCharge?(spellId: string): void;
  recordPendingSpellStat(
    spellId: string,
    damage: number,
    casts: number,
    isCrit?: boolean,
    outcome?: 'landed' | 'miss' | 'dodge' | 'parry',
    time?: number,
  ): void;

  // Writable fields
  mhSwingTimer: number;
  ohSwingTimer: number;
  lastComboStrikeAbility?: string | null;
}
