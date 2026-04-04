// src/core/engine/action.ts
import type { IGameState } from './i_game_state';
import type { SimEventQueue, DamageSnapshot } from './eventQueue';
import type { RngInstance } from './rng';
import type { SpellData } from '../dbc/spell_data';
import type { SimEvent } from './eventQueue';
import type { SpellDef } from '../data/spells';
import { computePhysicalArmorMultiplier } from './armor';
import { getSharedPlayerDamageMultiplier } from '../shared/player_effects';
import { rollRange, rollChance } from './rng';

export interface ActionResult {
  /** Raw damage after all multipliers and crit. 0 for non-damaging actions. */
  damage: number;
  isCrit: boolean;
  newEvents: SimEvent[];
  buffsApplied: { id: string; duration: number; stacks?: number }[];
  /**
   * Positive seconds to reduce from each named cooldown.
   * e.g. `{ spellId: 'rising_sun_kick', delta: 1 }` reduces RSK CD by 1s.
   * Applied via `state.adjustCooldown(spellId, delta)` in applyActionResult.
   * NOTE: `GameState.adjustCooldown` guards `if (deltaSeconds <= 0) return` —
   * passing a negative delta silently does nothing. Always use positive values here.
   */
  cooldownAdjustments: { spellId: string; delta: number }[];
}

export type ActionCastFailReason = 'talent_missing' | 'wdp_constraint' | 'execute_not_ready' | 'not_available' | 'on_cooldown';
export type ActionCastContext = Readonly<Record<string, boolean | number | string>>;

export abstract class Action {
  abstract readonly name: string;
  abstract readonly spellData: SpellData;

  constructor(protected readonly p: IGameState) { }

  // ---------------------------------------------------------------------------
  // AOE fields — mirror SimC's action_t AOE configuration
  // ---------------------------------------------------------------------------

  /**
   * Number of targets this action hits.
   * -1 = all targets, 0 = single target (default), N = exactly N targets.
   * Mirrors SimC's action_t::aoe.
   */
  readonly aoe: number = 0;

  /**
   * Target count at which sqrt-based damage reduction kicks in.
   * 0 = no reduction. Mirrors SimC's action_t::reduced_aoe_targets.
   */
  readonly reducedAoeTargets: number = 0;

  /**
   * Number of targets receiving full damage before sqrt reduction applies.
   * Default 1 (only primary target gets full damage).
   * Mirrors SimC's action_t::full_amount_targets.
   */
  readonly fullAmountTargets: number = 1;

  /**
   * Whether to split total damage equally among all targets hit.
   * Mirrors SimC's action_t::split_aoe_damage.
   */
  readonly splitAoeDamage: boolean = false;

  /**
   * Static damage multiplier applied to secondary targets (chain_target > 0).
   * Mirrors SimC's action_t::base_aoe_multiplier.
   */
  readonly baseAoeMultiplier: number = 1.0;

  // ---------------------------------------------------------------------------
  // Virtual method chain (override in subclasses, call super())
  // ---------------------------------------------------------------------------

  /** Ability-specific damage multiplier (WW base 0.9, spell bonus, talent bonuses). */
  composite_da_multiplier(): number { return 1.0; }

  /**
   * Player damage multiplier. Base implementation covers versatility only
   * (a generic player stat). Spec-specific modifiers (mastery, hit_combo) are
   * added by subclasses that call `super.composite_player_multiplier(isComboStrike)`.
   */
  composite_player_multiplier(isComboStrike: boolean): number {
    void isComboStrike; // base does not use isComboStrike; subclasses may
    return 1 + this.p.getVersatilityPercent() / 100;
  }

  composite_target_multiplier(targetIndex?: number): number {
    const hookTargetMultiplier = this.p.damageHooks?.getTargetMultiplier?.(this.spellDef(), this.p, targetIndex) ?? 1.0;
    const armorPen = this.p.damageHooks?.getArmorPenPercent?.(this.p) ?? 0;
    const armorFactor = this.actionIsPhysical()
      ? computePhysicalArmorMultiplier(this.p, armorPen)
      : 1.0;
    return hookTargetMultiplier * armorFactor;
  }

  protected actionIsPhysical(): boolean {
    return true;
  }

  protected actionSchools(): readonly string[] {
    return this.actionIsPhysical() ? ['physical'] : [];
  }

  /** Crit chance fraction (0–1). Override to add spell-specific bonuses. */
  composite_crit_chance(): number {
    let critChancePercent = this.p.getCritPercent();
    critChancePercent += this.p.damageHooks?.getSpellCritChanceBonusPercent?.(this.spellDef(), this.p) ?? 0;
    return Math.min(100, critChancePercent) / 100;
  }

  /**
   * Effective chi cost for this cast, accounting for buff-based cost reductions.
   * Override in subclasses for spell-specific waivers (e.g. Dance of Chi-Ji on SCK).
   * The executor applies global modifiers (Zenith -1) on top of this return value.
   * Default: 0 (non-chi-spending actions).
   */
  chiCost(): number {
    return 0;
  }

  /**
   * Called by the executor immediately after chi is spent for this cast.
   * Override in spec-specific subclasses to trigger chi-spend procs.
   * Default implementation is a no-op.
   */
  onChiSpent(_chiCost: number, _rng: RngInstance, _queue: SimEventQueue): void {
    void _chiCost;
    void _rng;
    void _queue;
  }

  /**
   * Optional pre-cast action gating (e.g. proc-only spells).
   * Return a fail reason to block cast, otherwise undefined.
   */
  preCastFailReason(): ActionCastFailReason | undefined {
    return undefined;
  }

  /**
   * Whether a player cast attempt with `nextSpell` may interrupt this action's
   * active channel before the normal pre-cast checks run.
   */
  canBeInterruptedByCastAttempt(_nextSpell: SpellDef): boolean {
    return false;
  }

  /**
   * Whether a cast attempt with `nextSpell` may proceed while this action is
   * actively channeling, without interrupting the channel.
   */
  canCastWhileChannelingWithoutInterrupt(_nextSpell: SpellDef): boolean {
    return false;
  }

  /**
   * Cleanup to run immediately when a cast attempt interrupts this action.
   * Default: no extra effect.
   */
  onCastInterrupted(_queue: SimEventQueue, _rng: RngInstance): ActionResult {
    return { damage: 0, isCrit: false, newEvents: [], buffsApplied: [], cooldownAdjustments: [] };
  }

  /**
   * Identifier used for combo-strike checks and prev_gcd recording.
   * Defaults to action name.
   */
  comboStrikeName(): string {
    return this.name;
  }

  /**
   * Whether this action participates in combo-strike tracking (SimC: may_combo_strike).
   * Controls whether the action updates lastComboStrikeAbility and triggers
   * combo_strikes_trigger().  SimC defaults may_combo_strike to false in action_t;
   * subclasses (e.g. MonkAction) opt in by overriding to return true.
   */
  mayComboStrike(): boolean {
    return false;
  }

  /**
   * Effective cooldown duration for this action.
   * Defaults to haste scaling when spell metadata opts in.
   */
  cooldownDuration(baseDuration: number, hasteScalesCooldown: boolean): number {
    if (!hasteScalesCooldown) {
      return baseDuration;
    }
    return baseDuration / (1 + this.p.getHastePercent() / 100);
  }

  /**
   * Effective hard-cast duration for this action.
   * Defaults to haste-scaled non-channeled cast time.
   */
  castTime(baseDuration: number, hastePercent: number): number {
    return baseDuration / (1 + hastePercent / 100);
  }

  /**
   * Optional hard-cast snapshot data captured at cast start and replayed at cast
   * completion. Use this for spell-specific state such as proc/buff stack counts
   * that must not drift while the cast is in flight.
   */
  createCastContext(): ActionCastContext | undefined {
    return undefined;
  }

  /**
   * Effective channel duration for this action.
   * Defaults to haste-scaled channel duration.
   */
  channelDuration(baseDuration: number, hastePercent: number): number {
    return baseDuration / (1 + hastePercent / 100);
  }

  /**
   * Effective number of channel ticks for this action.
   */
  channelTicks(baseTicks: number): number {
    return baseTicks;
  }

  /**
   * Relative tick offsets in seconds from channel start.
   * Defaults to evenly spacing ticks across the full channel, ending on the last tick.
   */
  channelTickOffsets(channelDuration: number, channelTicks: number): number[] {
    if (channelTicks <= 0) {
      return [];
    }

    return Array.from(
      { length: channelTicks },
      (_, index) => (channelDuration / channelTicks) * (index + 1),
    );
  }

  // ---------------------------------------------------------------------------
  // AOE methods — mirror SimC's AOE damage pipeline
  // ---------------------------------------------------------------------------

  /**
   * Calculate the number of targets this action hits.
   * Mirrors SimC's action_t::n_targets().
   */
  nTargets(): number {
    if (this.aoe === 0) return 1;
    const enemies = this.p.activeEnemies ?? 1;
    if (this.aoe === -1) return enemies;
    return Math.min(this.aoe, enemies);
  }

  /**
   * Compute AOE damage multiplier for a given chain_target index.
   * Mirrors the AOE reduction pipeline in SimC's calculate_direct_amount().
   *
   * Reduction order (SimC):
   * 1. base_aoe_multiplier (static for secondary targets)
   * 2. split_aoe_damage (divide by target count)
   * 3. sqrt reduction (reduced_aoe_targets formula)
   * 4. composite_aoe_multiplier (overridable per-action)
   */
  aoeDamageMultiplier(chainTarget: number, nTargets: number): number {
    if (chainTarget === 0) return 1.0;

    let mult = 1.0;

    // Step 1: Static AOE multiplier for secondary targets
    mult *= this.baseAoeMultiplier;

    // Step 2: Split damage equally among targets
    if (this.splitAoeDamage) {
      mult /= nTargets;
    }

    // Step 3: Sqrt reduction (Shadowlands+ formula)
    // Applied to targets beyond fullAmountTargets when nTargets exceeds reducedAoeTargets
    if (
      chainTarget >= this.fullAmountTargets &&
      this.reducedAoeTargets > 0 &&
      nTargets > this.reducedAoeTargets
    ) {
      mult *= Math.sqrt(this.reducedAoeTargets / Math.min(20, nTargets));
    }

    // Step 4: Per-action override
    mult *= this.compositeAoeMultiplier(chainTarget, nTargets);

    return mult;
  }

  /**
   * Override in subclasses for ability-specific AOE modifiers.
   * Mirrors SimC's action_t::composite_aoe_multiplier().
   * Examples:
   * - FoF: secondary targets × effectN(6).percent()
   * - SotW: secondary targets ÷ n_targets
   */
  compositeAoeMultiplier(_chainTarget: number, _nTargets: number): number {
    return 1.0;
  }

  total_multiplier(isComboStrike: boolean, targetIndex?: number): number {
    return this.composite_da_multiplier()
      * this.composite_player_multiplier(isComboStrike)
      * this.composite_target_multiplier(targetIndex);
  }

  protected snapshotActionMultiplier(): number {
    return this.composite_da_multiplier();
  }

  protected snapshotPlayerMultiplier(): number {
    return getSharedPlayerDamageMultiplier(this.p);
  }

  protected snapshotMasteryMultiplier(_isComboStrike: boolean): number {
    return 1.0;
  }

  protected snapshotHitComboMultiplier(): number {
    return 1.0;
  }

  protected snapshotVersatilityMultiplier(): number {
    return 1 + this.p.getVersatilityPercent() / 100;
  }

  protected snapshotTargetMultiplier(): number {
    return this.composite_target_multiplier();
  }

  protected snapshotCritChancePercent(): number {
    return Math.min(100, this.composite_crit_chance() * 100);
  }

  protected critDamageMultiplier(): number {
    return this.p.damageHooks?.getCritDamageMultiplier?.(this.spellDef(), this.p) ?? 2.0;
  }

  protected spellDef(): SpellDef {
    return {
      id: this.spellData.id(),
      name: this.name,
      displayName: this.spellData.name(),
      schools: this.actionSchools(),
      energyCost: 0,
      chiCost: 0,
      chiGain: 0,
      cooldown: 0,
      hasteScalesCooldown: false,
      isChanneled: false,
      channelDuration: 0,
      channelTicks: 0,
      isOnGcd: true,
      apCoefficient: this.spellData.effectN(1).ap_coeff(),
      spCoefficient: this.spellData.effectN(1).sp_coeff(),
      baseDmgMin: 0,
      baseDmgMax: 0,
      requiresComboStrike: false,
      isWdp: false,
      isZenith: false,
      isExecute: false,
      executeHpDamage: 0,
      isPhysical: this.actionIsPhysical(),
    };
  }

  /**
   * Capture a channel snapshot using the same virtual multiplier chain as the
   * action's direct-damage path.
   */
  captureSnapshot(isComboStrike: boolean): DamageSnapshot {
    return {
      actionMultiplier: this.snapshotActionMultiplier(),
      playerMultiplier: this.snapshotPlayerMultiplier(),
      masteryMultiplier: this.snapshotMasteryMultiplier(isComboStrike),
      hitComboMultiplier: this.snapshotHitComboMultiplier(),
      versatilityMultiplier: this.snapshotVersatilityMultiplier(),
      targetMultiplier: this.snapshotTargetMultiplier(),
      apCoefficient: this.spellData.effectN(1).ap_coeff(),
      spellPowerCoefficient: this.spellData.effectN(1).sp_coeff(),
      attackPower: this.effectiveAttackPower(),
      spellPower: this.effectiveSpellPower(),
      baseDmgMin: 0,
      baseDmgMax: 0,
      critChance: this.snapshotCritChancePercent(),
      snapshotTime: this.p.currentTime,
    };
  }

  // ---------------------------------------------------------------------------
  // Damage helper
  // ---------------------------------------------------------------------------

  /**
   * Attack power used for this action's damage formula.
   *
   * Default: WEAPON_MAINHAND.
   * Override in subclasses that use WEAPON_BOTH (e.g. Blackout Kick, SCK tick)
   * to return getWeaponBothAttackPower().
   *
   * Source: SimC attack_power_type enum (sc_enums.hpp) and
   *         composite_total_attack_power_by_type (player.cpp).
   */
  protected effectiveAttackPower(): number {
    return this.p.getWeaponMainHandAttackPower?.() ?? this.p.getAttackPower();
  }

  protected effectiveSpellPower(): number {
    return this.p.getSpellPower?.() ?? 0;
  }

  /**
   * Compute raw AP/SP-scaled damage using effectN(1) coefficients × total_multiplier().
   * Subclasses override for multi-hit or non-standard formulas.
   */
  calculateDamage(rng: RngInstance, isComboStrike: boolean, targetIndex?: number): { damage: number; isCrit: boolean } {
    const ap = this.effectiveAttackPower();
    const apCoeff = this.spellData.effectN(1).ap_coeff();
    const sp = this.effectiveSpellPower();
    const spCoeff = this.spellData.effectN(1).sp_coeff();
    const critChance = this.composite_crit_chance();
    const isCrit = rng.next() < critChance;
    const critMult = isCrit ? this.critDamageMultiplier() : 1.0;
    const damage = (ap * apCoeff + sp * spCoeff) * this.total_multiplier(isComboStrike, targetIndex) * critMult;
    return { damage, isCrit };
  }

  // ---------------------------------------------------------------------------
  // Execute
  // ---------------------------------------------------------------------------

  /**
   * Execute the action: compute damage, return ActionResult.
   * Subclasses override to add proc effects. Always call super.execute() first.
   */
  execute(
    _queue: SimEventQueue,
    rng: RngInstance,
    isComboStrike: boolean,
    _castContext?: ActionCastContext,
  ): ActionResult {
    return {
      ...this.calculateDamage(rng, isComboStrike),
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  afterExecute(_queue: SimEventQueue, _rng: RngInstance): void {
    void _queue;
    void _rng;
  }

  tick(
    _state: IGameState,
    _rng: RngInstance,
    _snapshot: DamageSnapshot,
    _tickNum: number,
  ): ActionResult {
    return { damage: 0, isCrit: false, newEvents: [], buffsApplied: [], cooldownAdjustments: [] };
  }

  dot_tick(
    _state: IGameState,
    _rng: RngInstance,
    _snapshot: DamageSnapshot,
    _tickNum: number,
    _targetId: number,
  ): ActionResult {
    return { damage: 0, isCrit: false, newEvents: [], buffsApplied: [], cooldownAdjustments: [] };
  }

  last_tick(
    _state: IGameState,
    _queue: SimEventQueue,
    _rng: RngInstance,
  ): ActionResult {
    return { damage: 0, isCrit: false, newEvents: [], buffsApplied: [], cooldownAdjustments: [] };
  }

  protected calculateDamageFromSnapshot(
    snapshot: DamageSnapshot,
    rng: RngInstance,
    targetIndex?: number,
    aoeMultiplier?: number,
  ): { damage: number; isCrit: boolean } {
    const base = snapshot.baseDmgMin === snapshot.baseDmgMax
      ? snapshot.baseDmgMin
      : rollRange(rng, snapshot.baseDmgMin, snapshot.baseDmgMax);
    const baseDamage = base
      + snapshot.apCoefficient * snapshot.attackPower
      + (snapshot.spellPowerCoefficient ?? 0) * (snapshot.spellPower ?? 0);
    // When targetIndex is supplied, recompute the target multiplier live so that
    // target-specific debuffs (e.g. Hunter's Mark on target 0) are not incorrectly
    // applied to secondary targets. aoeMultiplier is applied on top for AoE falloff.
    const targetMult = targetIndex !== undefined
      ? this.composite_target_multiplier(targetIndex) * (aoeMultiplier ?? 1.0)
      : snapshot.targetMultiplier;
    const combined = snapshot.actionMultiplier
      * snapshot.playerMultiplier
      * snapshot.masteryMultiplier
      * snapshot.hitComboMultiplier
      * snapshot.versatilityMultiplier
      * targetMult;
    const isCrit = rollChance(rng, snapshot.critChance);
    return { damage: baseDamage * combined * (isCrit ? this.critDamageMultiplier() : 1.0), isCrit };
  }
}
