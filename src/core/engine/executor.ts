/**
 * Ability Executor — Stage 3.4 of the WoW Rotation Trainer.
 *
 * `executeAbility` is the central cast-resolution function. Given a spell
 * definition, the current mutable GameState, the event queue, and an RNG
 * instance it:
 *   1. Validates pre-cast conditions (resources, GCD, cooldowns, constraints)
 *   2. Computes combo-strike status before any state mutation
 *   3. Spends / grants resources (energy, chi)
 *   4. Starts the GCD and ability cooldown, pushing COOLDOWN_READY events
 *   5. Calculates and records damage (or schedules channel tick events)
 *   6. Applies buffs and pushes BUFF_APPLY / BUFF_EXPIRE events
 *   7. Updates mastery / Hit Combo tracking
 *   8. Resolves proc chains (Blackout Reinforcement, Dance of Chi-Ji, Zenith)
 *
 * All events pushed to the queue are also collected in the returned
 * `ExecutionResult.events` array so callers can inspect them without
 * iterating the queue.
 */

import { EventType } from './eventQueue';
import type { SimEvent, SimEventQueue } from './eventQueue';
import type { GameState } from './gameState';
import { calculateDamage, captureSnapshot } from './damage';
import type { RngInstance } from './rng';
import { spellRequiresGcdReady, type SpellDef } from '../data/spells';
import { buffAffectsEnergyRegen } from '../shared/player_effects';
import { applyActionResult } from './action_result';
import type { Action } from './action';
import { canInterruptActiveChannelForCast, interruptActiveChannel, isCastLockedByActiveChannel } from './channel';
import { delayAutoAttacksForChannelStart } from './autoAttack';

// ---------------------------------------------------------------------------
// ExecutionResult
// ---------------------------------------------------------------------------

/** Reasons why a cast attempt can fail pre-flight checks. */
export type FailReason =
  | 'insufficient_chi'
  | 'insufficient_energy'
  | 'on_gcd'
  | 'channel_locked'
  | 'cast_locked'
  | 'on_cooldown'
  | 'execute_not_ready'
  | 'wdp_constraint'
  | 'talent_missing'
  | 'not_available';

/**
 * The result returned by `executeAbility`.
 * On `success=false` the state is unchanged.
 * On `success=true` all side-effects have been applied.
 */
export interface ExecutionResult {
  success: boolean;
  /** Why the cast failed (if success=false) */
  failReason?: FailReason;
  /** Damage dealt (0 for utility / channeled cast start) */
  damage: number;
  /** Whether this was a combo strike */
  isComboStrike: boolean;
  /** Whether the hit was a critical strike (false for misses, channels, utility) */
  isCrit: boolean;
  executeTime?: number;
  /** Events pushed to the queue during this execution */
  events: SimEvent[];
  /** Cooldown adjustments applied during this execution. */
  appliedCooldownAdjustments?: ReadonlyArray<{ spellId: string; delta: number }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the haste-scaled GCD duration (minimum 0.75 s).
 */
function hasteScaledGcd(hastePercent: number): number {
  return Math.max(0.75, 1.5 / (1 + hastePercent / 100));
}

function effectiveGcdDuration(_spell: SpellDef, hastePercent: number): number {
  return hasteScaledGcd(hastePercent);
}

function effectiveCastTime(spell: SpellDef, state: GameState, hastePercent: number): number {
  const baseDuration = spell.castTime ?? 0;
  if (baseDuration <= 0) {
    return 0;
  }

  const action = state.action_list?.get(spell.name);
  const fallbackDuration = baseDuration / (1 + hastePercent / 100);
  return action?.castTime(baseDuration, hastePercent) ?? fallbackDuration;
}

function resolveRegisteredAction(state: GameState, spell: SpellDef): Action | undefined {
  return state.action_list?.get(spell.name);
}

export function getEffectiveChiCost(
  spell: SpellDef,
  state: GameState,
  registeredAction = resolveRegisteredAction(state, spell),
): number {
  if (registeredAction) {
    const globalReduction = state.executionHooks.getGlobalChiCostReduction?.(state, spell) ?? 0;
    return Math.max(0, registeredAction.chiCost() - globalReduction);
  }

  const fallbackChiCost = state.executionHooks.getUnregisteredChiCost?.(state, spell, spell.chiCost) ?? spell.chiCost;
  const globalReduction = state.executionHooks.getGlobalChiCostReduction?.(state, spell) ?? 0;
  return Math.max(0, fallbackChiCost - globalReduction);
}

export function getAbilityFailReason(
  spell: SpellDef,
  state: GameState,
  registeredAction = resolveRegisteredAction(state, spell),
  chiCost = getEffectiveChiCost(spell, state, registeredAction),
): FailReason | undefined {
  if (spell.talentRequired && !state.talents.has(spell.talentRequired)) {
    return 'talent_missing';
  }

  const hookPreCastFailReason = state.executionHooks.preCastFailReason?.(state, spell);
  if (hookPreCastFailReason) {
    return hookPreCastFailReason;
  }

  const actionPreCastFailReason = registeredAction?.preCastFailReason();
  if (actionPreCastFailReason) {
    return actionPreCastFailReason;
  }

  if (spellRequiresGcdReady(spell) && !state.isGcdReady()) {
    return 'on_gcd';
  }

  if (isCastLockedByActiveChannel(state, spell)) {
    return 'channel_locked';
  }

  const activeCast = state.getActiveCast();
  if (activeCast !== null && state.currentTime < activeCast.endsAt) {
    return 'cast_locked';
  }

  if (spell.cooldown > 0 && !state.isCooldownReady(spell.name)) {
    return 'on_cooldown';
  }

  if (spell.energyCost > 0 && state.getEnergy() < spell.energyCost) {
    return 'insufficient_energy';
  }

  if (chiCost > 0 && state.chi < chiCost) {
    return 'insufficient_chi';
  }

  return undefined;
}

export function effectiveChannelDuration(spell: SpellDef, state: GameState, hastePercent: number): number {
  const action = state.action_list?.get(spell.name);
  const baseDuration = spell.channelDuration;
  const fallbackDuration = state.executionHooks.getUnregisteredChannelDuration?.(
    state,
    spell,
    baseDuration,
    hastePercent,
  ) ?? baseDuration / (1 + hastePercent / 100);
  return action?.channelDuration(baseDuration, hastePercent) ?? fallbackDuration;
}

function effectiveChannelTicks(spell: SpellDef, state: GameState): number {
  const action = state.action_list?.get(spell.name);
  const fallbackTicks = state.executionHooks.getUnregisteredChannelTicks?.(state, spell, spell.channelTicks)
    ?? spell.channelTicks;
  return action?.channelTicks(spell.channelTicks) ?? fallbackTicks;
}

function effectiveChannelTickOffsets(
  spell: SpellDef,
  state: GameState,
  channelDuration: number,
  channelTicks: number,
): number[] {
  const action = state.action_list?.get(spell.name);
  if (action) {
    return action.channelTickOffsets(channelDuration, channelTicks);
  }

  const hookOffsets = state.executionHooks.getUnregisteredChannelTickOffsets?.(
    state,
    spell,
    channelDuration,
    channelTicks,
  );
  if (hookOffsets) {
    return hookOffsets;
  }

  if (channelTicks <= 0) {
    return [];
  }

  return Array.from(
    { length: channelTicks },
    (_, index) => (channelDuration / channelTicks) * (index + 1),
  );
}

function effectiveCooldownDuration(spell: SpellDef, state: GameState): number {
  const action = state.action_list?.get(spell.name);
  const fallbackDuration = state.executionHooks.getUnregisteredCooldownDuration?.(
    state,
    spell,
    spell.cooldown,
    spell.hasteScalesCooldown,
  ) ?? (spell.hasteScalesCooldown
    ? spell.cooldown / (1 + state.getHastePercent() / 100)
    : spell.cooldown);
  return action?.cooldownDuration(spell.cooldown, spell.hasteScalesCooldown) ?? fallbackDuration;
}

function shouldDeferCooldownUntilChannelEnd(spell: SpellDef, state: GameState): boolean {
  return spell.isChanneled && (state.executionHooks.deferCooldownUntilChannelEnd?.(state, spell) ?? false);
}

export function startAbilityCooldown(
  spell: SpellDef,
  state: GameState,
  queue: SimEventQueue,
  collected: SimEvent[],
): void {
  const hookCooldownEvents = state.executionHooks.startCooldown?.(state, spell);
  if (hookCooldownEvents) {
    for (const event of hookCooldownEvents) {
      pushEvent(event, queue, collected);
    }
    return;
  }

  if (spell.cooldown <= 0) {
    return;
  }

  const cdDuration = effectiveCooldownDuration(spell, state);
  state.startCooldown(spell.name, cdDuration);
  state.executionHooks.onCooldownStarted?.(state, spell, cdDuration);
  pushEvent(
    {
      type: EventType.COOLDOWN_READY,
      time: state.currentTime + cdDuration,
      spellId: spell.name,
    },
    queue,
    collected,
  );
}

/**
 * Push an event to both the queue and the local collector array.
 */
function pushEvent(
  event: SimEvent,
  queue: SimEventQueue,
  collected: SimEvent[]
): void {
  queue.push(event);
  collected.push(event);
}

/**
 * Apply a spell's self-buff (spell.buffApplied), scheduling BUFF_APPLY and
 * BUFF_EXPIRE events. Energy-regen-affecting buffs settle/recompute regen
 * around the state mutation.
 *
 * This is the single authoritative path for executor-level self-buff application.
 * It is intentionally separate from applyActionResult, which does not schedule
 * BUFF_EXPIRE events (those are owned by action subclasses via their ActionResult).
 */
function applySpellSelfBuff(
  spell: SpellDef,
  state: GameState,
  queue: SimEventQueue,
  collected: SimEvent[],
): void {
  if (!spell.buffApplied) return;
  const buffDuration = spell.buffDuration ?? 0;
  if (buffAffectsEnergyRegen(spell.buffApplied)) {
    state.settleEnergy();
  }
  state.applyBuff(spell.buffApplied, buffDuration, spell.buffMaxStacks ?? 1);
  if (buffAffectsEnergyRegen(spell.buffApplied)) {
    state.recomputeEnergyRegenRate();
  }
  pushEvent(
    { type: EventType.BUFF_APPLY, time: state.currentTime, buffId: spell.buffApplied },
    queue,
    collected,
  );
  if (buffDuration > 0) {
    pushEvent(
      { type: EventType.BUFF_EXPIRE, time: state.currentTime + buffDuration, buffId: spell.buffApplied },
      queue,
      collected,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to cast `spell` from the current `state`.
 *
 * If all pre-cast checks pass, the full cast resolution is performed:
 * resources are spent/gained, GCD and cooldown timers start, damage is
 * calculated (or channel events are scheduled), buffs are applied, and
 * proc chains are resolved.
 *
 * Returns an `ExecutionResult` describing the outcome.  On failure
 * (`success=false`) the state remains **unmodified**.
 *
 * @param spell  - The spell definition to cast.
 * @param state  - Mutable simulation state (mutated on success).
 * @param queue  - Event queue; new events are pushed on success.
 * @param rng    - RNG instance for proc / damage rolls.
 */
export function executeAbility(
  spell: SpellDef,
  state: GameState,
  queue: SimEventQueue,
  rng: RngInstance
): ExecutionResult {
  const collected: SimEvent[] = [];

  const initialRegisteredAction = resolveRegisteredAction(state, spell);
  const initialChiCost = getEffectiveChiCost(spell, state, initialRegisteredAction);
  const initialFailReason = getAbilityFailReason(spell, state, initialRegisteredAction, initialChiCost);

  if (initialFailReason === undefined && canInterruptActiveChannelForCast(state, spell)) {
    interruptActiveChannel(state, queue, rng);
  }

  const FAIL = (failReason: FailReason): ExecutionResult => ({
    success: false,
    failReason,
    damage: 0,
    isComboStrike: false,
    isCrit: false,
    executeTime: 0,
    events: collected,
    appliedCooldownAdjustments: [],
  });

  // -------------------------------------------------------------------------
  // Pre-cast checks
  // -------------------------------------------------------------------------

  const registeredAction = resolveRegisteredAction(state, spell);
  const chiCost = getEffectiveChiCost(spell, state, registeredAction);
  const failReason = getAbilityFailReason(spell, state, registeredAction, chiCost);
  if (failReason) {
    return FAIL(failReason);
  }

  // -------------------------------------------------------------------------
  // Determine combo strike BEFORE mutating state
  // SimC: is_combo_strike() checks combo_strike_actions.back(), which tracks
  // only may_combo_strike abilities.  (sc_monk.cpp:331-345)
  // -------------------------------------------------------------------------

  const comboStrikeCheckName = registeredAction?.comboStrikeName()
    ?? state.executionHooks.getComboStrikeName?.(state, spell)
    ?? spell.name;
  const mayComboStrike = registeredAction?.mayComboStrike() ?? spell.mayComboStrike ?? false;
  const isComboStrike = mayComboStrike
    ? state.lastComboStrikeAbility !== comboStrikeCheckName
    : false;

  // -------------------------------------------------------------------------
  // Resource mutations
  // -------------------------------------------------------------------------

  const hastePercent = state.getHastePercent();
  const deferCooldownUntilChannelEnd = shouldDeferCooldownUntilChannelEnd(spell, state);
  const channelRollbackState = deferCooldownUntilChannelEnd
    ? {
        cooldownStateBeforeStart: state.getCooldownStateSnapshot(spell.name),
        trinketsBeforeStart: state.getTrinketsSnapshot(),
      }
    : undefined;

  // Spend energy
  if (spell.energyCost > 0) {
    state.spendEnergy(spell.energyCost);
  }

  // Spend chi (using Zenith-reduced cost) and notify the action
  if (chiCost > 0) {
    state.spendChi(chiCost);
    registeredAction?.onChiSpent(chiCost, rng, queue);
  }

  // Gain chi
  if (spell.chiGain > 0) {
    state.gainChi(spell.chiGain);
  }

  // -------------------------------------------------------------------------
  // GCD — channels still trigger the normal haste-scaled GCD.
  // Follow-up casts can then queue during the channel and interrupt when GCD ends.
  // -------------------------------------------------------------------------

  if (spell.isOnGcd) {
    const gcdDuration = state.executionHooks.getGcdDuration?.(
      state,
      spell,
      effectiveGcdDuration(spell, hastePercent),
      hastePercent,
    ) ?? effectiveGcdDuration(spell, hastePercent);
    state.startGcd(gcdDuration);
  }

  // -------------------------------------------------------------------------
  // Cooldown
  // -------------------------------------------------------------------------

  startAbilityCooldown(spell, state, queue, collected);

  state.recordGcdAbility(comboStrikeCheckName);
  if (mayComboStrike) {
    state.lastComboStrikeAbility = comboStrikeCheckName;
  }
  state.lastCastAbility = spell.name;

  const castTime = effectiveCastTime(spell, state, hastePercent);
  if (!spell.isChanneled && castTime > 0) {
    const castId = state.startCast(spell.name, castTime, isComboStrike);
    const castContext = registeredAction?.createCastContext();
    pushEvent(
      {
        type: EventType.CAST_START,
        time: state.currentTime,
        spellId: spell.name,
        duration: castTime,
        castId,
      },
      queue,
      collected,
    );
    pushEvent(
      {
        type: EventType.ABILITY_CAST,
        time: state.currentTime + castTime,
        spellId: spell.name,
        castId,
        isComboStrike,
        castContext,
      },
      queue,
      collected,
    );

    return {
      success: true,
      damage: 0,
      isComboStrike,
      isCrit: false,
      executeTime: castTime,
      events: collected,
    };
  }

  // -------------------------------------------------------------------------
  // Damage / channel scheduling
  // -------------------------------------------------------------------------

  let damage = 0;
  let isCrit = false;
  let appliedCooldownAdjustments: ReadonlyArray<{ spellId: string; delta: number }> = [];

  if (spell.isChanneled) {
    // Dispatch to Action class for cast-start side effects (flurry release, WDP buff, etc.)
    // Damage from channeled spells comes from tick events, so we discard result.damage.
    const channelAction = state.action_list?.get(spell.name);
      if (channelAction) {
        const actionResult = channelAction.execute(queue, rng, isComboStrike, channelAction.createCastContext());
        applyActionResult(state, queue, collected, actionResult);
        appliedCooldownAdjustments = actionResult.cooldownAdjustments;
      }

    // Capture snapshot at cast-start (before any further state changes)
    const snapshot = channelAction
      ? channelAction.captureSnapshot(isComboStrike)
      : captureSnapshot(spell, state, isComboStrike);

    const channelDuration = effectiveChannelDuration(spell, state, hastePercent);
    const channelTicks = effectiveChannelTicks(spell, state);
    const channelTickOffsets = effectiveChannelTickOffsets(spell, state, channelDuration, channelTicks);
    delayAutoAttacksForChannelStart(state, queue, spell.name, channelDuration);
    const channelId = channelRollbackState
      ? state.startChannelWithRollback(spell.name, channelDuration, channelRollbackState)
      : state.startChannel(spell.name, channelDuration);

    // CHANNEL_START
    pushEvent(
      {
        type: EventType.CHANNEL_START,
        time: state.currentTime,
        spellId: spell.name,
        snapshot,
        channelId,
        duration: channelDuration,
      },
      queue,
      collected
    );

    // Schedule N ticks
    for (let i = 0; i < channelTickOffsets.length; i++) {
      pushEvent(
        {
          type: EventType.CHANNEL_TICK,
          time: state.currentTime + channelTickOffsets[i],
          spellId: spell.name,
          tickNumber: i + 1,
          snapshot,
          channelId,
          totalTicks: channelTicks,
        },
        queue,
        collected
      );
    }

    // CHANNEL_END
    pushEvent(
      {
        type: EventType.CHANNEL_END,
        time: state.currentTime + channelDuration,
        spellId: spell.name,
        channelId,
      },
      queue,
      collected
    );

    // Channeled spells return damage=0 at cast time; ticks deal damage when processed
    damage = 0;
  } else {
    // Non-channeled direct damage
    if (spell.isExecute) {
      // Dispatch to Action class if available (e.g. TouchOfDeathAction)
      const executeAction = state.action_list?.get(spell.name);
      if (executeAction) {
        const result = executeAction.execute(queue, rng, isComboStrike, executeAction.createCastContext());
        damage = result.damage;
        isCrit = result.isCrit;
        state.addDamage(damage);
        applyActionResult(state, queue, collected, result);
        appliedCooldownAdjustments = result.cooldownAdjustments;
      } else {
        // Legacy path: execute damage handled externally by caller
        damage = 0;
      }
    } else {
      // Dispatch to Action class if available (migrated spells)
      const action = state.action_list?.get(spell.name);
      if (action) {
        const result = action.execute(queue, rng, isComboStrike, action.createCastContext());
        damage = result.damage;
        isCrit = result.isCrit;
        state.addDamage(damage);
        applyActionResult(state, queue, collected, result);
        appliedCooldownAdjustments = result.cooldownAdjustments;
      } else {
        // Fallback: existing path for non-migrated spells
        const dmgResult = calculateDamage(spell, state, rng, isComboStrike);
        damage = dmgResult.finalDamage;
        isCrit = dmgResult.isCrit;
        state.addDamage(damage);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Buff application
  // -------------------------------------------------------------------------

  applySpellSelfBuff(spell, state, queue, collected);

  // -------------------------------------------------------------------------
  // Proc chains
  // -------------------------------------------------------------------------

  // --- Blackout Reinforcement (BoK! proc) ---
  // BR stack consume + downstream procs (rushing_wind_kick, energy_burst,
  // sharp_reflexes, obsidian_spiral, teachings) are now owned by
  // BlackoutKickAction.execute() and are NOT repeated here.

  // --- Zenith (Celestial Conduit) ---
  // Handled by CelestialConduitAction.execute() via action_list dispatch above.

  // --- Wisdom of the Wall ---
  // Handled by SpinningCraneKickAction.execute() via action_list dispatch above.

  // --- Touch of Death ---
  // Handled by TouchOfDeathAction.execute() via action_list dispatch above.

  registeredAction?.afterExecute(queue, rng);

  // Fire shared post-execution hooks (trinket procs, etc.)
  state.executionHooks.onAbilityExecuted?.(state, spell, rng, queue);

  return {
    success: true,
    damage,
    isComboStrike,
    isCrit,
    executeTime: 0,
    events: collected,
    appliedCooldownAdjustments,
  };
}

export function processAbilityCast(
  event: Extract<SimEvent, { type: EventType.ABILITY_CAST }>,
  state: GameState,
  queue: SimEventQueue,
  rng: RngInstance,
): ExecutionResult {
  const spell = state.executionHooks.resolveSpellDef?.(state, event.spellId);
  if (!spell) {
    return { success: false, failReason: 'not_available', damage: 0, isComboStrike: false, isCrit: false, executeTime: 0, events: [], appliedCooldownAdjustments: [] };
  }

  if (event.castId !== undefined && !state.completeCast(event.spellId, event.castId)) {
    return { success: false, failReason: 'not_available', damage: 0, isComboStrike: false, isCrit: false, executeTime: 0, events: [], appliedCooldownAdjustments: [] };
  }

  const collected: SimEvent[] = [];
  let damage = 0;
  let isCrit = false;
  const isComboStrike = event.isComboStrike ?? false;
  const registeredAction = resolveRegisteredAction(state, spell);

  if (spell.isExecute) {
    const executeAction = state.action_list?.get(spell.name);
    if (executeAction) {
      const result = executeAction.execute(queue, rng, isComboStrike, event.castContext);
      damage = result.damage;
      isCrit = result.isCrit;
      state.addDamage(damage);
      applyActionResult(state, queue, collected, result);
    }
  } else {
    const action = state.action_list?.get(spell.name);
    if (action) {
      const result = action.execute(queue, rng, isComboStrike, event.castContext);
      damage = result.damage;
      isCrit = result.isCrit;
      state.addDamage(damage);
      applyActionResult(state, queue, collected, result);
    } else {
      const dmgResult = calculateDamage(spell, state, rng, isComboStrike);
      damage = dmgResult.finalDamage;
      isCrit = dmgResult.isCrit;
      state.addDamage(damage);
    }
  }

  applySpellSelfBuff(spell, state, queue, collected);

  registeredAction?.afterExecute(queue, rng);
  state.executionHooks.onAbilityExecuted?.(state, spell, rng, queue);

  return {
    success: true,
    damage,
    isComboStrike,
    isCrit,
    executeTime: 0,
    events: collected,
  };
}
