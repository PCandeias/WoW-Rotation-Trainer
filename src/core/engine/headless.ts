/**
 * Headless Mode APL-bot — Stage 3.10 of the WoW Rotation Trainer.
 *
 * `runHeadless(config)` runs a full encounter instantly without any UI,
 * rAF, or wall-clock. The APL bot evaluates the action list on every
 * GCD_READY event, selects the first valid action, and executes it.
 */

import { createGameState } from './gameState';
import type { EncounterConfig, GameStateSnapshot } from './gameState';
import { SimEventQueue, EventType } from './eventQueue';
import { createRng } from './rng';
import type { RngInstance } from './rng';
import { executeAbility, getAbilityFailReason, getEffectiveChiCost, processAbilityCast } from './executor';
import {
  captureAutoAttackSpeedSnapshot,
  initAutoAttacks,
  isCurrentSwingEvent,
  processAutoAttack,
  rescheduleAutoAttacksForSpeedChange,
} from './autoAttack';
import { processChannelTickDetailed, processChannelEnd } from './channel';
import { processDotTickDetailed } from './dot';
import {
  clearQueuedAbility,
  consumeQueuedAbility,
  isQueuedAbilityExpiredAt,
  peekQueuedAbility,
} from './spellQueue';
import type { SpellDef } from '../data/spells';
import { spellRequiresGcdReady } from '../data/spells';
import { spellUsableDuringCurrentGcd } from '../data/spells';
import { parseActionLists } from '../apl/actionList';
import type { ActionList, CastAction, VariableAction } from '../apl/actionList';
import { evaluate } from '../apl/evaluator';
import type { EvalContext } from '../apl/evaluator';
import type { CharacterProfile } from '../data/profileParser';
import { expireSharedPlayerBuff } from '../shared/player_effects';
import type { SpecRuntime } from '../runtime/spec_runtime';
import { resolveSpecRuntime } from '../runtime/spec_registry';
import type { DebugLine } from './debug_logger';
import {
  fmtPerforms,
  fmtHits,
  fmtTick,
  fmtChiSpend,
  fmtChiGain,
  fmtBuffGain,
  fmtBuffRefresh,
  fmtBuffExpire,
  fmtScheduleReady,
  fmtAplTraversal,
  fmtAplSkip,
  resolveSpellId,
} from './debug_logger';

function getActionLineCooldownName(action: CastAction): string | null {
  const lineCooldown = action.params?.line_cd == null ? Number.NaN : Number.parseFloat(action.params.line_cd);
  if (!Number.isFinite(lineCooldown) || lineCooldown <= 0) {
    return null;
  }
  return `line_cd_${action.ability}`;
}

function getActionLineCooldownDuration(action: CastAction): number | null {
  const lineCooldown = action.params?.line_cd == null ? Number.NaN : Number.parseFloat(action.params.line_cd);
  if (!Number.isFinite(lineCooldown) || lineCooldown <= 0) {
    return null;
  }
  return lineCooldown;
}

function getActionLineCooldownRemains(action: CastAction, state: ReturnType<typeof createGameState>): number {
  const cooldownName = getActionLineCooldownName(action);
  return cooldownName == null ? 0 : state.getCooldownRemains(cooldownName);
}

function applyActionLineCooldown(action: CastAction, state: ReturnType<typeof createGameState>): void {
  const cooldownName = getActionLineCooldownName(action);
  const duration = getActionLineCooldownDuration(action);
  if (cooldownName == null || duration == null) {
    return;
  }
  state.cooldowns.set(cooldownName, { readyAt: state.currentTime + duration });
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HeadlessConfig {
  profile: CharacterProfile;
  encounter: EncounterConfig; // { duration: number, activeEnemies?: number }
  seed: number;               // RNG seed for determinism
  apl?: string;               // APL text (if omitted, loads monk_windwalker.simc)
  runtime?: SpecRuntime;
  latencyModel?: HeadlessLatencyModel;
  readyMode?: HeadlessReadyMode;
  /** Called with each formatted SimC-style debug line (no trailing newline). */
  onDebugLine?: DebugLine;
  /**
   * Enable APL decision trace (debug level).
   * Non-trace lines fire whenever onDebugLine is set.
   * APL trace lines fire only when debug === true.
   */
  debug?: boolean;
}

export type HeadlessReadyMode = 'poll' | 'event';

export interface HeadlessLatencyModel {
  queueLag: number;
  queueLagStddev: number;
  gcdLag: number;
  gcdLagStddev: number;
  channelLag: number;
  channelLagStddev: number;
  strictGcdQueue: boolean;
  queueGcdReduction?: number;
}

export interface CastRecord {
  time: number;
  spellId: string;
  damage: number;
  isComboStrike: boolean;
}

export interface ActionSequenceEntry {
  time: number;
  spellId: string;
}

export interface WaitSequenceEntry {
  time: number;
  wait: number;
}

export type ForegroundTimelineEntry = ActionSequenceEntry | WaitSequenceEntry;

interface ForegroundWaitState {
  token: number;
  startedAt: number;
}

type ForegroundReadyReason =
  | 'initial'
  | 'post_execute'
  | 'idle_poll'
  | 'stimulus'
  | 'resource_threshold'
  | 'channel_poll'
  | 'channel_end'
  | 'queued_action'
  | 'strict_queue';

interface PendingForegroundReady {
  token: number;
  time: number;
  reason: ForegroundReadyReason;
}

interface PendingQueuedAbilityFire {
  token: number;
  time: number;
}

function getPendingForegroundReadyToken(pending: PendingForegroundReady | null): number | undefined {
  return pending?.token;
}

function getPendingQueuedAbilityFireToken(pending: PendingQueuedAbilityFire | null): number | undefined {
  return pending?.token;
}

export interface SpellEventEntry {
  time: number;
  spellId: string;
  damage: number;
  isCrit: boolean;
  outcome: 'landed' | 'miss' | 'dodge' | 'parry';
}

export interface SpellStats {
  casts: number;
  damage: number;
  /** Number of casts that landed as critical strikes. */
  crits: number;
  misses: number;
  dodges: number;
  parries: number;
  /** Total chi gained by this ability (gross, before cost). */
  chiGained: number;
  /** Total energy spent by this ability (execution-side spend, before refunds/gains). */
  energySpent: number;
  /** Total chi spent by this ability (effective chi cost including reductions). */
  chiSpent: number;
  /** Landed non-crit event count. */
  hitEvents: number;
  /** Sum of landed non-crit event damage. */
  hitDamage: number;
  /** Sum of landed crit event damage. */
  critDamage: number;
}

export interface SimResult {
  totalDamage: number;
  dps: number;                  // totalDamage / config.encounter.duration
  castLog: CastRecord[];
  /** Foreground action sequence (successful executeAbility casts only, no auto-attacks/impacts). */
  actionSequence: ActionSequenceEntry[];
  /** Foreground timeline including successful casts and explicit waits. */
  timelineSequence: ForegroundTimelineEntry[];
  /** Timestamped resolved spell events (casts, ticks, pending outcomes), for diagnostics. */
  spellEvents: SpellEventEntry[];
  encounterDuration: number;
  finalState: GameStateSnapshot;
  /** Per-ability cast counts, damage totals, crit counts, and chi gained, keyed by spellId. */
  damageBySpell: Record<string, SpellStats>;
  /** Total action execute-time occupancy by ability, in seconds. */
  executeTimeBySpell: Record<string, number>;
  /** Total chi wasted (generated while at cap). */
  chiWasted: number;
  /** Total energy wasted while capped. */
  energyWasted: number;
  /**
   * Total simulation time the player spent idle (no castable ability available).
    * Includes explicit foreground waits plus post-wake ready polling delay.
   * Comparable to SimC's collected_data.waiting_time.
   */
  waitingTime: number;
  /**
   * Total uptime in seconds for each buff that was ever applied during the simulation.
   * Keyed by buffId. Divide by encounterDuration to get the uptime fraction (0–1).
   */
  buffUptimes: Record<string, number>;
  /**
   * Total uptime in seconds for each primary-target debuff that was ever applied.
   * Keyed by buffId. Divide by encounterDuration to get the uptime fraction (0–1).
   */
  targetDebuffUptimes: Record<string, number>;
  /** Number of BUFF_APPLY events seen for each buffId. */
  buffApplyCounts: Record<string, number>;
  /** Total seconds spent channeling per ability (summed actual active time). */
  channelTimeBySpell: Record<string, number>;
  /** Per-second trainer timelines (index = elapsed second, 0-based). */
  damageTimelineBySecond: number[];
  resourceTimelineBySecond: Record<string, number[]>;
  wasteTimelineBySecond: Record<string, number[]>;
  /** Per-second Tigereye Brew (rank 1) stack count (forward-filled). */
  tebStacksTimelineBySecond: number[];
  /** Per-second stack counts for each buff that was observed during the run. */
  buffStacksTimelineBySecond: Record<string, number[]>;
  /** Per-second stack counts for each primary-target debuff that was observed during the run. */
  targetDebuffStacksTimelineBySecond: Record<string, number[]>;
  /** Per-second base Attack Power timeline (excludes WEAPON_MAINHAND AP term). */
  attackPowerTimelineBySecond: number[];
  /** Per-second WEAPON_MAINHAND Attack Power timeline (base AP + weapon AP term). */
  weaponAttackPowerTimelineBySecond: number[];
  /** Per-second Crit % timeline. */
  critPctTimelineBySecond: number[];
  /** Per-second Haste % timeline. */
  hastePctTimelineBySecond: number[];
  /** Per-second Mastery % timeline. */
  masteryPctTimelineBySecond: number[];
  /** Per-second Versatility % timeline. */
  versPctTimelineBySecond: number[];
}

function recordSpellStats(
  damageBySpell: Record<string, SpellStats>,
  spellId: string,
  damage: number,
  casts = 0,
  isCrit = false,
  chiGained = 0,
  outcome: 'landed' | 'miss' | 'dodge' | 'parry' = 'landed',
): void {
  const entry = damageBySpell[spellId] ?? {
    casts: 0,
    damage: 0,
    crits: 0,
    misses: 0,
    dodges: 0,
    parries: 0,
    chiGained: 0,
    energySpent: 0,
    chiSpent: 0,
    hitEvents: 0,
    hitDamage: 0,
    critDamage: 0,
  };
  entry.casts += casts;
  entry.damage += damage;
  if (outcome === 'miss') entry.misses += casts;
  if (outcome === 'dodge') entry.dodges += casts;
  if (outcome === 'parry') entry.parries += casts;
  // Only record per-hit stats for events that actually deal damage.
  // Channeled spell cast events have damage=0 and would dilute avg_hit.
  if (outcome === 'landed' && damage > 0) {
    if (isCrit) {
      entry.crits += 1;
      entry.critDamage += damage;
    } else {
      entry.hitEvents += 1;
      entry.hitDamage += damage;
    }
  }
  entry.chiGained += chiGained;
  damageBySpell[spellId] = entry;
}

function addSpellResourceTotals(
  damageBySpell: Record<string, SpellStats>,
  spellId: string,
  resources: { energySpent?: number; chiSpent?: number },
): void {
  const entry = damageBySpell[spellId] ?? {
    casts: 0,
    damage: 0,
    crits: 0,
    misses: 0,
    dodges: 0,
    parries: 0,
    chiGained: 0,
    energySpent: 0,
    chiSpent: 0,
    hitEvents: 0,
    hitDamage: 0,
    critDamage: 0,
  };
  entry.energySpent += resources.energySpent ?? 0;
  entry.chiSpent += resources.chiSpent ?? 0;
  damageBySpell[spellId] = entry;
}

const SIMC_DEFAULT_COOLDOWN_TOLERANCE = 0.25;
const SIMC_READY_POLL_MEAN = 0.1;
const SIMC_READY_POLL_STDDEV = 0.01;

function sampleNormal(rng: RngInstance, mean: number, stddev: number): number {
  if (stddev <= 0) {
    return mean;
  }

  const u1 = Math.max(Number.EPSILON, rng.next());
  const u2 = rng.next();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stddev;
}

function sampleNonNegativeNormal(rng: RngInstance, mean: number, stddev: number): number {
  if (stddev <= 0) {
    return Math.max(0, mean);
  }

  for (let attempts = 0; attempts < 32; attempts += 1) {
    const sample = sampleNormal(rng, mean, stddev);
    if (sample >= 0) {
      return sample;
    }
  }

  return Math.max(0, mean);
}

function sampleGcdLag(latencyModel: HeadlessLatencyModel | undefined, rng: RngInstance): number {
  if (!latencyModel) {
    return 0;
  }

  return sampleNonNegativeNormal(rng, latencyModel.gcdLag, latencyModel.gcdLagStddev);
}

function sampleChannelLag(latencyModel: HeadlessLatencyModel | undefined, rng: RngInstance): number {
  if (!latencyModel) {
    return 0;
  }

  return sampleNonNegativeNormal(rng, latencyModel.channelLag, latencyModel.channelLagStddev);
}

function sampleQueueLag(latencyModel: HeadlessLatencyModel | undefined, rng: RngInstance): number {
  if (!latencyModel) {
    return 0;
  }

  return sampleNonNegativeNormal(rng, latencyModel.queueLag, latencyModel.queueLagStddev);
}

function sampleForegroundReadyLag(latencyModel: HeadlessLatencyModel | undefined, rng: RngInstance): number {
  if (!latencyModel) {
    return 0;
  }

  if (latencyModel.strictGcdQueue) {
    return sampleGcdLag(latencyModel, rng);
  }

  return sampleQueueLag(latencyModel, rng);
}

function getQueueGcdReduction(latencyModel: HeadlessLatencyModel | undefined): number {
  return latencyModel?.queueGcdReduction ?? 0.1;
}

function sampleReadyPollDelay(rng: RngInstance): number {
  return sampleNonNegativeNormal(rng, SIMC_READY_POLL_MEAN, SIMC_READY_POLL_STDDEV);
}

interface SelectedAction {
  action: CastAction;
  spell: SpellDef;
}

function scheduleInitialTimedBuffExpiryEvents(
  state: ReturnType<typeof createGameState>,
  queue: SimEventQueue,
  encounterDuration: number,
): void {
  for (const [buffId, buff] of state.buffs) {
    if (buff.expiresAt > 0 && buff.expiresAt < encounterDuration) {
      queue.push({ type: EventType.BUFF_EXPIRE, time: buff.expiresAt, buffId });
    }
  }
}

function isCurrentBuffExpireEvent(
  state: ReturnType<typeof createGameState>,
  buffId: string,
): boolean {
  const buff = state.buffs.get(buffId);
  return buff !== undefined && buff.expiresAt > 0 && buff.expiresAt <= state.currentTime;
}

// ---------------------------------------------------------------------------
// applyVariable
// ---------------------------------------------------------------------------

function applyVariable(
  action: VariableAction,
  state: ReturnType<typeof createGameState>,
  ctx: EvalContext
): void {
  const current = ctx.variables.get(action.name) ?? 0;
  let value = 0;
  if (action.valueExpr) {
    try {
      value = evaluate(action.valueExpr, state, ctx);
    } catch {
      return;
    }
  }
  switch (action.op) {
    case 'set':   ctx.variables.set(action.name, value); break;
    case 'add':   ctx.variables.set(action.name, current + value); break;
    case 'sub':   ctx.variables.set(action.name, current - value); break;
    case 'mul':   ctx.variables.set(action.name, current * value); break;
    case 'div':   ctx.variables.set(action.name, value !== 0 ? current / value : current); break;
    case 'min':   ctx.variables.set(action.name, Math.min(current, value)); break;
    case 'max':   ctx.variables.set(action.name, Math.max(current, value)); break;
    case 'pow':   ctx.variables.set(action.name, Math.pow(current, value)); break;
    case 'reset': ctx.variables.set(action.name, 0); break;
  }
}

// ---------------------------------------------------------------------------
// walkActionList
// ---------------------------------------------------------------------------

type ActionSelectionMode = 'any' | 'off-gcd' | 'on-gcd' | 'non-gcd';

function shouldApplyAsPersistentPrecombatBuff(spell: SpellDef, encounterDuration: number): boolean {
  return Boolean(
    spell.buffApplied
    && (spell.buffDuration ?? 0) >= encounterDuration,
  );
}

function createPrecombatEvalContext(
  actionLists: ActionList[],
  state: ReturnType<typeof createGameState>,
): EvalContext {
  const ctx: EvalContext = { variables: new Map() };
  const precombatList = actionLists.find((entry) => entry.name === 'precombat');
  if (!precombatList) {
    return ctx;
  }

  for (const action of precombatList.actions) {
    if (action.type === 'variable') {
      applyVariable(action, state, ctx);
    }
  }

  return ctx;
}

function precombatLeadTime(spell: SpellDef, state: ReturnType<typeof createGameState>): number {
  const hasteMultiplier = 1 + state.getHastePercent() / 100;
  if (spell.isChanneled) {
    return spell.channelDuration / hasteMultiplier;
  }
  return (spell.castTime ?? 0) / hasteMultiplier;
}

function processPrecombatEventsUntilPull(
  state: ReturnType<typeof createGameState>,
  queue: SimEventQueue,
  rng: RngInstance,
): void {
  while (!queue.isEmpty() && queue.peek().time <= 0) {
    const event = queue.pop();
    state.currentTime = event.time;

    switch (event.type) {
      case EventType.CAST_START:
      case EventType.CHANNEL_START:
      case EventType.COOLDOWN_READY:
      case EventType.BUFF_APPLY:
      case EventType.BUFF_STACK_CHANGE:
        break;
      case EventType.ABILITY_CAST:
        void processAbilityCast(event, state, queue, rng);
        break;
      case EventType.CHANNEL_TICK:
        void processChannelTickDetailed(event, state, rng, queue);
        break;
      case EventType.DOT_TICK:
        void processDotTickDetailed(event, state, rng, queue);
        break;
      case EventType.CHANNEL_END:
        processChannelEnd(event, state, queue, rng);
        break;
      case EventType.BUFF_EXPIRE:
        if (isCurrentBuffExpireEvent(state, event.buffId)) {
          expireSharedPlayerBuff(state, event.buffId);
        }
        break;
      case EventType.DELAYED_SPELL_IMPACT:
      case EventType.TIGEREYE_BREW_TICK:
      case EventType.COMBAT_WISDOM_TICK:
      case EventType.AUTO_ATTACK_MH:
      case EventType.AUTO_ATTACK_OH:
      case EventType.RESOURCE_THRESHOLD_READY:
      case EventType.ENERGY_CAP_CHECK:
      case EventType.GCD_READY:
      case EventType.OFF_GCD_READY:
      case EventType.PLAYER_INPUT:
      case EventType.PLAYER_CANCEL:
      case EventType.QUEUED_ABILITY_FIRE:
      case EventType.ENCOUNTER_START:
      case EventType.ENCOUNTER_END:
        throw new Error(`Unsupported precombat event '${EventType[event.type]}' at ${event.time.toFixed(3)}s`);
      default:
        event satisfies never;
        throw new Error(`Unhandled precombat event '${String((event as { type: number }).type)}'`);
    }
  }
}

function applyPrecombatActions(
  state: ReturnType<typeof createGameState>,
  actionLists: ActionList[],
  runtime: SpecRuntime,
  rng: RngInstance,
  encounterDuration: number,
): void {
  const precombatList = actionLists.find((entry) => entry.name === 'precombat');
  if (!precombatList) {
    return;
  }

  const scratchQueue = new SimEventQueue();
  const ctx = createPrecombatEvalContext(actionLists, state);

  for (const action of precombatList.actions) {
    if (action.type === 'variable') {
      continue;
    }

    if (action.type !== 'cast') {
      continue;
    }

    const spell = runtime.resolveActionSpell(action, state);
    if (!spell) {
      continue;
    }

    if (action.condition) {
      try {
        const value = evaluate(action.condition.ast, state, { ...ctx, candidateAbility: spell.name });
        if (value === 0) {
          continue;
        }
      } catch {
        continue;
      }
    }

    if (!shouldApplyAsPersistentPrecombatBuff(spell, encounterDuration)) {
      const leadTime = precombatLeadTime(spell, state);
      state.currentTime = -leadTime;
      state.gcdReady = state.currentTime;
      const result = executeAbility(spell, state, scratchQueue, rng);
      if (!result.success) {
        state.currentTime = 0;
        state.gcdReady = 0;
        continue;
      }
      processPrecombatEventsUntilPull(state, scratchQueue, rng);
      state.currentTime = 0;
      state.gcdReady = 0;
      continue;
    }

    if (getActionLineCooldownRemains(action, state) > 0) {
      continue;
    }

    const result = executeAbility(spell, state, scratchQueue, rng);
    if (!result.success) {
      continue;
    }
    applyActionLineCooldown(action, state);

    state.gcdReady = 0;
  }

  state.gcdReady = 0;
}

function walkActionList(
  list: ActionList,
  allLists: ActionList[],
  state: ReturnType<typeof createGameState>,
  ctx: EvalContext,
  runtime: SpecRuntime,
  mode: ActionSelectionMode,
  logger?: DebugLine,
  playerName?: string,
  time?: number,
): SelectedAction | null {
  if (logger) {
    logger(fmtAplTraversal(time ?? 0, playerName ?? 'unknown', list.name, list.actions.length, mode));
  }

  for (const action of list.actions) {
    if (action.type === 'cast') {
      const spell = runtime.resolveActionSpell(action, state);
      if (!spell) continue; // unknown spell

      // Evaluate target_if selectors so unsupported selector expressions do not
      // silently pass. We currently model a single effective target, so the
      // selector value is validated but does not change target choice.
      if (action.targetIf) {
        try {
          evaluate(action.targetIf.selector.ast, state, ctx);
        } catch {
          continue; // AplError: skip this action
        }
      }

      // Evaluate condition with candidateAbility set for combo_strike checks
      if (action.condition) {
        const castCtx: EvalContext = { ...ctx, candidateAbility: spell.name };
        try {
          const val = evaluate(action.condition.ast, state, castCtx);
          if (val === 0) {
            if (logger) {
              logger(fmtAplSkip(time ?? 0, playerName ?? 'unknown', spell.name, 'condition false'));
            }
            continue; // condition false
          }
        } catch {
          continue; // AplError: skip this action
        }
      }

      const lineCooldownRemains = getActionLineCooldownRemains(action, state);
      if (lineCooldownRemains > 0) {
        if (logger) {
          logger(fmtAplSkip(time ?? 0, playerName ?? 'unknown', spell.name, 'not ready: on_line_cd'));
        }
        continue;
      }

      const failReason = getAbilityFailReason(spell, state);
      if (failReason !== undefined) {
        if (logger) {
          logger(fmtAplSkip(time ?? 0, playerName ?? 'unknown', spell.name, `not ready: ${failReason}`));
        }
        continue;
      }
      if (mode === 'off-gcd' && !spellUsableDuringCurrentGcd(spell)) continue;
      if (mode === 'on-gcd' && !spell.isOnGcd) continue;
      if (mode === 'non-gcd' && spellRequiresGcdReady(spell)) continue;

      return { action, spell };
    }

    // For non-cast actions, evaluate condition without candidateAbility
    if (action.condition) {
      try {
        const val = evaluate(action.condition.ast, state, ctx);
        if (val === 0) continue; // condition false
      } catch {
        continue; // AplError: skip this action
      }
    }

    if (action.type === 'call_list') {
      const sub = allLists.find((al) => al.name === action.listName);
      if (!sub) continue;
      const result = walkActionList(sub, allLists, state, ctx, runtime, mode, logger, playerName, time);
      if (result !== null) return result;
      if (action.callType === 'run') return null; // run_action_list stops
      continue; // call_action_list continues
    }

    if (action.type === 'variable') {
      applyVariable(action, state, ctx);
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// selectAction / pickNextAplAction
// ---------------------------------------------------------------------------

/**
 * Evaluate the APL against the given state and return the first action that
 * would fire. This is the public entry point for external callers (e.g. the
 * APL decision validator) who want to query what the trainer would choose
 * without running a full simulation.
 *
 * @param state     A fully-initialised GameState (via createGameState + runtime.initializeState).
 *                  Mutate the resource/buff/cooldown fields to reflect the desired snapshot
 *                  before calling this.
 * @param actionLists  Parsed APL from `parseActionLists()`.
 * @param runtime   The spec runtime (e.g. monk windwalker).
 * @returns         The chosen spell name and its SpellDef, or null if nothing fires.
 */
export function pickNextAplAction(
  state: ReturnType<typeof createGameState>,
  actionLists: ActionList[],
  runtime: SpecRuntime,
  mode: ActionSelectionMode = 'any',
): { spellName: string; spellId: string } | null {
  const ctx = createPrecombatEvalContext(actionLists, state);
  const defaultList = actionLists.find((al) => al.name === 'default');
  if (!defaultList) return null;

  const selected = walkActionList(defaultList, actionLists, state, ctx, runtime, mode, undefined, undefined, state.currentTime);
  if (!selected) return null;

  return { spellName: selected.spell.name, spellId: String(selected.spell.id) };
}

function selectAction(
  state: ReturnType<typeof createGameState>,
  actionLists: ActionList[],
  runtime: SpecRuntime,
  _rng: RngInstance,
  mode: ActionSelectionMode = 'any',
  logger?: DebugLine,
  playerName?: string,
): SelectedAction | null {
  // Create fresh EvalContext for each APL pass while preserving precombat variable seeds.
  const ctx = createPrecombatEvalContext(actionLists, state);

  // Find the 'default' action list
  const defaultList = actionLists.find((al) => al.name === 'default');
  if (!defaultList) return null;

  return walkActionList(defaultList, actionLists, state, ctx, runtime, mode, logger, playerName, state.currentTime);
}

interface QueueableTimeSearchResult {
  earliestTime: number | null;
  terminated: boolean;
}

function getCooldownTolerance(latencyModel: HeadlessLatencyModel): number {
  return latencyModel.strictGcdQueue ? 0 : SIMC_DEFAULT_COOLDOWN_TOLERANCE;
}

function getOffGcdQueueableTimeForSpell(
  action: CastAction,
  spell: SpellDef,
  state: ReturnType<typeof createGameState>,
  latencyModel: HeadlessLatencyModel,
): number | null {
  const lineCooldownRemains = getActionLineCooldownRemains(action, state);
  if (lineCooldownRemains > 0) {
    const queueableOffset = Math.max(0, lineCooldownRemains - getCooldownTolerance(latencyModel));
    return state.currentTime + queueableOffset;
  }

  if (!spellUsableDuringCurrentGcd(spell)) {
    return null;
  }

  if (spellRequiresGcdReady(spell)) {
    return null;
  }

  const failReason = getAbilityFailReason(spell, state);
  if (failReason === undefined) {
    return state.currentTime;
  }

  if (failReason !== 'on_cooldown') {
    return null;
  }

  const cooldownRemains = state.getCooldownRemains(spell.name);
  const queueableOffset = Math.max(0, cooldownRemains - getCooldownTolerance(latencyModel));
  return state.currentTime + queueableOffset;
}

function mergeQueueableTimes(current: number | null, candidate: number | null): number | null {
  if (candidate === null) {
    return current;
  }

  if (current === null) {
    return candidate;
  }

  return Math.min(current, candidate);
}

function findEarliestOffGcdQueueableTimeInList(
  list: ActionList,
  allLists: ActionList[],
  state: ReturnType<typeof createGameState>,
  ctx: EvalContext,
  runtime: SpecRuntime,
  latencyModel: HeadlessLatencyModel,
): QueueableTimeSearchResult {
  let earliestTime: number | null = null;

  for (const action of list.actions) {
    if (action.type === 'cast') {
      const spell = runtime.resolveActionSpell(action, state);
      if (!spell) {
        continue;
      }

      if (action.targetIf) {
        try {
          evaluate(action.targetIf.selector.ast, state, ctx);
        } catch {
          continue;
        }
      }

      if (action.condition) {
        const castCtx: EvalContext = { ...ctx, candidateAbility: spell.name };
        try {
          const value = evaluate(action.condition.ast, state, castCtx);
          if (value === 0) {
            continue;
          }
        } catch {
          continue;
        }
      }

      earliestTime = mergeQueueableTimes(
        earliestTime,
        getOffGcdQueueableTimeForSpell(action, spell, state, latencyModel),
      );
      continue;
    }

    if (action.condition) {
      try {
        const value = evaluate(action.condition.ast, state, ctx);
        if (value === 0) {
          continue;
        }
      } catch {
        continue;
      }
    }

    if (action.type === 'call_list') {
      const subList = allLists.find((entry) => entry.name === action.listName);
      if (!subList) {
        continue;
      }

      const result = findEarliestOffGcdQueueableTimeInList(subList, allLists, state, ctx, runtime, latencyModel);
      earliestTime = mergeQueueableTimes(earliestTime, result.earliestTime);

      if (action.callType === 'run' || result.terminated) {
        return { earliestTime, terminated: true };
      }

      continue;
    }

    if (action.type === 'variable') {
      applyVariable(action, state, ctx);
    }
  }

  return { earliestTime, terminated: false };
}

function findEarliestOffGcdQueueableTime(
  state: ReturnType<typeof createGameState>,
  actionLists: ActionList[],
  runtime: SpecRuntime,
  latencyModel: HeadlessLatencyModel,
): number | null {
  const defaultList = actionLists.find((entry) => entry.name === 'default');
  if (!defaultList) {
    return null;
  }

  const ctx = createPrecombatEvalContext(actionLists, state);
  return findEarliestOffGcdQueueableTimeInList(defaultList, actionLists, state, ctx, runtime, latencyModel).earliestTime;
}

function getForegroundEnergyThresholdTimeForSpell(
  action: CastAction,
  spell: SpellDef,
  state: ReturnType<typeof createGameState>,
): number | null {
  if (getActionLineCooldownRemains(action, state) > 0) {
    return null;
  }

  const failReason = getAbilityFailReason(spell, state);
  if (failReason !== 'insufficient_energy') {
    return null;
  }

  const energyRegenRate = state.energyRegenRate;
  if (energyRegenRate <= 0) {
    return null;
  }

  const missingEnergy = spell.energyCost - state.getEnergy();
  if (missingEnergy <= 0) {
    return state.currentTime;
  }

  return state.currentTime + (missingEnergy / energyRegenRate);
}

function findEarliestForegroundEnergyThresholdInList(
  list: ActionList,
  allLists: ActionList[],
  state: ReturnType<typeof createGameState>,
  ctx: EvalContext,
  runtime: SpecRuntime,
): QueueableTimeSearchResult {
  let earliestTime: number | null = null;

  for (const action of list.actions) {
    if (action.type === 'cast') {
      const spell = runtime.resolveActionSpell(action, state);
      if (!spell) {
        continue;
      }

      if (action.targetIf) {
        try {
          evaluate(action.targetIf.selector.ast, state, ctx);
        } catch {
          continue;
        }
      }

      if (action.condition) {
        const castCtx: EvalContext = { ...ctx, candidateAbility: spell.name };
        try {
          const value = evaluate(action.condition.ast, state, castCtx);
          if (value === 0) {
            continue;
          }
        } catch {
          continue;
        }
      }

      earliestTime = mergeQueueableTimes(
        earliestTime,
        getForegroundEnergyThresholdTimeForSpell(action, spell, state),
      );
      continue;
    }

    if (action.condition) {
      try {
        const value = evaluate(action.condition.ast, state, ctx);
        if (value === 0) {
          continue;
        }
      } catch {
        continue;
      }
    }

    if (action.type === 'call_list') {
      const subList = allLists.find((entry) => entry.name === action.listName);
      if (!subList) {
        continue;
      }

      const result = findEarliestForegroundEnergyThresholdInList(subList, allLists, state, ctx, runtime);
      earliestTime = mergeQueueableTimes(earliestTime, result.earliestTime);

      if (action.callType === 'run' || result.terminated) {
        return { earliestTime, terminated: true };
      }

      continue;
    }

    if (action.type === 'variable') {
      applyVariable(action, state, ctx);
    }
  }

  return { earliestTime, terminated: false };
}

function findEarliestForegroundEnergyThresholdTime(
  state: ReturnType<typeof createGameState>,
  actionLists: ActionList[],
  runtime: SpecRuntime,
): number | null {
  const defaultList = actionLists.find((entry) => entry.name === 'default');
  if (!defaultList) {
    return null;
  }

  const ctx = createPrecombatEvalContext(actionLists, state);
  return findEarliestForegroundEnergyThresholdInList(defaultList, actionLists, state, ctx, runtime).earliestTime;
}

function scheduleOffGcdReady(
  state: ReturnType<typeof createGameState>,
  queue: SimEventQueue,
  actionLists: ActionList[],
  runtime: SpecRuntime,
  encounterDuration: number,
  latencyModel: HeadlessLatencyModel | undefined,
  rng: RngInstance,
  nextForegroundReadyTime: number,
): void {
  if (!latencyModel) {
    return;
  }

  if (state.getActiveChannel()) {
    return;
  }

  if (state.gcdReady <= state.currentTime) {
    return;
  }

  const earliestQueueableTime = findEarliestOffGcdQueueableTime(state, actionLists, runtime, latencyModel);
  if (earliestQueueableTime === null || earliestQueueableTime >= nextForegroundReadyTime) {
    return;
  }

  const nextPollTime = Math.max(
    state.currentTime + sampleQueueLag(latencyModel, rng),
    earliestQueueableTime,
  );
  if (nextPollTime >= nextForegroundReadyTime || nextPollTime >= encounterDuration) {
    return;
  }

  queue.push({ type: EventType.OFF_GCD_READY, time: nextPollTime });
}

// ---------------------------------------------------------------------------
// runHeadless
// ---------------------------------------------------------------------------

/**
 * Run a full encounter simulation instantly without any UI or real-time clock.
 *
 * @param config - Encounter configuration including profile, encounter params, RNG seed, and optional APL.
 * @returns SimResult containing damage totals, DPS, cast log, and final state snapshot.
 */
export function runHeadless(config: HeadlessConfig): SimResult {
  const runtime = config.runtime ?? resolveSpecRuntime(config.profile);
  const aplText = config.apl ?? runtime.defaultApl;
  const actionLists = parseActionLists(aplText);
  if (config.apl === undefined) {
    runtime.assertDefaultAplCompatibility(actionLists);
  }

  const state = createGameState(config.profile, config.encounter, runtime);
  const readyMode = config.readyMode ?? 'poll';
  state.executionHooks = {
    ...state.executionHooks,
    allowChannelInterruptByCastAttempt: (_state, activeSpellId, _nextSpell): boolean => activeSpellId !== 'fists_of_fury',
  };
  const queue = new SimEventQueue();
  const rng = createRng(config.seed);
  const castLog: CastRecord[] = [];
  const actionSequence: ActionSequenceEntry[] = [];
  const timelineSequence: ForegroundTimelineEntry[] = [];
  const spellEvents: SpellEventEntry[] = [];
  const playerName = config.profile.name;
  const targetName = 'Fluffy_Pillow';
  const logger = config.onDebugLine;
  const debugMode = config.debug === true;
  const damageBySpell: Record<string, SpellStats> = {};
  const executeTimeBySpell: Record<string, number> = {};
  const buffApplyCounts: Record<string, number> = {};
  const channelTimeBySpell: Record<string, number> = {};
  const activeChannels = new Map<number, { spellId: string; startedAt: number }>();
  const timelineLength = Math.max(1, Math.ceil(config.encounter.duration));
  const damageTimelineBySecond = Array<number>(timelineLength).fill(0);
  const energyTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const chiTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const energyWasteTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const chiWasteTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const tebStacksTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const attackPowerTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const weaponAttackPowerTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const critPctTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const hastePctTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const masteryPctTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const versPctTimelineBySecond = Array<number>(timelineLength).fill(Number.NaN);
  const buffStacksTimelineBySecond: Record<string, number[]> = {};
  const targetDebuffStacksTimelineBySecond: Record<string, number[]> = {};
  let waitingTime = 0;
  let resourceThresholdWaitToken = 0;
  let waitingForTrigger: ForegroundWaitState | null = null;
  let nextForegroundReadyToken = 0;
  let pendingForegroundReady: PendingForegroundReady | null = null;
  let nextQueuedAbilityFireToken = 0;
  let pendingQueuedAbilityFire: PendingQueuedAbilityFire | null = null;

  applyPrecombatActions(state, actionLists, runtime, rng, config.encounter.duration);

  const recordForegroundWait = (startedAt: number, duration: number): void => {
    if (!(duration > 0)) {
      return;
    }

    timelineSequence.push({
      time: startedAt,
      wait: duration,
    });
  };

  const scheduleForegroundReadyAt = (time: number, reason: ForegroundReadyReason): void => {
    const nextReadyTime = Math.max(state.currentTime, time);
    if (nextReadyTime >= config.encounter.duration) {
      return;
    }

    if (pendingForegroundReady && pendingForegroundReady.time <= nextReadyTime) {
      return;
    }

    const token = ++nextForegroundReadyToken;
    pendingForegroundReady = {
      token,
      time: nextReadyTime,
      reason,
    };
    if (logger) {
      logger(`${state.currentTime.toFixed(3)} schedule_foreground_ready(${reason}) ${nextReadyTime.toFixed(6)}`);
    }
    queue.push({ type: EventType.GCD_READY, time: nextReadyTime, token });
  };

  const scheduleQueuedAbilityFireAt = (time: number): void => {
    const nextFireTime = Math.max(state.currentTime, time);
    if (nextFireTime >= config.encounter.duration) {
      return;
    }

    if (pendingQueuedAbilityFire && pendingQueuedAbilityFire.time <= nextFireTime) {
      return;
    }

    const token = ++nextQueuedAbilityFireToken;
    pendingQueuedAbilityFire = {
      token,
      time: nextFireTime,
    };
    if (logger) {
      logger(`${state.currentTime.toFixed(3)} schedule_queued_ability_fire() ${nextFireTime.toFixed(6)}`);
    }
    queue.push({ type: EventType.QUEUED_ABILITY_FIRE, time: nextFireTime, token });
  };

  const wakeForegroundIfWaiting = (): void => {
    if (readyMode !== 'event' || !waitingForTrigger) {
      return;
    }

    if (state.getActiveChannel() || state.gcdReady > state.currentTime) {
      return;
    }

    const waitUntilWake = Math.max(0, state.currentTime - waitingForTrigger.startedAt);
    const readyDelay = sampleReadyPollDelay(rng);
    const totalWait = waitUntilWake + readyDelay;
    waitingTime += totalWait;
    recordForegroundWait(waitingForTrigger.startedAt, totalWait);
    waitingForTrigger = null;

    scheduleForegroundReadyAt(state.currentTime + readyDelay, 'stimulus');
  };

  const scheduleForegroundWait = (): void => {
    if (readyMode === 'poll') {
      const nextReadyTime = state.currentTime + sampleReadyPollDelay(rng);
      const waitDuration = Math.max(0, nextReadyTime - state.currentTime);
      waitingTime += waitDuration;
      recordForegroundWait(state.currentTime, waitDuration);
      scheduleForegroundReadyAt(nextReadyTime, 'idle_poll');
      return;
    }

    waitingForTrigger = {
      token: ++resourceThresholdWaitToken,
      startedAt: state.currentTime,
    };

    const nextEnergyThreshold = findEarliestForegroundEnergyThresholdTime(state, actionLists, runtime);
    if (nextEnergyThreshold !== null && nextEnergyThreshold < config.encounter.duration) {
      queue.push({
        type: EventType.RESOURCE_THRESHOLD_READY,
        time: nextEnergyThreshold,
        token: waitingForTrigger.token,
      });
    }
  };

  const recordSuccessfulCast = (
    spell: SpellDef,
    result: ReturnType<typeof executeAbility>,
    castStartedAt: number,
    chiBeforeExec: number,
    chiCostForSpell: number,
    energyBeforeExec: number,
    selectedSpellRecordedByPendingStat: boolean,
  ): void => {
    const selectedSpellId = spell.name;
    const chiGained = Math.max(0, state.chi - chiBeforeExec + chiCostForSpell);
    // Note: chiSpent reflects the pre-execution cost, not the net chi delta.
    // This is accurate for all current WW spells (no simultaneous refund mechanics).
    const chiSpent = Math.max(0, chiCostForSpell);
    const energySpent = Math.max(0, spell.energyCost);
    const executeTime = result.executeTime ?? (spell.isOnGcd ? Math.max(0, state.gcdReady - castStartedAt) : 0);
    executeTimeBySpell[selectedSpellId] = (executeTimeBySpell[selectedSpellId] ?? 0) + executeTime;
    castLog.push({
      time: state.currentTime,
      spellId: selectedSpellId,
      damage: result.damage,
      isComboStrike: result.isComboStrike,
    });
    actionSequence.push({
      time: state.currentTime,
      spellId: selectedSpellId,
    });
    timelineSequence.push({
      time: state.currentTime,
      spellId: selectedSpellId,
    });
    addSpellResourceTotals(damageBySpell, selectedSpellId, {
      energySpent,
      chiSpent,
    });
    if (!selectedSpellRecordedByPendingStat) {
      recordSpellStats(damageBySpell, selectedSpellId, result.damage, 1, result.isCrit, chiGained);
      pushSpellEvent({
        time: castStartedAt,
        spellId: selectedSpellId,
        damage: result.damage,
        isCrit: result.isCrit,
        outcome: 'landed',
      });
    }
    if (logger) {
      const spellId = resolveSpellId(selectedSpellId);
      const t = castStartedAt;
      logger(fmtPerforms(t, playerName, selectedSpellId, spellId, energyBeforeExec));
      if (result.damage > 0) {
        logger(fmtHits(t, playerName, selectedSpellId, spellId, targetName, result.damage, 'physical', result.isCrit ? 'crit' : 'hit'));
      }
      if (chiSpent > 0) {
        const chiAfter = state.chi;
        const lines = fmtChiSpend(t, playerName, chiSpent, chiAfter, state.chiMax, selectedSpellId, spellId);
        logger(lines[0]);
        logger(lines[1]);
      }
      if (chiGained > 0) {
        logger(fmtChiGain(t, playerName, chiGained, state.chi, state.chiMax, selectedSpellId));
      }
      const castFinishes = castStartedAt + executeTime;
      logger(fmtScheduleReady(t, playerName, selectedSpellId, castFinishes, 0));
    }
  };

  const tryExecuteSelectedAction = (selected: SelectedAction | null): SpellDef | undefined => {
    if (!selected) {
      return undefined;
    }

    const castStartedAt = state.currentTime;
    const chiBeforeExec = state.chi;
    const chiCostForSpell = getEffectiveChiCost(selected.spell, state);
    const energyBeforeExec = state.getEnergy();
    const pendingStatCountBefore = state.getPendingSpellStats().length;
    const result = executeAbility(selected.spell, state, queue, rng);
    if (!result.success) {
      return undefined;
    }
    const selectedSpellRecordedByPendingStat = state
      .getPendingSpellStats()
      .slice(pendingStatCountBefore)
      .some((pending) => pending.spellId === selected.spell.name && pending.casts > 0);

    applyActionLineCooldown(selected.action, state);
    recordSuccessfulCast(
      selected.spell,
      result,
      castStartedAt,
      chiBeforeExec,
      chiCostForSpell,
      energyBeforeExec,
      selectedSpellRecordedByPendingStat,
    );
    return selected.spell;
  };

  const resolveQueuedSpell = (spellId: string): SpellDef | undefined => (
    state.executionHooks.resolveSpellDef?.(state, spellId)
  );

  const tryExecuteSpell = (spell: SpellDef): SpellDef | undefined => {
    const castStartedAt = state.currentTime;
    const chiBeforeExec = state.chi;
    const chiCostForSpell = getEffectiveChiCost(spell, state);
    const energyBeforeExec = state.getEnergy();
    const result = executeAbility(spell, state, queue, rng);
    if (!result.success) {
      return undefined;
    }

    recordSuccessfulCast(spell, result, castStartedAt, chiBeforeExec, chiCostForSpell, energyBeforeExec, false);
    return spell;
  };

  const hasStrictQueueEligibleInput = (): SpellDef | undefined => {
    if (!config.latencyModel?.strictGcdQueue) {
      return undefined;
    }

    const queuedAbility = peekQueuedAbility(state);
    if (!queuedAbility) {
      return undefined;
    }

    const spell = resolveQueuedSpell(queuedAbility);
    if (!spell?.isOnGcd) {
      return undefined;
    }

    if (state.getActiveChannel() || state.getActiveCast()) {
      return undefined;
    }

    return spell;
  };

  const tryExecuteQueuedAbility = (fireTime: number): SpellDef | undefined => {
    const queuedAbility = peekQueuedAbility(state);
    if (!queuedAbility) {
      return undefined;
    }

    const spell = resolveQueuedSpell(queuedAbility);
    if (!spell || isQueuedAbilityExpiredAt(state, fireTime)) {
      clearQueuedAbility(state);
      return undefined;
    }

    const failReason = getAbilityFailReason(spell, state);
    if (failReason === 'channel_locked' || failReason === 'cast_locked') {
      return undefined;
    }
    if (failReason !== undefined) {
      clearQueuedAbility(state);
      return undefined;
    }

    const executed = tryExecuteSpell(spell);
    if (executed) {
      consumeQueuedAbility(state);
      return executed;
    }

    clearQueuedAbility(state);
    return undefined;
  };

  const computeForegroundReadyTime = (lastSuccessfulSpell: SpellDef | undefined): number => {
    const readyLag = lastSuccessfulSpell?.isOnGcd ? sampleForegroundReadyLag(config.latencyModel, rng) : 0;
    const strictQueuedSpell = lastSuccessfulSpell?.isOnGcd ? hasStrictQueueEligibleInput() : undefined;
    if (strictQueuedSpell) {
      return state.gcdReady - getQueueGcdReduction(config.latencyModel) + readyLag;
    }
    return state.gcdReady + readyLag;
  };

  const rescheduleStrictQueuedForegroundReady = (): void => {
    if (!config.latencyModel?.strictGcdQueue || state.currentTime >= state.gcdReady) {
      return;
    }

    if (!hasStrictQueueEligibleInput()) {
      return;
    }

    if (pendingForegroundReady && pendingForegroundReady.time < state.gcdReady) {
      return;
    }

    const readyLag = sampleForegroundReadyLag(config.latencyModel, rng);
    pendingForegroundReady = null;
    scheduleForegroundReadyAt(state.gcdReady - getQueueGcdReduction(config.latencyModel) + readyLag, 'strict_queue');
  };

  const resolveForegroundTurn = (): {
    castAnyAction: boolean;
    lastSuccessfulSpell: SpellDef | undefined;
    nextForegroundReadyTime: number | undefined;
  } => {
    waitingForTrigger = null;

    let castAnyAction = false;
    let lastSuccessfulSpell: SpellDef | undefined;
    let nextForegroundReadyTime: number | undefined;
    let attemptedQueuedAbility = false;

    while (state.gcdReady <= state.currentTime) {
      let successfulSpell: SpellDef | undefined;
      if (!attemptedQueuedAbility) {
        attemptedQueuedAbility = true;
        const queuedAbilityBeforeAttempt = peekQueuedAbility(state);
        successfulSpell = tryExecuteQueuedAbility(state.currentTime);
        const queuedAbilityAfterAttempt = peekQueuedAbility(state);
        if (
          !successfulSpell
          && (queuedAbilityBeforeAttempt === null || queuedAbilityAfterAttempt === null)
        ) {
          successfulSpell = tryExecuteSelectedAction(
            selectAction(state, actionLists, runtime, rng, 'any', debugMode ? logger : undefined, playerName),
          );
        }
      } else {
        successfulSpell = tryExecuteSelectedAction(
          selectAction(state, actionLists, runtime, rng, 'any', debugMode ? logger : undefined, playerName),
        );
      }

      if (!successfulSpell) {
        break;
      }

      castAnyAction = true;
      lastSuccessfulSpell = successfulSpell;

      if (successfulSpell.isOnGcd) {
        nextForegroundReadyTime = computeForegroundReadyTime(successfulSpell);
        scheduleOffGcdReady(
          state,
          queue,
          actionLists,
          runtime,
          config.encounter.duration,
          config.latencyModel,
          rng,
          nextForegroundReadyTime,
        );
      }

      if (peekQueuedAbility(state) === null) {
        attemptedQueuedAbility = true;
      }
    }

    return {
      castAnyAction,
      lastSuccessfulSpell,
      nextForegroundReadyTime,
    };
  };

  const scheduleAfterForegroundTurn = (
    castAnyAction: boolean,
    lastSuccessfulSpell: SpellDef | undefined,
    nextForegroundReadyTime: number | undefined,
  ): void => {
    const activeChannel = state.getActiveChannel();
    if (activeChannel) {
      if (state.gcdReady > state.currentTime && state.gcdReady < activeChannel.endsAt) {
        scheduleForegroundReadyAt(state.gcdReady, 'channel_poll');
        return;
      }

      const nextPollTime = state.currentTime + sampleReadyPollDelay(rng);
      if (nextPollTime < activeChannel.endsAt) {
        scheduleForegroundReadyAt(nextPollTime, 'channel_poll');
      }
      return;
    }

    if (state.gcdReady > state.currentTime) {
      scheduleForegroundReadyAt(nextForegroundReadyTime ?? computeForegroundReadyTime(lastSuccessfulSpell), 'post_execute');
      return;
    }

    if (!castAnyAction) {
      scheduleForegroundWait();
      return;
    }

    scheduleForegroundWait();
  };

  const getPendingForegroundReadyTime = (): number => {
    const pendingTime = pendingForegroundReady?.time;
    return typeof pendingTime === 'number' ? pendingTime : state.gcdReady;
  };

  const pushSpellEvent = (entry: SpellEventEntry): void => {
    spellEvents.push(entry);
    const second = Math.floor(entry.time);
    if (second >= 0 && second < timelineLength && entry.damage > 0 && entry.outcome === 'landed') {
      damageTimelineBySecond[second] += entry.damage;
    }
  };

  const sampleResourceAtCurrentTime = (): void => {
    const second = Math.floor(state.currentTime);
    if (second < 0 || second >= timelineLength) return;
    energyTimelineBySecond[second] = state.getEnergy();
    chiTimelineBySecond[second] = state.chi;
    energyWasteTimelineBySecond[second] = state.getTotalEnergyWasted();
    chiWasteTimelineBySecond[second] = state.chiWasted;
    tebStacksTimelineBySecond[second] = state.getBuffStacks('tigereye_brew_1');
    attackPowerTimelineBySecond[second] = state.getAttackPower();
    weaponAttackPowerTimelineBySecond[second] = state.getWeaponMainHandAttackPower();
    critPctTimelineBySecond[second] = state.getCritPercent();
    hastePctTimelineBySecond[second] = state.getHastePercent();
    masteryPctTimelineBySecond[second] = state.getMasteryPercent();
    versPctTimelineBySecond[second] = state.getVersatilityPercent();

    const activeBuffIds = new Set<string>();
    for (const [buffId, buff] of state.buffs.entries()) {
      activeBuffIds.add(buffId);
      const timeline = buffStacksTimelineBySecond[buffId]
        ?? (buffStacksTimelineBySecond[buffId] = Array<number>(timelineLength).fill(Number.NaN));
      timeline[second] = Math.max(1, buff.stacks ?? 1);
    }

    for (const [buffId, timeline] of Object.entries(buffStacksTimelineBySecond)) {
      if (!activeBuffIds.has(buffId)) {
        timeline[second] = 0;
      }
    }

    const activeTargetDebuffIds = new Set<string>();
    const primaryTarget = state.targets[0];
    if (primaryTarget) {
      for (const [debuffId, debuff] of primaryTarget.debuffs.entries()) {
        const stacks = debuff.stackTimers.filter((timer) => timer === 0 || timer > state.currentTime).length;
        activeTargetDebuffIds.add(debuffId);
        const timeline = targetDebuffStacksTimelineBySecond[debuffId]
          ?? (targetDebuffStacksTimelineBySecond[debuffId] = Array<number>(timelineLength).fill(Number.NaN));
        timeline[second] = stacks;
      }
    }

    for (const [debuffId, timeline] of Object.entries(targetDebuffStacksTimelineBySecond)) {
      if (!activeTargetDebuffIds.has(debuffId)) {
        timeline[second] = 0;
      }
    }
  };

  // Seed event queue
  queue.push({ type: EventType.ENCOUNTER_START, time: 0 });
  queue.push({ type: EventType.ENCOUNTER_END, time: config.encounter.duration });

  // Main simulation loop
  while (!queue.isEmpty()) {
    const event = queue.pop();
    state.currentTime = event.time;
    state.updateTimeBasedHealth();
    sampleResourceAtCurrentTime();

    switch (event.type) {
      case EventType.ENCOUNTER_START: {
        // Schedule initial auto-attacks and fire combat_begin hooks (e.g. TEB stacks)
        initAutoAttacks(state, queue);
        runtime.module.combat_begin(state, queue);
        scheduleInitialTimedBuffExpiryEvents(state, queue, config.encounter.duration);
        // Bot starts immediately
        scheduleForegroundReadyAt(0, 'initial');
        break;
      }

      case EventType.ENCOUNTER_END: {
        const activeWait = waitingForTrigger as ForegroundWaitState | null;
        if (activeWait) {
          const partialWait = Math.max(0, config.encounter.duration - activeWait.startedAt);
          waitingTime += partialWait;
          recordForegroundWait(activeWait.startedAt, partialWait);
          waitingForTrigger = null;
        }
        // If a channel is still active when the encounter ends, account for the
        // elapsed partial channel time up to the fight end.
        for (const active of activeChannels.values()) {
          const elapsed = Math.max(0, config.encounter.duration - active.startedAt);
          if (elapsed > 0) {
            channelTimeBySpell[active.spellId] = (channelTimeBySpell[active.spellId] ?? 0) + elapsed;
          }
        }
        activeChannels.clear();
        // Drain the queue fully to stop the loop
        queue.clear();
        break;
      }

      case EventType.GCD_READY: {
        const eventToken = event.token;
        const pendingReadyToken = getPendingForegroundReadyToken(pendingForegroundReady);
        if (eventToken !== undefined && pendingReadyToken !== undefined && pendingReadyToken !== eventToken) {
          break;
        }

        if (pendingReadyToken !== undefined && pendingReadyToken === eventToken) {
          pendingForegroundReady = null;
        }

        const strictQueuedSpell = hasStrictQueueEligibleInput();
        if (strictQueuedSpell && state.currentTime < state.gcdReady) {
          if (isQueuedAbilityExpiredAt(state, state.gcdReady)) {
            clearQueuedAbility(state);
            scheduleForegroundReadyAt(state.gcdReady, 'queued_action');
            break;
          }

          scheduleQueuedAbilityFireAt(state.gcdReady);
          break;
        }

        if (state.currentTime < state.gcdReady) {
          scheduleForegroundReadyAt(state.gcdReady, 'post_execute');
          break;
        }

        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(state);
        const { castAnyAction, lastSuccessfulSpell, nextForegroundReadyTime } = resolveForegroundTurn();
        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        scheduleAfterForegroundTurn(castAnyAction, lastSuccessfulSpell, nextForegroundReadyTime);
        break;
      }

      case EventType.OFF_GCD_READY: {
        if (state.getActiveChannel() || state.gcdReady <= state.currentTime) {
          break;
        }

        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(state);
        const successfulSpell = tryExecuteSelectedAction(selectAction(state, actionLists, runtime, rng, 'off-gcd', debugMode ? logger : undefined, playerName));
        const nextForegroundReadyTime = getPendingForegroundReadyTime();
        if (!successfulSpell) {
          scheduleOffGcdReady(
            state,
            queue,
            actionLists,
            runtime,
            config.encounter.duration,
            config.latencyModel,
            rng,
            nextForegroundReadyTime,
          );
          break;
        }

        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        scheduleOffGcdReady(
          state,
          queue,
          actionLists,
          runtime,
          config.encounter.duration,
          config.latencyModel,
          rng,
          nextForegroundReadyTime,
        );
        break;
      }

      case EventType.QUEUED_ABILITY_FIRE: {
        const eventToken = event.token;
        const pendingFireToken = getPendingQueuedAbilityFireToken(pendingQueuedAbilityFire);
        if (eventToken !== undefined && pendingFireToken !== undefined && pendingFireToken !== eventToken) {
          break;
        }

        const nextEvent = queue.peek();
        if (nextEvent?.time === state.currentTime) {
          queue.push({ type: EventType.QUEUED_ABILITY_FIRE, time: state.currentTime, token: eventToken });
          break;
        }

        if (pendingFireToken !== undefined && pendingFireToken === eventToken) {
          pendingQueuedAbilityFire = null;
        }

        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(state);
        let castAnyAction = false;
        let lastSuccessfulSpell = tryExecuteQueuedAbility(state.currentTime);
        let nextForegroundReadyTime: number | undefined;
        if (lastSuccessfulSpell) {
          castAnyAction = true;
          if (lastSuccessfulSpell.isOnGcd) {
            nextForegroundReadyTime = computeForegroundReadyTime(lastSuccessfulSpell);
            scheduleOffGcdReady(
              state,
              queue,
              actionLists,
              runtime,
              config.encounter.duration,
              config.latencyModel,
              rng,
              nextForegroundReadyTime,
            );
          }
        } else {
          const resolved = resolveForegroundTurn();
          castAnyAction = resolved.castAnyAction;
          lastSuccessfulSpell = resolved.lastSuccessfulSpell;
          nextForegroundReadyTime = resolved.nextForegroundReadyTime;
        }

        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        scheduleAfterForegroundTurn(castAnyAction, lastSuccessfulSpell, nextForegroundReadyTime);
        break;
      }

      /* istanbul ignore next -- headless mode never emits PLAYER_INPUT */
      case EventType.PLAYER_INPUT: {
        // No-op in headless mode
        break;
      }

      /* istanbul ignore next -- headless mode never emits PLAYER_CANCEL */
      case EventType.PLAYER_CANCEL: {
        // No-op in headless mode
        break;
      }

      case EventType.CAST_START: {
        break;
      }

      case EventType.ABILITY_CAST: {
        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(state);
        const result = processAbilityCast(event, state, queue, rng);
        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        recordSpellStats(damageBySpell, event.spellId, result.damage, 0, result.isCrit);
        pushSpellEvent({
          time: state.currentTime,
          spellId: event.spellId,
          damage: result.damage,
          isCrit: result.isCrit,
          outcome: 'landed',
        });
        if (logger && result.damage > 0) {
          logger(fmtHits(
            state.currentTime,
            playerName,
            event.spellId,
            resolveSpellId(event.spellId),
            targetName,
            result.damage,
            'physical',
            result.isCrit ? 'crit' : 'hit',
          ));
        }
        break;
      }

      case EventType.CHANNEL_TICK: {
        const tickResult = processChannelTickDetailed(event, state, rng, queue);
        recordSpellStats(damageBySpell, event.spellId, tickResult.damage, 0, tickResult.isCrit);
        pushSpellEvent({
          time: state.currentTime,
          spellId: event.spellId,
          damage: tickResult.damage,
          isCrit: tickResult.isCrit,
          outcome: 'landed',
        });
        if (logger && tickResult.damage > 0) {
          logger(fmtTick(
            state.currentTime,
            playerName,
            event.spellId,
            resolveSpellId(event.spellId),
            event.tickNumber,
            event.totalTicks,
            targetName,
            tickResult.damage,
            'physical',
            tickResult.isCrit ? 'crit' : 'hit',
          ));
        }
        break;
      }

      case EventType.DOT_TICK: {
        const tickResult = processDotTickDetailed(event, state, rng, queue);
        recordSpellStats(damageBySpell, event.spellId, tickResult.damage, 0, tickResult.isCrit);
        pushSpellEvent({
          time: state.currentTime,
          spellId: event.spellId,
          damage: tickResult.damage,
          isCrit: tickResult.isCrit,
          outcome: 'landed',
        });
        if (logger && tickResult.damage > 0) {
          logger(fmtTick(
            state.currentTime,
            playerName,
            event.spellId,
            resolveSpellId(event.spellId),
            event.tickNumber,
            event.totalTicks,
            targetName,
            tickResult.damage,
            'magic',
            tickResult.isCrit ? 'crit' : 'hit',
          ));
        }
        break;
      }

      case EventType.CHANNEL_END: {
        if (event.channelId !== undefined) {
          const started = activeChannels.get(event.channelId);
          if (started?.spellId === event.spellId) {
            const elapsed = Math.max(0, event.time - started.startedAt);
            if (elapsed > 0) {
              channelTimeBySpell[event.spellId] = (channelTimeBySpell[event.spellId] ?? 0) + elapsed;
            }
            activeChannels.delete(event.channelId);
          }
        }
        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(state);
        processChannelEnd(event, state, queue, rng);
        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        pendingForegroundReady = null;
        scheduleForegroundReadyAt(state.currentTime + sampleChannelLag(config.latencyModel, rng), 'channel_end');
        break;
      }

      case EventType.COOLDOWN_READY: {
        // No-op (just a marker)
        wakeForegroundIfWaiting();
        break;
      }

      case EventType.BUFF_APPLY: {
        buffApplyCounts[event.buffId] = (buffApplyCounts[event.buffId] ?? 0) + 1;
        if (logger) {
          const stacks = event.stacks ?? state.buffs.get(event.buffId)?.stacks ?? 1;
          logger(fmtBuffGain(state.currentTime, playerName, event.buffId, resolveSpellId(event.buffId), stacks, 0));
        }
        wakeForegroundIfWaiting();
        break;
      }
      case EventType.BUFF_STACK_CHANGE: {
        // No-op (state already mutated by executor)
        if (logger) {
          const buff = state.buffs.get(event.buffId);
          if (event.stacks > event.prevStacks) {
            logger(fmtBuffGain(state.currentTime, playerName, event.buffId, resolveSpellId(event.buffId), event.stacks, 0));
          } else if (event.stacks === event.prevStacks) {
            // same stack count — timer refresh
            const duration = buff && buff.expiresAt > 0 ? buff.expiresAt - state.currentTime : 3600;
            logger(fmtBuffRefresh(state.currentTime, playerName, event.buffId, 0, duration));
          }
          // stack decrease: no line emitted (SimC emits a separate loses-stacks event; out of scope)
        }
        wakeForegroundIfWaiting();
        break;
      }

      case EventType.BUFF_EXPIRE: {
        if (!isCurrentBuffExpireEvent(state, event.buffId)) {
          break;
        }
        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(
          state,
          Math.max(0, state.currentTime - 1e-9),
        );
        expireSharedPlayerBuff(state, event.buffId);
        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        if (logger) {
          logger(fmtBuffExpire(state.currentTime, playerName, event.buffId));
        }
        wakeForegroundIfWaiting();
        break;
      }

      case EventType.AUTO_ATTACK_MH: {
        if (!isCurrentSwingEvent('mainHand', state)) {
          break;
        }
        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(state);
        const aaDmg = processAutoAttack('mainHand', state, queue, rng, runtime.module);
        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        castLog.push({ time: state.currentTime, spellId: 'auto_attack_mh', damage: aaDmg, isComboStrike: false });
        // on_auto_attack calls recordPendingSpellStat — drained below at drainPendingSpellStats()
        if (logger) {
          logger(fmtPerforms(state.currentTime, playerName, 'auto_attack_mh', resolveSpellId('auto_attack_mh'), state.getEnergy()));
        }
        wakeForegroundIfWaiting();
        break;
      }

      case EventType.AUTO_ATTACK_OH: {
        if (!isCurrentSwingEvent('offHand', state)) {
          break;
        }
        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(state);
        const aaDmg = processAutoAttack('offHand', state, queue, rng, runtime.module);
        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        castLog.push({ time: state.currentTime, spellId: 'auto_attack_oh', damage: aaDmg, isComboStrike: false });
        // on_auto_attack calls recordPendingSpellStat — drained below at drainPendingSpellStats()
        if (logger) {
          logger(fmtPerforms(state.currentTime, playerName, 'auto_attack_oh', resolveSpellId('auto_attack_oh'), state.getEnergy()));
        }
        wakeForegroundIfWaiting();
        break;
      }

      case EventType.DELAYED_SPELL_IMPACT:
      case EventType.TIGEREYE_BREW_TICK:
      case EventType.COMBAT_WISDOM_TICK: {
        const previousAutoAttackSpeed = captureAutoAttackSpeedSnapshot(state);
        const result = runtime.processScheduledEvent?.(event, state, queue, rng, config.encounter.duration);
        rescheduleAutoAttacksForSpeedChange(state, queue, previousAutoAttackSpeed);
        if (result?.handled) {
          const damages = result.damages ?? (result.damage ? [result.damage] : []);
          for (const damage of damages) {
            castLog.push({
              time: state.currentTime,
              spellId: damage.spellId,
              damage: damage.amount,
              isComboStrike: false,
            });
            pushSpellEvent({
              time: state.currentTime,
              spellId: damage.spellId,
              damage: damage.amount,
              isCrit: damage.isCrit,
              outcome: 'landed',
            });
          }
        }
        rescheduleStrictQueuedForegroundReady();
        wakeForegroundIfWaiting();
        break;
      }

      case EventType.RESOURCE_THRESHOLD_READY: {
        const activeWait = waitingForTrigger as ForegroundWaitState | null;
        if (activeWait?.token === event.token) {
          wakeForegroundIfWaiting();
        }
        break;
      }

      /* istanbul ignore next -- headless mode never emits ENERGY_CAP_CHECK */
      case EventType.ENERGY_CAP_CHECK: {
        // No-op
        break;
      }

      /* istanbul ignore next -- channel ticks/end are already scheduled by executeAbility */
      case EventType.CHANNEL_START: {
        // Track channel start so total active channel time can be reported.
        if (event.channelId !== undefined) {
          activeChannels.set(event.channelId, {
            spellId: event.spellId,
            startedAt: event.time,
          });
        }
        break;
      }
    }

    for (const pending of state.drainPendingSpellStats()) {
      recordSpellStats(
        damageBySpell,
        pending.spellId,
        pending.damage,
        pending.casts,
        pending.isCrit,
        0,
        pending.outcome,
      );

      const repeats = Math.max(1, pending.casts || 0);
      for (let i = 0; i < repeats; i += 1) {
        pushSpellEvent({
          time: pending.time ?? state.currentTime,
          spellId: pending.spellId,
          damage: pending.damage,
          isCrit: pending.isCrit ?? false,
          outcome: pending.outcome ?? 'landed',
        });
        if (
          logger &&
          (pending.outcome ?? 'landed') === 'landed' &&
          pending.damage > 0 &&
          pending.spellId !== 'auto_attack_mh' &&
          pending.spellId !== 'auto_attack_oh'
        ) {
          const t = pending.time ?? state.currentTime;
          logger(fmtHits(
            t,
            playerName,
            pending.spellId,
            resolveSpellId(pending.spellId),
            targetName,
            pending.damage,
            'physical',
            (pending.isCrit ?? false) ? 'crit' : 'hit',
          ));
        }
      }
    }
  }

  // Set final time to encounter duration
  state.currentTime = config.encounter.duration;
  sampleResourceAtCurrentTime();

  const fillTimelineGaps = (timeline: number[]): number[] => {
    if (timeline.length === 0) return timeline;
    let firstKnown = -1;
    for (let i = 0; i < timeline.length; i += 1) {
      if (Number.isFinite(timeline[i])) {
        firstKnown = i;
        break;
      }
    }
    if (firstKnown === -1) {
      return timeline.fill(0);
    }
    for (let i = 0; i < firstKnown; i += 1) {
      timeline[i] = timeline[firstKnown];
    }
    for (let i = firstKnown + 1; i < timeline.length; i += 1) {
      if (!Number.isFinite(timeline[i])) {
        timeline[i] = timeline[i - 1];
      }
    }
    return timeline;
  };
  const fillAuraTimelineGaps = (timeline: number[]): number[] => {
    if (timeline.length === 0) return timeline;
    let firstKnown = -1;
    for (let i = 0; i < timeline.length; i += 1) {
      if (Number.isFinite(timeline[i])) {
        firstKnown = i;
        break;
      }
    }
    if (firstKnown === -1) {
      return timeline.fill(0);
    }
    for (let i = 0; i < firstKnown; i += 1) {
      timeline[i] = 0;
    }
    for (let i = firstKnown + 1; i < timeline.length; i += 1) {
      if (!Number.isFinite(timeline[i])) {
        timeline[i] = timeline[i - 1];
      }
    }
    return timeline;
  };

  fillTimelineGaps(energyTimelineBySecond);
  fillTimelineGaps(chiTimelineBySecond);
  fillTimelineGaps(energyWasteTimelineBySecond);
  fillTimelineGaps(chiWasteTimelineBySecond);
  fillTimelineGaps(tebStacksTimelineBySecond);
  fillTimelineGaps(attackPowerTimelineBySecond);
  fillTimelineGaps(weaponAttackPowerTimelineBySecond);
  fillTimelineGaps(critPctTimelineBySecond);
  fillTimelineGaps(hastePctTimelineBySecond);
  fillTimelineGaps(masteryPctTimelineBySecond);
  fillTimelineGaps(versPctTimelineBySecond);
  for (const timeline of Object.values(buffStacksTimelineBySecond)) {
    fillAuraTimelineGaps(timeline);
  }
  for (const timeline of Object.values(targetDebuffStacksTimelineBySecond)) {
    fillAuraTimelineGaps(timeline);
  }

  return {
    totalDamage: state.totalDamage,
    dps: state.totalDamage / config.encounter.duration,
    castLog,
    actionSequence,
    timelineSequence,
    spellEvents,
    encounterDuration: config.encounter.duration,
    finalState: state.snapshot(),
    damageBySpell,
    executeTimeBySpell,
    chiWasted: state.chiWasted,
    energyWasted: state.getTotalEnergyWasted(),
    waitingTime,
    buffUptimes: state.collectBuffUptimes(),
    targetDebuffUptimes: state.collectPrimaryTargetDebuffUptimes(),
    buffApplyCounts,
    channelTimeBySpell,
    damageTimelineBySecond,
    resourceTimelineBySecond: {
      energy: energyTimelineBySecond,
      chi: chiTimelineBySecond,
    },
    wasteTimelineBySecond: {
      energy: energyWasteTimelineBySecond,
      chi: chiWasteTimelineBySecond,
    },
    tebStacksTimelineBySecond,
    buffStacksTimelineBySecond,
    targetDebuffStacksTimelineBySecond,
    attackPowerTimelineBySecond,
    weaponAttackPowerTimelineBySecond,
    critPctTimelineBySecond,
    hastePctTimelineBySecond,
    masteryPctTimelineBySecond,
    versPctTimelineBySecond,
  };
}
