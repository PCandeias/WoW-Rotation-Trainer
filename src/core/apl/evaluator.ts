/**
 * APL Expression Evaluator.
 *
 * Walks the AST produced by the Pratt parser, queries game state, and returns
 * a number. This is the third stage of the APL parsing pipeline:
 *   tokenizer → parser (Pratt AST) → evaluator → action list runner
 *
 * All property lookups are strict: an unrecognised path throws AplError rather
 * than silently returning 0, so APL bugs are caught early.
 */

import type { AstNode } from './parser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Spell identifier — a kebab/snake_case string matching SimC ability names. */
export type SpellId = string;

/** Evaluation context for a single APL evaluation pass. */
export interface EvalContext {
  /** The ability currently being considered for casting. Required for combo_strike. */
  candidateAbility?: SpellId;
  /** APL variable values (set by variable,op=set/add/etc.). Not persisted to GameState. */
  variables: Map<string, number>;
}

// ---------------------------------------------------------------------------
// GameState types
// ---------------------------------------------------------------------------

export interface BuffState {
  /** Sim time (seconds) when the longest-lived stack expires. 0 = permanent. */
  expiresAt: number;
  /** Count of stacks at last mutation time. Use stackTimers for accurate real-time count. */
  stacks: number;
  /**
   * Per-stack expiration timestamps (independent-timer model).
   * Each entry is a sim time when that stack expires. 0 = permanent.
   * Stacks age independently — only entries with `t === 0 || t > currentTime` are active.
   */
  stackTimers: number[];
}

export interface CooldownState {
  /** Sim time (seconds) when the ability is off cooldown. readyAt <= currentTime means ready. */
  readyAt?: number;
  /** Future recharge completion times for charged cooldowns. */
  readyTimes?: number[];
  maxCharges?: number;
  rechargeDuration?: number;
}

export interface TrinketState {
  cooldownReadyAt: number;
  procActive: boolean;
  procExpiresAt: number;
  itemName?: string;
  hasUseBuff?: boolean;
  pendingUseBuffStartedAt?: number;
}

export interface GameState {
  // Resources
  chi: number;
  chiMax: number;
  energyMax: number;         // maximum energy pool
  energyAtLastUpdate: number;
  energyRegenRate: number;  // energy/second, haste-scaled
  energyLastUpdated: number; // sim time of last energy settlement
  currentTime: number;       // current sim time in seconds

  // Encounter
  encounterDuration: number;
  activeEnemies: number;
  targetHealthPct: number;

  // GCD history
  prevGcdAbility: SpellId | null;
  prevGcdAbilities: SpellId[]; // [most recent first]
  lastComboStrikeAbility: SpellId | null;

  // Shado-Pan specific
  flurryCharges: number;

  // Buffs, cooldowns, talents
  buffs: Map<string, BuffState>;
  cooldowns: Map<string, CooldownState>;
  talents: Set<string>;

  /**
   * Returns gcd.max: haste-scaled base GCD (SimC: base_gcd × attack_haste,
   * min 750ms). base_gcd is always 1.5s; spec auras modify individual ability
   * trigger_gcd, not base_gcd.  If not implemented, defaults to 1.5s.
   */
  getGcdMax?(): number;

  // Gear
  trinkets: TrinketState[]; // exactly 2 elements
}

// ---------------------------------------------------------------------------
// AplError
// ---------------------------------------------------------------------------

/**
 * Thrown when the evaluator encounters an invalid or unrecognised APL
 * expression, or when required context is missing.
 */
export class AplError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AplError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute current energy via continuous regeneration formula, capped at max. */
function computeEnergy(state: GameState): number {
  const elapsed = state.currentTime - state.energyLastUpdated;
  return Math.min(state.energyMax, state.energyAtLastUpdate + state.energyRegenRate * elapsed);
}

/** Parse a slot index from either numeric ("1", "2") or prefixed ("slot1", "slot2") format. */
function parseSlotIndex(segment: string): number {
  const raw = segment.startsWith('slot') ? segment.slice(4) : segment;
  return parseInt(raw, 10);
}

/** Return true if buff is active (exists in map AND not yet expired). */
function isBuffActive(buff: BuffState | undefined, currentTime: number): boolean {
  return buff !== undefined && (buff.expiresAt === 0 || buff.expiresAt > currentTime);
}

function getZenithBuffState(state: GameState): BuffState | undefined {
  const zenith = state.buffs.get('zenith');
  if (isBuffActive(zenith, state.currentTime)) return zenith;
  const conduit = state.buffs.get('celestial_conduit_active');
  return isBuffActive(conduit, state.currentTime) ? conduit : undefined;
}

function resolveCooldown(
  cooldown: CooldownState | undefined,
  currentTime: number
): { isReady: boolean; remains: number; fullRechargeTime: number; duration: number } {
  const lockoutRemains = Math.max(0, (cooldown?.readyAt ?? currentTime) - currentTime);

  if (cooldown?.readyTimes && cooldown.maxCharges !== undefined) {
    const readyTimes = cooldown.readyTimes.filter((time) => time > currentTime).sort((a, b) => a - b);
    const charges = cooldown.maxCharges - readyTimes.length;
    const nextReadyAt = readyTimes[0];
    const fullReadyAt = readyTimes[readyTimes.length - 1];
    const rechargeRemains =
      charges > 0 || nextReadyAt === undefined ? 0 : nextReadyAt - currentTime;

    return {
      isReady: charges > 0 && lockoutRemains === 0,
      remains: Math.max(lockoutRemains, rechargeRemains),
      fullRechargeTime:
        readyTimes.length === 0 || fullReadyAt === undefined ? 0 : fullReadyAt - currentTime,
      duration: cooldown.rechargeDuration ?? 0,
    };
  }

  const readyAt = cooldown?.readyAt ?? currentTime;
  const isReady = readyAt <= currentTime;
  return {
    isReady,
    remains: isReady ? 0 : lockoutRemains,
    fullRechargeTime: isReady ? 0 : lockoutRemains,
    duration: cooldown?.rechargeDuration ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Property resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a dotted path (PropertyAccess node) against the current game state
 * and evaluation context, returning a number.
 *
 * Throws AplError for any path that is not recognised — strict mode.
 */
function resolveProperty(path: string[], state: GameState, ctx: EvalContext): number {
  const [root, ...rest] = path;

  // -------------------------------------------------------------------------
  // chi
  // -------------------------------------------------------------------------
  if (root === 'chi') {
    if (rest.length === 0) return state.chi;
    if (rest[0] === 'max' && rest.length === 1) return state.chiMax;
    if (rest[0] === 'deficit' && rest.length === 1) return state.chiMax - state.chi;
    throw new AplError(`Unknown chi property: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // energy
  // -------------------------------------------------------------------------
  if (root === 'energy') {
    if (rest.length === 0) return computeEnergy(state);
    if (rest[0] === 'max' && rest.length === 1) return state.energyMax;
    if (rest[0] === 'deficit' && rest.length === 1) {
      return state.energyMax - computeEnergy(state);
    }
    if (rest[0] === 'time_to_max' && rest.length === 1) {
      const deficit = state.energyMax - computeEnergy(state);
      if (deficit <= 0) return 0;
      if (state.energyRegenRate <= 0) return 0; // regen suppressed, treat as instant
      return deficit / state.energyRegenRate;
    }
    throw new AplError(`Unknown energy property: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // buff.<name>.<property>
  // -------------------------------------------------------------------------
  if (root === 'buff') {
    if (rest.length < 2) {
      throw new AplError(`Incomplete buff path: ${path.join('.')}`);
    }
    const [rawName, prop, ...extra] = rest;
    if (extra.length > 0) {
      throw new AplError(`Too many segments in buff path: ${path.join('.')}`);
    }
    const name = normalizeAplBuffName(rawName);
    if (rawName === 'flurry_charge') {
      const flurry = state.buffs.get('flurry_charge');
      const flurryStacks = isBuffActive(flurry, state.currentTime)
        ? (flurry?.stackTimers ?? []).filter(t => t === 0 || t > state.currentTime).length
        : state.flurryCharges;
      switch (prop) {
        case 'up':
          return flurryStacks > 0 ? 1 : 0;
        case 'remains':
          return 0;
        case 'stack':
          return flurryStacks;
        default:
          throw new AplError(`Unknown buff property '${prop}' in path: ${path.join('.')}`);
      }
    }
    const buff = rawName === 'zenith' ? getZenithBuffState(state) : state.buffs.get(name);
    const active = isBuffActive(buff, state.currentTime);

    switch (prop) {
      case 'up':
        return active ? 1 : 0;
      case 'remains':
        return active && buff !== undefined
          ? (buff.expiresAt === 0 ? 0 : buff.expiresAt - state.currentTime)
          : 0;
      case 'stack':
        if (!active || !buff) return 0;
        return buff.stackTimers.filter(t => t === 0 || t > state.currentTime).length;
      default:
        throw new AplError(`Unknown buff property '${prop}' in path: ${path.join('.')}`);
    }
  }

  // -------------------------------------------------------------------------
  // cooldown.<name>.<property>
  // -------------------------------------------------------------------------
  if (root === 'cooldown') {
    if (rest.length < 2) {
      throw new AplError(`Incomplete cooldown path: ${path.join('.')}`);
    }
    const [name, prop, ...extra] = rest;
    if (extra.length > 0) {
      throw new AplError(`Too many segments in cooldown path: ${path.join('.')}`);
    }
    const resolved = resolveCooldown(state.cooldowns.get(name), state.currentTime);

    switch (prop) {
      case 'ready':
      case 'up':  // alias for 'ready'
        return resolved.isReady ? 1 : 0;
      case 'remains':
        return resolved.remains;
      case 'duration':
        return resolved.duration;
      case 'full_recharge_time':
        return resolved.fullRechargeTime;
      default:
        throw new AplError(`Unknown cooldown property '${prop}' in path: ${path.join('.')}`);
    }
  }

  // -------------------------------------------------------------------------
  // talent.<name> or talent.<name>.enabled
  // -------------------------------------------------------------------------
  if (root === 'talent') {
    const talentName = rest.length === 1
      ? rest[0]
      : rest.length === 2 && rest[1] === 'enabled'
        ? rest[0]
        : null;
    if (talentName !== null) return state.talents.has(talentName) ? 1 : 0;
    throw new AplError(`Invalid talent path: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // combo_strike
  // -------------------------------------------------------------------------
  if (root === 'combo_strike') {
    if (rest.length !== 0) {
      throw new AplError(`Unexpected segments after combo_strike: ${path.join('.')}`);
    }
    if (ctx.candidateAbility === undefined) {
      throw new AplError('combo_strike requires ctx.candidateAbility to be set');
    }
    // SimC: is_combo_strike() checks combo_strike_actions.back(), which is the
    // last *combo-strike-eligible* action (including off-GCD abilities like
    // zenith), not the last GCD action. (sc_monk.cpp:331-345)
    return ctx.candidateAbility !== state.lastComboStrikeAbility ? 1 : 0;
  }

  // -------------------------------------------------------------------------
  // variable.<name>
  // -------------------------------------------------------------------------
  if (root === 'variable') {
    if (rest.length !== 1) {
      throw new AplError(`Invalid variable path: ${path.join('.')}`);
    }
    const varName = rest[0];
    const varValue = ctx.variables.get(varName);
    if (varValue === undefined) {
      throw new AplError(`Variable '${varName}' is not defined in EvalContext`);
    }
    return varValue;
  }

  // -------------------------------------------------------------------------
  // prev_gcd.<n>.<ability>
  // -------------------------------------------------------------------------
  if (root === 'prev_gcd') {
    if (rest.length !== 2) {
      throw new AplError(`Invalid prev_gcd path: ${path.join('.')}`);
    }
    const [nStr, ability] = rest;
    const n = parseSlotIndex(nStr);
    if (isNaN(n) || n < 1) {
      throw new AplError(`Invalid prev_gcd index '${nStr}' in: ${path.join('.')}`);
    }
    const historicalAbility = state.prevGcdAbilities[n - 1];
    return historicalAbility === ability ? 1 : 0;
  }

  // -------------------------------------------------------------------------
  // prev.<ability> — alias for checking the most recent GCD cast
  // -------------------------------------------------------------------------
  if (root === 'prev') {
    if (rest.length !== 1) {
      throw new AplError(`Invalid prev path: ${path.join('.')}`);
    }
    return state.prevGcdAbilities[0] === rest[0] ? 1 : 0;
  }

  // -------------------------------------------------------------------------
  // active_enemies
  // -------------------------------------------------------------------------
  if (root === 'active_enemies' && rest.length === 0) {
    return state.activeEnemies;
  }

  // -------------------------------------------------------------------------
  // fight_remains
  // -------------------------------------------------------------------------
  if (root === 'fight_remains' && rest.length === 0) {
    // Note: can return negative if currentTime > encounterDuration; clamp to 0
    return Math.max(0, state.encounterDuration - state.currentTime);
  }

  // -------------------------------------------------------------------------
  // time
  // -------------------------------------------------------------------------
  if (root === 'time' && rest.length === 0) {
    return state.currentTime;
  }

  // -------------------------------------------------------------------------
  // trinket.<1|2>.<property...>
  // -------------------------------------------------------------------------
  if (root === 'trinket') {
    if (rest.length < 2) {
      throw new AplError(`Incomplete trinket path: ${path.join('.')}`);
    }
    const [slotStr, ...trinketRest] = rest;
    const slot = parseSlotIndex(slotStr);
    if (slot !== 1 && slot !== 2) {
      throw new AplError(`Trinket slot must be 1 or 2, got '${slotStr}' in: ${path.join('.')}`);
    }
    const trinket = state.trinkets[slot - 1];

    // trinket.<n>.up
    if (trinketRest.length === 1 && trinketRest[0] === 'up') {
      return trinket.procActive && state.currentTime < trinket.procExpiresAt ? 1 : 0;
    }

    // trinket.<n>.cooldown.remains
    if (trinketRest.length === 2 && trinketRest[0] === 'cooldown' && trinketRest[1] === 'remains') {
      const remains = trinket.cooldownReadyAt - state.currentTime;
      return remains > 0 ? remains : 0;
    }

    // trinket.<n>.cooldown.ready
    if (trinketRest.length === 2 && trinketRest[0] === 'cooldown' && trinketRest[1] === 'ready') {
      return trinket.cooldownReadyAt <= state.currentTime ? 1 : 0;
    }

    // trinket.<n>.has_use_buff
    if (trinketRest.length === 1 && trinketRest[0] === 'has_use_buff') {
      return trinket.hasUseBuff ? 1 : 0;
    }

    // trinket.<n>.is.<name>
    if (trinketRest.length === 2 && trinketRest[0] === 'is') {
      return trinket.itemName === trinketRest[1] ? 1 : 0;
    }

    throw new AplError(`Unknown trinket sub-path '${trinketRest.join('.')}' in: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // target.<property>
  // -------------------------------------------------------------------------
  if (root === 'target') {
    // target.time_to_die — treat same as fight_remains for single-target
    if (rest.length === 1 && rest[0] === 'time_to_die') {
      return Math.max(0, state.encounterDuration - state.currentTime);
    }
    // target.health.pct — expose GameState target health percent
    if (rest.length === 2 && rest[0] === 'health' && rest[1] === 'pct') {
      return state.targetHealthPct;
    }
    // target.debuff.casting.react — return 0 (target not casting)
    if (rest.length === 3 && rest[0] === 'debuff' && rest[1] === 'casting' && rest[2] === 'react') {
      return 0;
    }
    throw new AplError(`Unknown target property: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // fight_style.<name> — default single-target validation uses Patchwerk.
  // -------------------------------------------------------------------------
  if (root === 'fight_style') {
    if (rest.length === 1) {
      switch (rest[0]) {
        case 'patchwerk':
          return 1;
        case 'dungeonroute':
        case 'dungeonslice':
          return 0;
        default:
          throw new AplError(`Unknown fight_style property: ${path.join('.')}`);
      }
    }
    throw new AplError(`Unknown fight_style property: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // gcd.<property>
  // -------------------------------------------------------------------------
  if (root === 'gcd') {
    // gcd.max — haste-scaled base GCD (SimC: base_gcd × attack_haste, min 750ms).
    // See action.cpp:3747. base_gcd is always 1.5s; spec aura 1258122 eff#8
    // modifies individual trigger_gcd, not base_gcd.
    if (rest.length === 1 && rest[0] === 'max') {
      return state.getGcdMax?.() ?? 1.5;
    }
    throw new AplError(`Unknown gcd property: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // movement.<property>
  // -------------------------------------------------------------------------
  if (root === 'movement') {
    // movement.distance — return 0 (stationary target)
    if (rest.length === 1 && rest[0] === 'distance') {
      return 0;
    }
    throw new AplError(`Unknown movement property: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // pet.<name>.<property>
  // -------------------------------------------------------------------------
  if (root === 'pet') {
    // pet.<name>.active — return 0 (pets not modelled beyond buff tracking)
    if (rest.length === 2 && rest[1] === 'active') {
      return 0;
    }
    throw new AplError(`Unknown pet property: ${path.join('.')}`);
  }

  // -------------------------------------------------------------------------
  // Unknown — strict mode
  // -------------------------------------------------------------------------
  throw new AplError(`Unknown property path: ${path.join('.')}`);
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate an APL AST node against the provided game state and context.
 *
 * @param node  - AST node produced by `parse()`.
 * @param state - Current game state snapshot.
 * @param ctx   - Evaluation context (candidate ability, variables).
 * @returns The numeric result of the expression.
 * @throws {AplError} For unknown property paths or missing required context.
 * @note Callers must check for NaN/Infinity if they use division operators
 *       in contexts where the divisor may be zero.
 */
export function evaluate(node: AstNode, state: GameState, ctx: EvalContext): number {
  switch (node.kind) {
    case 'NumberLiteral':
      return node.value;

    case 'PropertyAccess':
      return resolveProperty(node.path, state, ctx);

    case 'UnaryOp': {
      const operand = evaluate(node.operand, state, ctx);
      switch (node.op) {
        case '!':
          return operand !== 0 ? 0 : 1;
        case '-':
          return -operand;
        case '@':
          return Math.abs(operand);
      }
      throw new AplError(`Unknown unary operator: ${(node as { op: string }).op}`);
    }

    case 'BinaryOp': {
      // Short-circuit logical operators to avoid evaluating unknown paths
      // in unreachable branches.
      if (node.op === '&') {
        const left = evaluate(node.left, state, ctx);
        if (left === 0) return 0;
        return evaluate(node.right, state, ctx) !== 0 ? 1 : 0;
      }
      if (node.op === '|') {
        const left = evaluate(node.left, state, ctx);
        if (left !== 0) return 1;
        return evaluate(node.right, state, ctx) !== 0 ? 1 : 0;
      }

      const left = evaluate(node.left, state, ctx);
      const right = evaluate(node.right, state, ctx);

      switch (node.op) {
        // Arithmetic
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '%':
          if (right === 0) throw new AplError('Integer division by zero');
          return Math.trunc(left / right); // integer division
        case '%%':
          if (right === 0) throw new AplError('Modulo by zero');
          return left % right;             // modulo

        // Comparison → 0 or 1
        case '>':  return left > right ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        case '<':  return left < right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '=':  return left === right ? 1 : 0;
        case '!=': return left !== right ? 1 : 0;

        // XOR
        case '^': {
          const lBool = left !== 0;
          const rBool = right !== 0;
          return (lBool !== rBool) ? 1 : 0;
        }

        default:
          throw new AplError(`Unknown binary operator: ${(node as { op: string }).op}`);
      }
    }
  }
  throw new AplError(`Unknown node kind: ${(node as { kind: string }).kind}`);
}

export function normalizeAplBuffName(name: string): string {
  switch (name) {
    case 'combo_breaker':
      return 'blackout_reinforcement';
    case 'dance_of_chiji':
      return 'dance_of_chi_ji';
    case 'zenith':
      return 'zenith';
    default:
      return name;
  }
}
