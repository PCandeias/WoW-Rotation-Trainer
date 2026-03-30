/**
 * GameState — the mutable simulation state for the WoW Rotation Trainer.
 *
 * Implements the `GameState` interface defined in `src/core/apl/evaluator.ts`
 * while adding mutation methods, factory construction, and snapshot support.
 */

import type { SpellId, BuffState, CooldownState, TrinketState } from '../apl/evaluator';
import { resolveCharacterStatsWithTrainerDefaults } from '../data/defaultProfile';
import type { CharacterProfile, CharacterProfileStatsSource, CharacterStats } from '../data/profileParser';
import type { SpellDef } from '../data/spells';
import type { Action } from './action';
import type { SimEvent } from './eventQueue';
import type { SimEventQueue } from './eventQueue';
import type { IGameState } from './i_game_state';
import type { IGameStateDamageHooks } from './i_game_state';
import type { RngInstance } from './rng';
import {
  getSharedPlayerAttackPowerMultiplier,
  getSharedPlayerAttackPowerBonus,
  getSharedPlayerCritBonus,
  getSharedPlayerHasteBonus,
  getSharedPlayerMaxHealthMultiplier,
  getSharedPlayerMasteryBonus,
  getSharedPlayerVersatilityBonus,
} from '../shared/player_effects';
import { initializeSharedPlayerState } from '../shared/player_effect_runtime';
import type { SpecRuntime } from '../runtime/spec_runtime';
import { resolveSpecRuntime } from '../runtime/spec_registry';

const BAKED_BATTLE_SHOUT_AP_MULTIPLIER = 1.05;

// Re-export the interfaces for convenience
export type { SpellId, BuffState, CooldownState, TrinketState };

// ---------------------------------------------------------------------------
// GameStateSnapshot
// ---------------------------------------------------------------------------

/**
 * A plain-object deep copy of all mutable GameState fields.
 * Created by `GameState.snapshot()` and suitable for recording/comparison.
 * Note: Contains Map and Set types — not directly JSON-serialisable. Use snapshot for in-memory comparison only.
 */
export interface GameStateSnapshot {
  // Resources
  chi: number;
  chiMax: number;
  energyMax: number;
  energyAtLastUpdate: number;
  energyRegenRate: number;
  energyRegenMultiplier: number;
  energyLastUpdated: number;
  currentTime: number;

  // Encounter
  encounterDuration: number;
  activeEnemies: number;
  assumeMysticTouch: boolean;
  targetHealthPct: number;
  targetMaxHealth: number;

  // Ability history
  prevGcdAbility: SpellId | null;
  prevGcdAbilities: SpellId[];

  // State maps (serialised)
  buffs: Map<string, BuffState>;
  cooldowns: Map<string, CooldownState>;
  talents: Set<string>;
  talentRanks: Map<string, number>;
  trinkets: TrinketState[];

  // Stats
  stats: CharacterStats;

  // Damage tracking
  totalDamage: number;
  lastCastAbility: SpellId | null;
  lastComboStrikeAbility?: SpellId | null;

  // Waste tracking
  chiWasted: number;
  energyWasted: number;

  // Auto-attack timers
  mhSwingTimer: number;
  ohSwingTimer: number;

  // Shado-Pan specific
  flurryCharges: number;
  hitComboStacks: number;
  nextCombatWisdomAt: number;
  dualThreatMhAllowed: boolean;
  dualThreatOhAllowed: boolean;

  // Spell queue
  queuedAbility: SpellId | null;
  queuedAt: number;
  queuedWindow: number;

  // GCD
  gcdReady: number;
}

export interface PendingSpellStat {
  spellId: string;
  damage: number;
  casts: number;
  isCrit?: boolean;
  outcome?: 'landed' | 'miss' | 'dodge' | 'parry';
  time?: number;
}

export interface GameStateStatHooks {
  getCritPercentBonus?(state: IGameState): number;
  getAutoAttackHastePercentBonus?(state: IGameState): number;
  getAutoAttackSpeedMultiplier?(state: IGameState): number;
  getAttackPowerBonus?(state: IGameState): number;
  /** Additive bonus multiplier for AP (e.g. 0.04 = +4% AP). */
  getAttackPowerMultiplierBonus?(state: IGameState): number;
  /**
   * Optional additive AP multiplier applied to the WEAPON_* AP term only.
   * Defaults to getAttackPowerMultiplierBonus when omitted.
   */
  getAttackPowerWeaponMultiplierBonus?(state: IGameState): number;
  /** Flat additive haste percent bonus (e.g. 5 = +5% haste). */
  getHastePercentBonus?(state: IGameState): number;
}

export interface GameStateExecutionHooks {
  preCastFailReason?(state: GameState, spell: SpellDef): 'talent_missing' | 'wdp_constraint' | 'execute_not_ready' | 'not_available' | undefined;
  getComboStrikeName?(state: GameState, spell: SpellDef): string;
  resolveSpellDef?(state: GameState, spellId: string): SpellDef | undefined;
  allowChannelInterruptByCastAttempt?(state: GameState, activeSpellId: string, nextSpell: SpellDef): boolean;
  getGcdDuration?(state: GameState, spell: SpellDef, defaultDuration: number, hastePercent: number): number;
  /** Override `gcd.max` expression evaluation (SimC: base_gcd scaled by active haste). */
  getGcdMax?(state: GameState, defaultGcd: number): number;
  getUnregisteredChiCost?(state: GameState, spell: SpellDef, baseCost: number): number;
  getGlobalChiCostReduction?(state: GameState, spell: SpellDef): number;
  getUnregisteredCooldownDuration?(state: GameState, spell: SpellDef, baseDuration: number, hasteScalesCooldown: boolean): number;
  getUnregisteredChannelDuration?(state: GameState, spell: SpellDef, baseDuration: number, hastePercent: number): number;
  getUnregisteredChannelTicks?(state: GameState, spell: SpellDef, baseTicks: number): number;
  getUnregisteredChannelTickOffsets?(
    state: GameState,
    spell: SpellDef,
    channelDuration: number,
    channelTicks: number,
  ): number[] | undefined;
  deferCooldownUntilChannelEnd?(state: GameState, spell: SpellDef): boolean;
  startCooldown?(state: GameState, spell: SpellDef): SimEvent[] | undefined;
  onCooldownStarted?(state: GameState, spell: SpellDef, duration: number): void;
  onChannelEnd?(
    state: GameState,
    event: { spellId: string; time: number; interrupted?: boolean; channelId?: number },
    queue: SimEventQueue,
    completedChannel?: { startedAt: number; endsAt: number },
  ): boolean;
  /** Called after every successful ability execution (for trinket proc checks, etc.). */
  onAbilityExecuted?(state: GameState, spell: SpellDef, rng: RngInstance, queue: SimEventQueue): void;
}

interface ActiveChannelState {
  spellId: string;
  channelId: number;
  startedAt: number;
  endsAt: number;
  cooldownStateBeforeStart?: CooldownState;
  trinketsBeforeStart?: TrinketState[];
}

function cloneCooldownState(cooldownState: CooldownState | undefined): CooldownState | undefined {
  if (!cooldownState) {
    return undefined;
  }

  return {
    readyAt: cooldownState.readyAt,
    readyTimes: cooldownState.readyTimes ? [...cooldownState.readyTimes] : undefined,
    maxCharges: cooldownState.maxCharges,
    rechargeDuration: cooldownState.rechargeDuration,
  };
}

function cloneTrinkets(trinkets: TrinketState[]): TrinketState[] {
  return trinkets.map((trinket) => ({ ...trinket }));
}

function requireCombatStat(
  value: number | undefined,
  fieldName: 'targetArmor' | 'characterLevel' | 'targetLevel' | 'hitPercent' | 'expertisePercent',
): number {
  if (value === undefined) {
    throw new Error(`GameState is missing required combat stat '${fieldName}'`);
  }

  return value;
}

// ---------------------------------------------------------------------------
// EncounterConfig
// ---------------------------------------------------------------------------

export interface EncounterConfig {
  duration: number;
  activeEnemies?: number;
  speedMultiplier?: number;
  /**
   * Target armor value (0–4000+).
   * Reduces physical damage based on SimC's formula:
   * DR = armor / (armor + K), where K is the difficulty-adjusted armor constant.
   * Common values:
   * - 0: No armor (weak mobs)
   * - 1470: Training dummy, mythic dungeon boss (SimC default armor value)
   * - 3430: Level-90 base armor constant before difficulty modifiers
   *
   * Default: 1470 (SimC training dummy armor).
   */
  targetArmor?: number;
  /**
   * Target maximum health for health percent tracking.
   * Used to calculate targetHealthPct as (currentHealth / maxHealth) * 100.
   * If not provided, targetHealthPct stays at 100% and never decreases.
   *
   * Default: undefined (no health tracking; targetHealthPct = 100%).
   */
  targetMaxHealth?: number;
}

// ---------------------------------------------------------------------------
// GameState class
// ---------------------------------------------------------------------------

export class GameState implements IGameState {
  // === Resources ===
  chi = 0;
  chiMax = 5;
  energyMax = 100;
  energyAtLastUpdate = 100;
  energyRegenRate = 10;
  energyRegenMultiplier = 1;
  energyLastUpdated = 0;
  currentTime = 0;

  // === Encounter ===
  encounterDuration = 90;
  activeEnemies = 1;
  /** Target health as a percentage (0–100). Calculated as (currentHealth / maxHealth) * 100. */
  targetHealthPct = 100;
  /** Target current health in absolute terms. Decreases as damage is dealt. */
  private targetCurrentHealth = 0;
  /** Target maximum health. If 0, health tracking is disabled (targetHealthPct = 100). */
  private targetMaxHealth = 0;
  assumeMysticTouch = false;

  /**
   * Sets target armor from encounter config or stats.
   * Encounter config takes precedence if both are present.
   */
  setTargetArmor(armor: number): void {
    this.stats.targetArmor = armor;
  }

  /** Implements IGameState.targetArmor — resolved from profile or the shared default trainer profile. */
  get targetArmor(): number { return requireCombatStat(this.stats.targetArmor, 'targetArmor'); }
  /** Implements IGameState.characterLevel — resolved from profile or the shared default trainer profile. */
  get characterLevel(): number { return requireCombatStat(this.stats.characterLevel, 'characterLevel'); }
  /** Implements IGameState.targetLevel — resolved from profile or the shared default trainer profile. */
  get targetLevel(): number { return requireCombatStat(this.stats.targetLevel, 'targetLevel'); }
  /** Implements IGameState.hitPercent — resolved from profile or the shared default trainer profile. */
  get hitPercent(): number { return requireCombatStat(this.stats.hitPercent, 'hitPercent'); }
  /** Implements IGameState.expertisePercent — resolved from profile or the shared default trainer profile. */
  get expertisePercent(): number { return requireCombatStat(this.stats.expertisePercent, 'expertisePercent'); }

  // === Ability history ===
  prevGcdAbility: SpellId | null = null;
  prevGcdAbilities: SpellId[] = [];

  // === State maps ===
  buffs = new Map<string, BuffState>();
  cooldowns = new Map<string, CooldownState>();
  /** When each buff was most recently applied (for uptime tracking). */
  private _buffStart = new Map<string, number>();
  /** Accumulated uptime (seconds) for each buff from completed/expired periods. */
  private _buffUptimeAccum = new Map<string, number>();
  talents: Set<string>;
  talentRanks: Map<string, number> = new Map<string, number>();
  trinkets: TrinketState[] = [];
  pendingUseBuffStartedAt = new Map<string, number>();
  statHooks: GameStateStatHooks = {};
  damageHooks: IGameStateDamageHooks = {};
  executionHooks: GameStateExecutionHooks = {};

  // === Stats ===
  stats: CharacterStats;
  profileStatsSource: CharacterProfileStatsSource = 'profile';
  /** True when stats.attackPower includes Battle Shout ×1.05 baked in from SimC export. */
  battleShoutBaked = false;

  // === Damage tracking ===
  totalDamage = 0;
  lastCastAbility: SpellId | null = null;
  lastComboStrikeAbility: SpellId | null = null;

  // === Waste tracking ===
  chiWasted = 0;
  energyWasted = 0;

  // === Auto-attack timers ===
  mhSwingTimer = 0;
  ohSwingTimer = 0;

  // === Shado-Pan specific ===
  flurryCharges = 0;
  hitComboStacks = 0;
  nextCombatWisdomAt = Number.POSITIVE_INFINITY;
  dualThreatMhAllowed = false;
  dualThreatOhAllowed = false;
  lastSkyfuryProcAt = Number.NEGATIVE_INFINITY;

  // === Spell queue ===
  queuedAbility: SpellId | null = null;
  queuedAt = 0;
  queuedWindow = 0;

  // === GCD ===
  gcdReady = 0;

  // === Class module fields (populated by ClassModule.init()) ===
  action_list: Map<string, Action> | undefined = undefined;

  /**
   * Player actions disabled due to loadout configuration (e.g. potion not equipped).
   * Checked by the shared preCastFailReason hook to block APL execution.
   */
  disabledPlayerActions = new Set<string>();

  // === Synthetic child-hit tracking ===
  pendingSpellStats: PendingSpellStat[] = [];

  // === Channel tracking ===
  private activeChannel: ActiveChannelState | null = null;
  private nextChannelId = 1;

  constructor(stats: CharacterStats, talents: Set<string>, options?: { assumeMysticTouch?: boolean }) {
    this.stats = resolveCharacterStatsWithTrainerDefaults(stats);
    this.talents = talents;
    this.energyRegenRate = 10 * (1 + this.stats.hastePercent / 100) * this.energyRegenMultiplier;
    this.assumeMysticTouch = options?.assumeMysticTouch ?? false;
  }

  /**
   * Initialize target health tracking for the encounter.
   * @param maxHealth Maximum health of the target. If 0 or undefined, health tracking is disabled.
   */
  initializeTargetHealth(maxHealth: number | undefined): void {
    if (!maxHealth || maxHealth <= 0) {
      this.targetMaxHealth = 0;
      this.targetCurrentHealth = 0;
      this.targetHealthPct = 100;
      return;
    }

    this.targetMaxHealth = maxHealth;
    this.targetCurrentHealth = maxHealth;
    this.updateTargetHealthPct();
  }

  /**
   * Record damage dealt to the target and update health percentage.
   * Target health will not go below 1 HP (training dummy behavior).
   * @param damage Amount of damage dealt
   */
  dealDamageToTarget(damage: number): void {
    if (this.targetMaxHealth <= 0) {
      return; // Health tracking disabled
    }

    this.targetCurrentHealth = Math.max(1, this.targetCurrentHealth - damage);
    this.updateTargetHealthPct();
  }

  /**
   * Set target health directly as a percentage of max health.
   * Used for encounter models that define health progression externally.
   */
  setTargetHealthPct(pct: number): void {
    if (this.targetMaxHealth <= 0) {
      return;
    }

    const clampedPct = Math.max(0, Math.min(100, pct));
    this.targetCurrentHealth = (this.targetMaxHealth * clampedPct) / 100;
    this.updateTargetHealthPct();
  }

  /** Recalculate targetHealthPct from current and max health. */
  private updateTargetHealthPct(): void {
    if (this.targetMaxHealth <= 0) {
      this.targetHealthPct = 100;
    } else {
      this.targetHealthPct = (this.targetCurrentHealth / this.targetMaxHealth) * 100;
    }
  }

  getTargetCurrentHealth(): number {
    return this.targetCurrentHealth;
  }

  getTargetMaxHealth(): number {
    return this.targetMaxHealth;
  }

  // ---------------------------------------------------------------------------
  // Chi
  // ---------------------------------------------------------------------------

  spendChi(amount: number): void {
    if (this.chi < amount) {
      throw new Error(`Insufficient chi: have ${this.chi}, need ${amount}`);
    }
    this.chi -= amount;
  }

  gainChi(amount: number): void {
    const overflow = Math.max(0, this.chi + amount - this.chiMax);
    this.chiWasted += overflow;
    this.chi = Math.min(this.chiMax, this.chi + amount);
  }

  hasTalent(name: string): boolean { return this.talents.has(name); }
  getTalentRank(name: string): number { return this.talentRanks.get(name) ?? (this.talents.has(name) ? 1 : 0); }

  getChi(): number {
    return this.chi;
  }

  getCritPercent(): number {
    let crit = this.stats.critPercent;

    crit += getSharedPlayerCritBonus(this);
    crit += this.statHooks.getCritPercentBonus?.(this) ?? 0;

    return Math.min(100, crit);
  }

  getAttackPower(): number {
    const multBonus = 1 + (this.statHooks.getAttackPowerMultiplierBonus?.(this) ?? 0);
    const base = this.stats.attackPower * getSharedPlayerAttackPowerMultiplier(this) * multBonus;
    const sharedBonus = getSharedPlayerAttackPowerBonus(this);
    const hookBonus = this.statHooks.getAttackPowerBonus?.(this) ?? 0;
    return base + sharedBonus + hookBonus;
  }

  private getAttackPowerWeaponMultiplier(): number {
    const multBonus = 1 + (
      this.statHooks.getAttackPowerWeaponMultiplierBonus?.(this)
      ?? this.statHooks.getAttackPowerMultiplierBonus?.(this)
      ?? 0
    );
    const sharedMultiplier = getSharedPlayerAttackPowerMultiplier(this);
    // SimC buffed snapshots may include Battle Shout in `stats.attackPower`.
    // The separate weapon AP term should use the same AP multiplier only when
    // that baked snapshot had Battle Shout enabled.
    const effectiveSharedMultiplier = (
      this.profileStatsSource === 'simc_buffed_snapshot' && sharedMultiplier === 1
    )
      ? (this.battleShoutBaked ? BAKED_BATTLE_SHOUT_AP_MULTIPLIER : 1)
      : sharedMultiplier;
    return effectiveSharedMultiplier * multBonus;
  }

  /**
   * SimC WEAPON_MAINHAND AP:
   *   total_ap = round(cache.attack_power * ap_mult + cache.weapon_ap(MH) * ap_mult)
   * where weapon_ap(MH) = floor(mh_dps * 6).
   *
   * We mirror this using the trainer's base AP (getAttackPower()) plus the
   * weapon AP term scaled by the same AP multiplier.
   */
  getWeaponMainHandAttackPower(): number {
    const WEAPON_POWER_COEFFICIENT = 6;
    const mhDps = this.stats.mainHandSpeed > 0
      ? (this.stats.mainHandMinDmg + this.stats.mainHandMaxDmg) / 2 / this.stats.mainHandSpeed
      : 0.5; // SimC unarmed fallback
    const weaponMainhandAP = Math.floor(mhDps * WEAPON_POWER_COEFFICIENT);
    const multiplier = this.getAttackPowerWeaponMultiplier();
    return this.getAttackPower() + Math.round(weaponMainhandAP * multiplier);
  }

  getWeaponBothAttackPower(): number {
    // SimC: composite_weapon_attack_power_by_type(WEAPON_BOTH)
    // wdps = (MH_dps + OH_dps / 2) * 2/3   [for DW]
    // weapon_both_ap = floor(wdps * WEAPON_POWER_COEFFICIENT)   [WEAPON_POWER_COEFFICIENT = 6]
    // Final AP uses base AP plus this weapon term, all multiplied by AP multipliers.
    // For 2H (no OH), SimC switches WEAPON_BOTH -> WEAPON_MAINHAND.
    const WEAPON_POWER_COEFFICIENT = 6;
    const mhDps = this.stats.mainHandSpeed > 0
      ? (this.stats.mainHandMinDmg + this.stats.mainHandMaxDmg) / 2 / this.stats.mainHandSpeed
      : 0.5; // SimC unarmed fallback

    if (this.stats.offHandSpeed <= 0) {
      return this.getWeaponMainHandAttackPower();
    }

    const ohDps = (this.stats.offHandMinDmg + this.stats.offHandMaxDmg) / 2 / this.stats.offHandSpeed;
    const weaponBothAP = Math.floor((mhDps + ohDps / 2) * (2 / 3) * WEAPON_POWER_COEFFICIENT);
    const multiplier = this.getAttackPowerWeaponMultiplier();
    return this.getAttackPower() + Math.round(weaponBothAP * multiplier);
  }

  getMaxHealth(): number {
    return (this.stats.maxHealth ?? 0) * getSharedPlayerMaxHealthMultiplier(this);
  }

  getHastePercent(): number {
    const baseMultiplier = 1 + this.stats.hastePercent / 100;
    const sharedMultiplier = 1 + getSharedPlayerHasteBonus(this) / 100;
    const hookMultiplier = 1 + ((this.statHooks.getHastePercentBonus?.(this) ?? 0) / 100);
    return (baseMultiplier * sharedMultiplier * hookMultiplier - 1) * 100;
  }

  /**
   * Returns the effective GCD duration (seconds) after spec overrides.
   * E.g. WW Monk spec aura reduces base GCD from 1.5s → 1.0s (non-hasted).
   */
  getGcdMax(): number {
    const hastePercent = this.getHastePercent();
    // SimC gcd.max = base_gcd × min(attack_haste, spell_haste).  The energy regen
    // rate already encodes active haste (gear + bloodlust + etc.), so we derive
    // gcd.max from it when the hook is provided; this keeps `energy.time_to_max ≤
    // gcd.max * N` conditions consistent with SimC even during bloodlust etc.
    const defaultGcd = Math.max(0.75, 1.5 / (1 + hastePercent / 100));
    return this.executionHooks.getGcdMax?.(this, defaultGcd) ?? defaultGcd;
  }

  getAutoAttackHastePercent(): number {
    const baseMultiplier = 1 + this.getHastePercent() / 100;
    const autoAttackMultiplier = 1 + ((this.statHooks.getAutoAttackHastePercentBonus?.(this) ?? 0) / 100);
    return (baseMultiplier * autoAttackMultiplier - 1) * 100;
  }

  getAutoAttackSpeedMultiplier(): number {
    return this.statHooks.getAutoAttackSpeedMultiplier?.(this) ?? 1;
  }

  getVersatilityPercent(): number {
    let versatility = this.stats.versatilityPercent;
    versatility += getSharedPlayerVersatilityBonus(this);
    return versatility;
  }

  getMasteryPercent(): number {
    let mastery = this.stats.masteryPercent;
    mastery += getSharedPlayerMasteryBonus(this);
    return mastery;
  }

  // ---------------------------------------------------------------------------
  // Energy (continuous)
  // ---------------------------------------------------------------------------

  getEnergy(): number {
    return Math.min(this.energyMax, this.getUncappedEnergy());
  }

  settleEnergy(): void {
    const uncappedEnergy = this.getUncappedEnergy();
    this.energyWasted += Math.max(0, uncappedEnergy - this.energyMax);
    this.energyAtLastUpdate = Math.min(this.energyMax, uncappedEnergy);
    this.energyLastUpdated = this.currentTime;
  }

  getTotalEnergyWasted(): number {
    return this.energyWasted + Math.max(0, this.getUncappedEnergy() - this.energyMax);
  }

  recomputeEnergyRegenRate(): void {
    this.energyRegenRate = 10 * (1 + this.getHastePercent() / 100) * this.energyRegenMultiplier;
  }

  spendEnergy(amount: number): void {
    this.settleEnergy();
    if (this.energyAtLastUpdate < amount) {
      throw new Error(`Insufficient energy: have ${this.energyAtLastUpdate}, need ${amount}`);
    }
    this.energyAtLastUpdate -= amount;
  }

  // ---------------------------------------------------------------------------
  // Cooldowns
  // ---------------------------------------------------------------------------

  startCooldown(spellId: SpellId, duration: number): void {
    const existing = this.settleCooldownState(spellId);
    this.cooldowns.set(spellId, {
      readyAt: this.currentTime + duration,
      readyTimes: existing?.readyTimes ? [...existing.readyTimes] : undefined,
      maxCharges: existing?.maxCharges,
      rechargeDuration: existing?.rechargeDuration,
    });
  }

  startChargeCooldown(spellId: SpellId, maxCharges: number, rechargeDuration: number): void {
    const existing = this.settleCooldownState(spellId);
    const readyTimes = [...(existing?.readyTimes ?? [])];
    const availableCharges =
      (existing?.maxCharges ?? maxCharges) - readyTimes.length;

    if (availableCharges <= 0) {
      throw new Error(`No charges available for ${spellId}`);
    }

    const rechargeStartsAt = readyTimes.length > 0
      ? Math.max(this.currentTime, readyTimes[readyTimes.length - 1])
      : this.currentTime;
    readyTimes.push(rechargeStartsAt + rechargeDuration);
    readyTimes.sort((a, b) => a - b);
    this.cooldowns.set(spellId, {
      readyAt: existing?.readyAt,
      readyTimes,
      maxCharges,
      rechargeDuration,
    });
  }

  isCooldownReady(spellId: SpellId): boolean {
    const cd = this.settleCooldownState(spellId);
    if (cd === undefined) return true;
    if (cd.readyTimes && cd.maxCharges !== undefined) {
      const chargesReady = cd.maxCharges - cd.readyTimes.length > 0;
      const lockoutReady = (cd.readyAt ?? this.currentTime) <= this.currentTime;
      return chargesReady && lockoutReady;
    }
    return (cd.readyAt ?? this.currentTime) <= this.currentTime;
  }

  getCooldownRemains(spellId: SpellId): number {
    const cd = this.settleCooldownState(spellId);
    if (cd === undefined) return 0;
    const lockoutRemains = Math.max(0, (cd.readyAt ?? this.currentTime) - this.currentTime);
    if (cd.readyTimes && cd.maxCharges !== undefined) {
      const availableCharges = cd.maxCharges - cd.readyTimes.length;
      const rechargeRemains =
        availableCharges > 0 || cd.readyTimes.length === 0
          ? 0
          : Math.max(0, cd.readyTimes[0] - this.currentTime);
      return Math.max(lockoutRemains, rechargeRemains);
    }
    return lockoutRemains;
  }

  adjustCooldown(spellId: SpellId, deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    const cd = this.settleCooldownState(spellId);
    if (cd === undefined || cd.readyTimes) return;
    if (cd.readyAt === undefined || cd.readyAt <= this.currentTime) return;
    cd.readyAt = Math.max(this.currentTime, cd.readyAt - deltaSeconds);
    this.cooldowns.set(spellId, cd);
  }

  delayCooldown(spellId: SpellId, deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;
    const cd = this.settleCooldownState(spellId);
    if (cd === undefined || cd.readyTimes) return;
    if (cd.readyAt === undefined || cd.readyAt <= this.currentTime) return;
    cd.readyAt += deltaSeconds;
    this.cooldowns.set(spellId, cd);
  }

  // ---------------------------------------------------------------------------
  // Buffs (independent-timer model: each stack tracks its own expiration)
  // ---------------------------------------------------------------------------

  applyBuff(buffId: string, duration: number, stacks = 1): void {
    // Accumulate uptime for any previous period — whether still active or already
    // expired naturally. Without this, a buff that expires on its own and is later
    // reapplied would lose the old period from the uptime totals.
    const now = this.currentTime;
    const newExpiry = now + duration;
    const existing = this.buffs.get(buffId);

    if (existing) {
      const prevStart = this._buffStart.get(buffId) ?? 0;
      const periodEnd = Math.min(existing.expiresAt, now);
      const elapsed = Math.max(0, periodEnd - prevStart);
      if (elapsed > 0) {
        this._buffUptimeAccum.set(buffId, (this._buffUptimeAccum.get(buffId) ?? 0) + elapsed);
      }

      // Prune expired stacks
      const activeTimers = existing.stackTimers.filter(t => t === 0 || t > now);
      const activeCount = activeTimers.length;

      if (stacks > activeCount) {
        // Add new stacks with fresh timers; preserve existing stack timers
        const toAdd = stacks - activeCount;
        for (let i = 0; i < toAdd; i++) {
          activeTimers.push(newExpiry);
        }
      } else if (stacks < activeCount) {
        // Fewer stacks requested — trim oldest, refresh survivors
        activeTimers.sort((a, b) => {
          if (a === 0) return 1;
          if (b === 0) return -1;
          return a - b;
        });
        activeTimers.splice(0, activeCount - stacks);
        for (let i = 0; i < activeTimers.length; i++) {
          if (activeTimers[i] !== 0) activeTimers[i] = newExpiry;
        }
      } else {
        // Same stack count — refresh all timers (SimC trigger() at max stacks)
        for (let i = 0; i < activeTimers.length; i++) {
          if (activeTimers[i] !== 0) activeTimers[i] = newExpiry;
        }
      }

      const maxExpiry = activeTimers.length > 0 ? Math.max(...activeTimers) : 0;
      existing.stackTimers = activeTimers;
      existing.stacks = activeTimers.length;
      existing.expiresAt = maxExpiry;
      this._buffStart.set(buffId, now);
    } else {
      // New buff: create N stacks all with the same initial timer
      const timers: number[] = Array(stacks).fill(newExpiry) as number[];
      this.buffs.set(buffId, { expiresAt: newExpiry, stacks, stackTimers: timers });
      this._buffStart.set(buffId, now);
    }
  }

  expireBuff(buffId: string): void {
    const buff = this.buffs.get(buffId);
    if (buff) {
      const start = this._buffStart.get(buffId) ?? 0;
      const end = Math.min(buff.expiresAt, this.currentTime);
      this._buffUptimeAccum.set(buffId, (this._buffUptimeAccum.get(buffId) ?? 0) + Math.max(0, end - start));
    }
    this.buffs.delete(buffId);
    this._buffStart.delete(buffId);
  }

  /**
   * Set a permanent (non-expiring) stacked buff to an exact stack count.
   * Returns the clamped stack value that was applied.
   */
  setPermanentStackingBuff(buffId: string, stacks: number, maxStacks = Number.POSITIVE_INFINITY): number {
    const nextStacks = Math.min(maxStacks, Math.max(0, Math.floor(stacks)));
    const wasActive = this._buffStart.has(buffId);

    if (nextStacks > 0) {
      const timers: number[] = Array(nextStacks).fill(0) as number[];
      this.buffs.set(buffId, { expiresAt: 0, stacks: nextStacks, stackTimers: timers });
      if (!wasActive) {
        this._buffStart.set(buffId, this.currentTime);
      }
      return nextStacks;
    }

    if (wasActive) {
      const start = this._buffStart.get(buffId) ?? this.currentTime;
      this._buffUptimeAccum.set(
        buffId,
        (this._buffUptimeAccum.get(buffId) ?? 0) + Math.max(0, this.currentTime - start),
      );
    }

    this.buffs.delete(buffId);
    this._buffStart.delete(buffId);
    return 0;
  }

  /**
   * Collect buff uptime statistics at the end of the fight.
   * Flushes any still-tracked buff periods (active or naturally-expired) and returns
   * total uptime in seconds for each buff that was ever applied.
   */
  collectBuffUptimes(): Record<string, number> {
    for (const [buffId, buff] of this.buffs) {
      const start = this._buffStart.get(buffId) ?? 0;
      const end = buff.expiresAt === 0 ? this.currentTime : Math.min(buff.expiresAt, this.currentTime);
      const elapsed = Math.max(0, end - start);
      if (elapsed > 0) {
        this._buffUptimeAccum.set(buffId, (this._buffUptimeAccum.get(buffId) ?? 0) + elapsed);
      }
    }
    return Object.fromEntries(this._buffUptimeAccum);
  }

  isBuffActive(buffId: string): boolean {
    const buff = this.buffs.get(buffId);
    return buff !== undefined && (buff.expiresAt === 0 || buff.expiresAt > this.currentTime);
  }

  getBuffRemains(buffId: string): number {
    const buff = this.buffs.get(buffId);
    if (buff === undefined) return 0;
    if (buff.expiresAt === 0) return 0;
    if (buff.expiresAt <= this.currentTime) return 0;
    return Math.max(0, buff.expiresAt - this.currentTime);
  }

  /**
   * Returns the count of currently active stacks (independent-timer model).
   * Only stacks with `expiresAt === 0` (permanent) or `expiresAt > currentTime` count.
   */
  getBuffStacks(buffId: string): number {
    if (!this.isBuffActive(buffId)) return 0;
    const buff = this.buffs.get(buffId);
    if (!buff) return 0;
    const now = this.currentTime;
    return buff.stackTimers.filter(t => t === 0 || t > now).length;
  }

  addBuffStack(buffId: string): void {
    if (!this.isBuffActive(buffId)) return;
    const buff = this.buffs.get(buffId);
    if (buff !== undefined) {
      // Inherit the timer of the longest-lived existing stack
      const maxTimer = buff.stackTimers.length > 0 ? Math.max(...buff.stackTimers) : 0;
      buff.stackTimers.push(maxTimer);
      buff.stacks = buff.stackTimers.filter(t => t === 0 || t > this.currentTime).length;
      buff.expiresAt = Math.max(...buff.stackTimers);
    }
  }

  removeBuffStack(buffId: string): void {
    if (!this.isBuffActive(buffId)) return;
    const buff = this.buffs.get(buffId);
    if (buff !== undefined) {
      const now = this.currentTime;
      // Remove the oldest (soonest-to-expire) active stack
      const activeTimers = buff.stackTimers.filter(t => t === 0 || t > now);
      if (activeTimers.length === 0) return;

      // Sort ascending by expiry (permanent stacks sort last)
      activeTimers.sort((a, b) => {
        if (a === 0) return 1;
        if (b === 0) return -1;
        return a - b;
      });
      activeTimers.shift(); // remove the oldest active stack

      if (activeTimers.length === 0) {
        // Accumulate uptime before removing the buff entirely
        const start = this._buffStart.get(buffId) ?? 0;
        const end = Math.min(buff.expiresAt, now);
        this._buffUptimeAccum.set(
          buffId,
          (this._buffUptimeAccum.get(buffId) ?? 0) + Math.max(0, end - start),
        );
        this.buffs.delete(buffId);
        this._buffStart.delete(buffId);
      } else {
        buff.stackTimers = activeTimers;
        buff.stacks = activeTimers.length;
        buff.expiresAt = Math.max(...activeTimers);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // GCD
  // ---------------------------------------------------------------------------

  isGcdReady(): boolean {
    return this.currentTime >= this.gcdReady;
  }

  startGcd(duration: number): void {
    this.gcdReady = this.currentTime + duration;
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  recordGcdAbility(spellId: SpellId): void {
    this.prevGcdAbility = spellId;
    this.prevGcdAbilities = [spellId, ...this.prevGcdAbilities].slice(0, 5);
  }

  // ---------------------------------------------------------------------------
  // Damage
  // ---------------------------------------------------------------------------

  addDamage(amount: number): void {
    this.totalDamage += amount;
    this.dealDamageToTarget(amount);
  }

  recordPendingSpellStat(
    spellId: string,
    damage: number,
    casts = 0,
    isCrit = false,
    outcome: 'landed' | 'miss' | 'dodge' | 'parry' = 'landed',
    time: number = this.currentTime,
  ): void {
    this.pendingSpellStats.push({ spellId, damage, casts, isCrit, outcome, time });
  }

  drainPendingSpellStats(): PendingSpellStat[] {
    const drained = this.pendingSpellStats;
    this.pendingSpellStats = [];
    return drained;
  }

  // ---------------------------------------------------------------------------
  // Channel tracking
  // ---------------------------------------------------------------------------

  /**
   * Start a new foreground channel and return its unique channel ID.
   */
  startChannel(spellId: string, duration: number): number {
    const channelId = this.nextChannelId++;
    this.activeChannel = {
      spellId,
      channelId,
      startedAt: this.currentTime,
      endsAt: this.currentTime + duration,
      cooldownStateBeforeStart: cloneCooldownState(this.cooldowns.get(spellId)),
      trinketsBeforeStart: cloneTrinkets(this.trinkets),
    };
    return channelId;
  }

  startChannelWithRollback(
    spellId: string,
    duration: number,
    rollbackState: { cooldownStateBeforeStart?: CooldownState; trinketsBeforeStart?: TrinketState[] },
  ): number {
    const channelId = this.nextChannelId++;
    this.activeChannel = {
      spellId,
      channelId,
      startedAt: this.currentTime,
      endsAt: this.currentTime + duration,
      cooldownStateBeforeStart: cloneCooldownState(rollbackState.cooldownStateBeforeStart),
      trinketsBeforeStart: rollbackState.trinketsBeforeStart ? cloneTrinkets(rollbackState.trinketsBeforeStart) : [],
    };
    return channelId;
  }

  getCooldownStateSnapshot(spellId: string): CooldownState | undefined {
    return cloneCooldownState(this.cooldowns.get(spellId));
  }

  getTrinketsSnapshot(): TrinketState[] {
    return cloneTrinkets(this.trinkets);
  }

  /**
   * Returns the currently active channel, if any.
   */
  getActiveChannel(): Readonly<ActiveChannelState> | null {
    return this.activeChannel;
  }

  /**
   * Return true when the event belongs to the currently active channel.
   */
  isCurrentChannel(spellId: string, channelId: number): boolean {
    return (
      this.activeChannel !== null &&
      this.activeChannel.spellId === spellId &&
      this.activeChannel.channelId === channelId
    );
  }

  /**
   * Mark the active channel as completed if it matches the provided IDs.
   */
  completeChannel(spellId: string, channelId: number): Readonly<ActiveChannelState> | null {
    if (!this.isCurrentChannel(spellId, channelId)) {
      return null;
    }

    const completedChannel = this.activeChannel;
    this.activeChannel = null;
    return completedChannel;
  }

  /**
   * Interrupt and clear the active channel, returning its identifiers.
   */
  interruptChannel(): Readonly<ActiveChannelState> | null {
    if (this.activeChannel === null) {
      return null;
    }

    const interrupted = this.activeChannel;
    this.activeChannel = null;

    const cooldownStateBeforeStart = cloneCooldownState(interrupted.cooldownStateBeforeStart);
    if (cooldownStateBeforeStart) {
      this.cooldowns.set(interrupted.spellId, cooldownStateBeforeStart);
    } else {
      this.cooldowns.delete(interrupted.spellId);
    }

    this.trinkets = interrupted.trinketsBeforeStart ? cloneTrinkets(interrupted.trinketsBeforeStart) : [];

    return interrupted;
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  snapshot(): GameStateSnapshot {
    // Deep copy buffs map — prune expired stacks and resolve stacks/expiresAt
    const buffsCopy = new Map<string, BuffState>();
    for (const [k, v] of this.buffs) {
      const activeTimers = v.stackTimers.filter(t => t === 0 || t > this.currentTime);
      if (activeTimers.length > 0) {
        const maxExpiry = Math.max(...activeTimers);
        buffsCopy.set(k, { expiresAt: maxExpiry, stacks: activeTimers.length, stackTimers: [...activeTimers] });
      }
    }

    // Deep copy cooldowns map
    const cooldownsCopy = new Map<string, CooldownState>();
    for (const [k, v] of this.cooldowns) {
      cooldownsCopy.set(k, {
        ...v,
        readyTimes: v.readyTimes ? [...v.readyTimes] : undefined,
      });
    }

    return {
      chi: this.chi,
      chiMax: this.chiMax,
      energyMax: this.energyMax,
      energyAtLastUpdate: this.energyAtLastUpdate,
      energyRegenRate: this.energyRegenRate,
      energyRegenMultiplier: this.energyRegenMultiplier,
      energyLastUpdated: this.energyLastUpdated,
      currentTime: this.currentTime,

      encounterDuration: this.encounterDuration,
      activeEnemies: this.activeEnemies,
      assumeMysticTouch: this.assumeMysticTouch,
      targetHealthPct: this.targetHealthPct,
      targetMaxHealth: this.targetMaxHealth,

      prevGcdAbility: this.prevGcdAbility,
      prevGcdAbilities: [...this.prevGcdAbilities],

      buffs: buffsCopy,
      cooldowns: cooldownsCopy,
      talents: new Set(this.talents),
      talentRanks: new Map(this.talentRanks),
      trinkets: this.trinkets.map((t) => ({ ...t })),

      stats: { ...this.stats },

      totalDamage: this.totalDamage,
      lastCastAbility: this.lastCastAbility,
      lastComboStrikeAbility: this.lastComboStrikeAbility,
      chiWasted: this.chiWasted,
      energyWasted: this.getTotalEnergyWasted(),

      mhSwingTimer: this.mhSwingTimer,
      ohSwingTimer: this.ohSwingTimer,

      flurryCharges: this.flurryCharges,
      hitComboStacks: this.hitComboStacks,
      nextCombatWisdomAt: this.nextCombatWisdomAt,
      dualThreatMhAllowed: this.dualThreatMhAllowed,
      dualThreatOhAllowed: this.dualThreatOhAllowed,

      queuedAbility: this.queuedAbility,
      queuedAt: this.queuedAt,
      queuedWindow: this.queuedWindow,

      gcdReady: this.gcdReady,
    };
  }

  // ---------------------------------------------------------------------------
  // Clone
  // ---------------------------------------------------------------------------

  /**
   * Create an independent copy of this GameState suitable for APL lookahead
   * forward simulation.
   *
   * - All scalar and mutable fields are deep-copied so mutations on the clone
   *   do not affect the original.
  * - `talents`, `stats`, and stat hooks are shared (same reference) since
   *   they are treated as read-only during lookahead.
   * - Uptime-tracking internals (`_buffStart`, `_buffUptimeAccum`) and
   *   `pendingSpellStats` start empty so lookahead damage does not pollute
   *   the real encounter's stats.
   */
  clone(): GameState {
    // Construct with the same stats/talents and options, so the constructor
    // initialises energyRegenRate correctly.
    const c = new GameState(this.stats, this.talents, {
      assumeMysticTouch: this.assumeMysticTouch,
    });
    c.profileStatsSource = this.profileStatsSource;
    c.battleShoutBaked = this.battleShoutBaked;
    c.talentRanks = this.talentRanks; // shared reference — read-only during lookahead

    // --- Scalars ---
    c.chi = this.chi;
    c.chiMax = this.chiMax;
    c.energyMax = this.energyMax;
    c.energyAtLastUpdate = this.energyAtLastUpdate;
    c.energyRegenRate = this.energyRegenRate;
    c.energyRegenMultiplier = this.energyRegenMultiplier;
    c.energyLastUpdated = this.energyLastUpdated;
    c.currentTime = this.currentTime;

    c.encounterDuration = this.encounterDuration;
    c.activeEnemies = this.activeEnemies;
    c.targetHealthPct = this.targetHealthPct;
    c.targetCurrentHealth = this.targetCurrentHealth; // copy private field
    c.targetMaxHealth = this.targetMaxHealth;         // copy private field
    // assumeMysticTouch already set via constructor options above

    c.prevGcdAbility = this.prevGcdAbility;
    c.prevGcdAbilities = [...this.prevGcdAbilities];

    c.totalDamage = this.totalDamage;
    c.lastCastAbility = this.lastCastAbility;
    c.lastComboStrikeAbility = this.lastComboStrikeAbility;
    c.chiWasted = this.chiWasted;
    c.energyWasted = this.energyWasted;

    c.mhSwingTimer = this.mhSwingTimer;
    c.ohSwingTimer = this.ohSwingTimer;

    c.flurryCharges = this.flurryCharges;
    c.hitComboStacks = this.hitComboStacks;
    c.nextCombatWisdomAt = this.nextCombatWisdomAt;
    c.dualThreatMhAllowed = this.dualThreatMhAllowed;
    c.dualThreatOhAllowed = this.dualThreatOhAllowed;
    c.lastSkyfuryProcAt = this.lastSkyfuryProcAt;

    c.queuedAbility = this.queuedAbility;
    c.queuedAt = this.queuedAt;
    c.queuedWindow = this.queuedWindow;

    c.gcdReady = this.gcdReady;

    // --- Deep copy buffs ---
    c.buffs = new Map();
    for (const [k, v] of this.buffs) {
      c.buffs.set(k, { ...v, stackTimers: [...v.stackTimers] });
    }

    // --- Deep copy cooldowns ---
    c.cooldowns = new Map();
    for (const [k, v] of this.cooldowns) {
      c.cooldowns.set(k, {
        ...v,
        readyTimes: v.readyTimes ? [...v.readyTimes] : undefined,
      });
    }

    // --- Trinkets: new array, shallow-copy each entry ---
    c.trinkets = this.trinkets.map((t) => ({ ...t }));

    // --- Channel tracking ---
    c.activeChannel = this.activeChannel ? { ...this.activeChannel } : null;
    c.nextChannelId = this.nextChannelId;

    // --- Shared references (read-only during lookahead) ---
    // stats and talents are already set via the constructor
    c.statHooks = this.statHooks;
    c.damageHooks = this.damageHooks;
    c.executionHooks = this.executionHooks;
    c.action_list = this.action_list;
    c.disabledPlayerActions = this.disabledPlayerActions; // shared ref — read-only during lookahead

    // --- Fresh / reset ---
    // Uptime tracking starts empty — lookahead should not accumulate real uptimes
    c._buffStart = new Map();
    c._buffUptimeAccum = new Map();

    // Pending spell stats reset — lookahead damage must not pollute real stats
    c.pendingSpellStats = [];

    return c;
  }

  private getUncappedEnergy(): number {
    const elapsed = this.currentTime - this.energyLastUpdated;
    return this.energyAtLastUpdate + this.energyRegenRate * elapsed;
  }

  private settleCooldownState(spellId: SpellId): CooldownState | undefined {
    const cooldown = this.cooldowns.get(spellId);
    if (!cooldown?.readyTimes) return cooldown;

    const readyTimes = cooldown.readyTimes.filter((time) => time > this.currentTime);
    if (readyTimes.length !== cooldown.readyTimes.length) {
      cooldown.readyTimes = readyTimes;
      this.cooldowns.set(spellId, cooldown);
    }
    return cooldown;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a fully-initialised `GameState` from a `CharacterProfile` and encounter config.
 */
export function createGameState(
  profile: CharacterProfile,
  encounter: EncounterConfig,
  runtime: SpecRuntime = resolveSpecRuntime(profile),
): GameState {
  const state = new GameState({ ...profile.stats }, new Set(profile.talents));
  state.profileStatsSource = profile.statsSource ?? 'profile';
  state.battleShoutBaked = profile.battleShoutBaked ?? false;
  state.talentRanks = new Map(profile.talentRanks);
  initializeSharedPlayerState(state, profile);
  runtime.initializeState(state, profile);

  state.encounterDuration = encounter.duration;
  state.activeEnemies = encounter.activeEnemies ?? 1;

  // Set up target stats
  state.setTargetArmor(encounter.targetArmor ?? state.targetArmor);
  state.initializeTargetHealth(encounter.targetMaxHealth);

  // Energy regen rate must reflect loadout passives and any pull-time haste buffs.
  state.recomputeEnergyRegenRate();

  // Auto-attack timers start at 0 (first swing at t=0)
  state.mhSwingTimer = 0;
  state.ohSwingTimer = 0;

  // Energy starts full
  state.energyAtLastUpdate = 100;
  state.energyLastUpdated = 0;

  return state;
}
