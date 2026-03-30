/**
 * Browser-compatible APL recommendation engine.
 *
 * Loads the APL via Vite's `?raw` import and exposes helpers
 * that evaluate the action list against a live GameState to
 * determine the next recommended ability.
 */

import aplText from '@data/apls/monk_windwalker.simc?raw';
import { MONK_WW_SPELLS } from '@data/spells/monk_windwalker';
import type { SpellDef } from '@data/spells/monk_windwalker';
import { parseActionLists } from '@core/apl/actionList';
import type { ActionList, CastAction, VariableAction } from '@core/apl/actionList';
import { evaluate } from '@core/apl/evaluator';
import type { EvalContext } from '@core/apl/evaluator';
import type { GameState } from '@core/engine/gameState';
import { executeAbility, getAbilityFailReason } from '@core/engine/executor';
import { EventType, SimEventQueue, type SimEvent } from '@core/engine/eventQueue';
import { processChannelEnd, processChannelTick } from '@core/engine/channel';
import type { RngInstance } from '@core/engine/rng';
import { SHARED_PLAYER_SPELLS, buffAffectsEnergyRegen, expireSharedPlayerBuff } from '@core/shared/player_effects';
import { createSharedPlayerActions } from '@core/shared/player_effect_actions';
import { resolveSharedUseItemSpell } from '@core/shared/player_effect_runtime';
import { processDelayedSpellImpact } from '@core/class_modules/monk/flurry_strikes';
import { monk_module } from '@core/class_modules/monk/monk_module';

// ---------------------------------------------------------------------------
// Parse APL once at module init
// ---------------------------------------------------------------------------

const ACTION_LISTS = parseActionLists(aplText);

// ---------------------------------------------------------------------------
// Ported helpers from headless.ts (browser-safe, no node:fs)
// ---------------------------------------------------------------------------

function isSpellCastable(spell: SpellDef, state: GameState): boolean {
  return getAbilityFailReason(spell, state) === undefined;
}

function resolveSpellForAction(action: CastAction, state: GameState): SpellDef | null {
  const spell = MONK_WW_SPELLS.get(action.ability) ?? SHARED_PLAYER_SPELLS.get(action.ability);
  if (spell) {
    // Mirror SimC's create_action() gate: only recommend spells the class module
    // has registered as player-actionable. Spells absent from action_list (e.g.
    // touch_of_death, invoke_xuen) are tracked by the engine but have no action
    // bar button, so their cooldowns are never updated and they would otherwise
    // appear perpetually castable.
    return state.action_list?.has(spell.name) ? spell : null;
  }

  return resolveSharedUseItemSpell(action, state, MONK_WW_SPELLS);
}

function applyVariable(
  action: VariableAction,
  _state: GameState,
  ctx: EvalContext
): void {
  const current = ctx.variables.get(action.name) ?? 0;
  let value = 0;
  if (action.valueExpr) {
    try {
      value = evaluate(action.valueExpr, _state, ctx);
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

interface SelectedAction {
  action: CastAction;
  spell: SpellDef;
}

interface LookaheadContext {
  state: GameState;
  queue: SimEventQueue;
  rng: RngInstance;
}

function walkActionList(
  list: ActionList,
  allLists: ActionList[],
  state: GameState,
  ctx: EvalContext
): SelectedAction | null {
  for (const action of list.actions) {
    if (action.type === 'cast') {
      const spell = resolveSpellForAction(action, state);
      if (!spell) continue;

      if (action.condition) {
        const castCtx: EvalContext = { ...ctx, candidateAbility: spell.name };
        try {
          const val = evaluate(action.condition.ast, state, castCtx);
          if (val === 0) continue;
        } catch {
          continue;
        }
      }

      if (!isSpellCastable(spell, state)) continue;

      return { action, spell };
    }

    if (action.condition) {
      try {
        const val = evaluate(action.condition.ast, state, ctx);
        if (val === 0) continue;
      } catch {
        continue;
      }
    }

    if (action.type === 'call_list') {
      const sub = allLists.find((al) => al.name === action.listName);
      if (!sub) continue;
      const result = walkActionList(sub, allLists, state, ctx);
      if (result !== null) return result;
      if (action.callType === 'run') return null;
      continue;
    }

    if (action.type === 'variable') {
      applyVariable(action, state, ctx);
      continue;
    }
  }
  return null;
}

function selectAction(state: GameState): SelectedAction | null {
  const ctx: EvalContext = { variables: new Map() };
  const defaultList = ACTION_LISTS.find((al) => al.name === 'default');
  if (!defaultList) return null;
  return walkActionList(defaultList, ACTION_LISTS, state, ctx);
}

function createPreviewRng(): RngInstance {
  let state = 0;
  return {
    next(): number {
      state = (state + 1) >>> 0;
      return 0.999999;
    },
    getState(): number {
      return state;
    },
    setState(nextState: number): void {
      state = nextState >>> 0;
    },
  };
}

function cloneLookaheadState(state: GameState, extraActionIds: readonly string[] = []): GameState {
  const sim = state.clone();
  const originalActions = state.action_list ?? new Map();
  const reboundActions = new Map([
    ...monk_module.create_actions(sim).entries(),
    ...createSharedPlayerActions(sim).entries(),
  ]);
  sim.action_list = new Map(originalActions);
  for (const [spellId, action] of reboundActions) {
    if (sim.action_list.has(spellId) || extraActionIds.includes(spellId)) {
      sim.action_list.set(spellId, action);
    }
  }
  return sim;
}

function createLookaheadContext(state: GameState, extraActionIds: readonly string[] = []): LookaheadContext {
  return {
    state: cloneLookaheadState(state, extraActionIds),
    queue: new SimEventQueue(),
    rng: createPreviewRng(),
  };
}

function getNextEnergyBuffExpiry(state: GameState, targetTime: number): number | null {
  let nextExpiry: number | null = null;
  for (const [buffId, buff] of state.buffs) {
    if (!buffAffectsEnergyRegen(buffId)) {
      continue;
    }

    for (const timer of buff.stackTimers) {
      if (timer === 0 || timer <= state.currentTime || timer > targetTime) {
        continue;
      }
      nextExpiry = nextExpiry === null ? timer : Math.min(nextExpiry, timer);
    }
  }
  return nextExpiry;
}

function expireElapsedEnergyBuffs(state: GameState): void {
  for (const [buffId] of state.buffs) {
    if (buffAffectsEnergyRegen(buffId) && !state.isBuffActive(buffId)) {
      expireSharedPlayerBuff(state, buffId);
    }
  }
}

function processLookaheadEvent(ctx: LookaheadContext, event: SimEvent): void {
  switch (event.type) {
    case EventType.BUFF_EXPIRE:
      expireSharedPlayerBuff(ctx.state, event.buffId);
      break;
    case EventType.CHANNEL_TICK:
      processChannelTick(event, ctx.state, ctx.rng, ctx.queue);
      break;
    case EventType.CHANNEL_END:
      processChannelEnd(event, ctx.state, ctx.queue, ctx.rng);
      break;
    case EventType.DELAYED_SPELL_IMPACT:
      processDelayedSpellImpact(event.spellId, ctx.state, ctx.queue, ctx.rng);
      break;
    case EventType.TIGEREYE_BREW_TICK:
      if (ctx.state.hasTalent('tigereye_brew')) {
        const current = ctx.state.getBuffStacks('tigereye_brew_1');
        if (current < 20) {
          ctx.state.applyBuff('tigereye_brew_1', 120, current + 1);
        }
        const period = 8 / (1 + ctx.state.getHastePercent() / 100);
        ctx.queue.push({ type: EventType.TIGEREYE_BREW_TICK, time: ctx.state.currentTime + period });
      }
      break;
    case EventType.COMBAT_WISDOM_TICK:
      if (ctx.state.hasTalent('combat_wisdom')) {
        ctx.state.applyBuff('combat_wisdom', ctx.state.encounterDuration - ctx.state.currentTime);
        const nextTick = ctx.state.currentTime + 15;
        ctx.state.nextCombatWisdomAt = nextTick;
        if (nextTick < ctx.state.encounterDuration) {
          ctx.queue.push({ type: EventType.COMBAT_WISDOM_TICK, time: nextTick });
        }
      }
      break;
    case EventType.AUTO_ATTACK_MH:
    case EventType.AUTO_ATTACK_OH:
    case EventType.COOLDOWN_READY:
    case EventType.BUFF_APPLY:
    case EventType.BUFF_STACK_CHANGE:
    case EventType.GCD_READY:
    case EventType.OFF_GCD_READY:
    case EventType.CWC_READY:
    case EventType.RESOURCE_THRESHOLD_READY:
    case EventType.PLAYER_INPUT:
    case EventType.PLAYER_CANCEL:
    case EventType.QUEUED_ABILITY_FIRE:
    case EventType.ABILITY_CAST:
    case EventType.ENERGY_CAP_CHECK:
    case EventType.ENCOUNTER_START:
    case EventType.ENCOUNTER_END:
      break;
  }
}

function flushLookaheadEventsAtCurrentTime(ctx: LookaheadContext): void {
  expireElapsedEnergyBuffs(ctx.state);
  while (!ctx.queue.isEmpty() && ctx.queue.peek().time <= ctx.state.currentTime) {
    processLookaheadEvent(ctx, ctx.queue.pop());
    expireElapsedEnergyBuffs(ctx.state);
  }
}

function advanceLookaheadTime(ctx: LookaheadContext, targetTime: number): void {
  while (targetTime > ctx.state.currentTime) {
    const nextQueuedTime = ctx.queue.isEmpty() ? Number.POSITIVE_INFINITY : ctx.queue.peek().time;
    const nextEnergyExpiry = getNextEnergyBuffExpiry(ctx.state, targetTime) ?? Number.POSITIVE_INFINITY;
    const nextTime = Math.min(targetTime, nextQueuedTime, nextEnergyExpiry);
    if (!Number.isFinite(nextTime) || nextTime <= ctx.state.currentTime) {
      break;
    }

    ctx.state.currentTime = nextTime;
    ctx.state.settleEnergy();
    flushLookaheadEventsAtCurrentTime(ctx);
  }
}

function projectToGcdReady(ctx: LookaheadContext): void {
  if (!ctx.state.isGcdReady()) {
    advanceLookaheadTime(ctx, ctx.state.gcdReady);
  }
}

function executeLookaheadSpell(ctx: LookaheadContext, spell: SpellDef): ReturnType<typeof executeAbility> {
  const result = executeAbility(spell, ctx.state, ctx.queue, ctx.rng);
  if (!result.success) {
    return result;
  }

  flushLookaheadEventsAtCurrentTime(ctx);
  if (spell.isOnGcd) {
    advanceLookaheadTime(ctx, ctx.state.gcdReady);
  }

  return result;
}

function selectActionWithChannelProjection(ctx: LookaheadContext): SelectedAction | null {
  // Primary projection: evaluate at the first post-GCD instant.
  projectToGcdReady(ctx);
  const immediate = selectAction(ctx.state);
  if (immediate) {
    return immediate;
  }

  // If an active channel still blocks all options, project to natural channel end
  // and evaluate again so the UI never goes blank during channel lock windows.
  const activeChannel = ctx.state.getActiveChannel();
  if (!activeChannel) {
    return null;
  }

  advanceLookaheadTime(ctx, activeChannel.endsAt);
  processChannelEnd({
    type: EventType.CHANNEL_END,
    time: ctx.state.currentTime,
    spellId: activeChannel.spellId,
    channelId: activeChannel.channelId,
  }, ctx.state, ctx.queue, ctx.rng);
  flushLookaheadEventsAtCurrentTime(ctx);
  projectToGcdReady(ctx);

  return selectAction(ctx.state);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the top recommended spell ID for the current state.
 * Returns null if no spell is castable.
 */
export function getRecommendation(state: GameState): string | null {
  const ctx = createLookaheadContext(state);
  const selected = selectActionWithChannelProjection(ctx);
  return selected?.spell.name ?? null;
}

/**
 * Simulate a single cast of `spell` against a **clone** of `state`.
 * The original state is never mutated.
 *
 * Returns the cloned, mutated GameState after the cast is applied so that
 * `getTopNRecommendations` can chain multiple simulated steps.
 */
export function simulateStep(state: GameState, spell: SpellDef): GameState {
  const ctx = createLookaheadContext(state, [spell.name]);
  const result = executeLookaheadSpell(ctx, spell);
  if (!result.success) {
    throw new Error(`Lookahead simulateStep failed for ${spell.name}: ${result.failReason ?? 'unknown'}`);
  }

  return ctx.state;
}

/**
 * Get the top N recommended spell IDs using clone + forward simulation.
 *
 * Clones state to avoid mutating live state, then walks the APL and
 * simulates each successive cast to produce a realistic lookahead queue.
 */
export function getTopNRecommendations(state: GameState, n: number): string[] {
  const ctx = createLookaheadContext(state);
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const selected = selectActionWithChannelProjection(ctx);
    if (!selected) break;
    result.push(selected.spell.name);
    if (!executeLookaheadSpell(ctx, selected.spell).success) {
      break;
    }
  }
  return result;
}
