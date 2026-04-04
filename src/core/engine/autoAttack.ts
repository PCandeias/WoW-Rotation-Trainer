/**
 * Auto-Attack System — Stage 3.5
 *
 * Manages independent MH/OH swing timers, Flurry Charge generation,
 * and event queue integration for the WoW Rotation Trainer.
 */

import { EventType } from './eventQueue';
import type { SimEventQueue } from './eventQueue';
import type { GameState } from './gameState';
import type { RngInstance } from './rng';
import type { ClassModule } from '../class_modules/class_module';
import type { AutoAttackInterruptionMode } from '../data/spells';

const AUTO_ATTACK_TIMER_EPSILON = 1e-9;

export interface AutoAttackSpeedSnapshot {
  hastePercent: number;
  speedMultiplier: number;
}

// ---------------------------------------------------------------------------
// swingInterval
// ---------------------------------------------------------------------------

/**
 * Compute the haste-scaled swing interval for a weapon.
 *
 * @param weaponSpeed - Base weapon speed in seconds.
 * @param hastePercent - Haste percentage (e.g. 18 means 18%).
 * @returns The haste-scaled interval in seconds: `weaponSpeed / (1 + hastePercent / 100)`.
 */
export function swingInterval(weaponSpeed: number, hastePercent: number): number {
  return weaponSpeed / (1 + hastePercent / 100);
}

export function captureAutoAttackSpeedSnapshot(
  state: GameState,
  time = state.currentTime,
): AutoAttackSpeedSnapshot {
  if (time === state.currentTime) {
    return {
      hastePercent: state.getAutoAttackHastePercent(),
      speedMultiplier: state.getAutoAttackSpeedMultiplier(),
    };
  }

  const originalTime = state.currentTime;
  state.currentTime = time;
  try {
    return {
      hastePercent: state.getAutoAttackHastePercent(),
      speedMultiplier: state.getAutoAttackSpeedMultiplier(),
    };
  } finally {
    state.currentTime = originalTime;
  }
}

export function currentSwingInterval(
  hand: 'mainHand' | 'offHand',
  state: GameState,
  snapshot = captureAutoAttackSpeedSnapshot(state),
): number {
  const weaponSpeed = hand === 'mainHand' ? state.stats.mainHandSpeed : state.stats.offHandSpeed;
  return swingInterval(weaponSpeed, snapshot.hastePercent) / snapshot.speedMultiplier;
}

function setNextSwing(
  hand: 'mainHand' | 'offHand',
  nextTime: number,
  state: GameState,
  queue: SimEventQueue,
): void {
  if (hand === 'mainHand') {
    queue.push({ type: EventType.AUTO_ATTACK_MH, time: nextTime });
    state.mhSwingTimer = nextTime;
    return;
  }

  queue.push({ type: EventType.AUTO_ATTACK_OH, time: nextTime });
  state.ohSwingTimer = nextTime;
}

function snapshotsMatch(a: AutoAttackSpeedSnapshot, b: AutoAttackSpeedSnapshot): boolean {
  return Math.abs(a.hastePercent - b.hastePercent) <= AUTO_ATTACK_TIMER_EPSILON
    && Math.abs(a.speedMultiplier - b.speedMultiplier) <= AUTO_ATTACK_TIMER_EPSILON;
}

export function isCurrentSwingEvent(hand: 'mainHand' | 'offHand', state: GameState): boolean {
  const timer = hand === 'mainHand' ? state.mhSwingTimer : state.ohSwingTimer;
  return Math.abs(timer - state.currentTime) <= AUTO_ATTACK_TIMER_EPSILON;
}

export function rescheduleAutoAttacksForSpeedChange(
  state: GameState,
  queue: SimEventQueue,
  previous: AutoAttackSpeedSnapshot,
): void {
  const next = captureAutoAttackSpeedSnapshot(state);
  if (snapshotsMatch(previous, next)) {
    return;
  }

  for (const hand of ['mainHand', 'offHand'] as const) {
    const timer = hand === 'mainHand' ? state.mhSwingTimer : state.ohSwingTimer;
    const remaining = timer - state.currentTime;
    if (remaining <= AUTO_ATTACK_TIMER_EPSILON) {
      continue;
    }

    const oldInterval = currentSwingInterval(hand, state, previous);
    const newInterval = currentSwingInterval(hand, state, next);
    const newRemaining = remaining * (newInterval / oldInterval);
    const nextTime = state.currentTime + newRemaining;

    setNextSwing(hand, nextTime, state, queue);
  }
}

function shouldDelayAutoAttacksOnCastStart(state: GameState, spellId: string): boolean {
  const spell = state.executionHooks.resolveSpellDef?.(state, spellId);
  return spell?.autoAttackInterruption?.delayAtCastStart ?? false;
}

export function delayAutoAttacksForChannelStart(
  state: GameState,
  queue: SimEventQueue,
  spellId: string,
  delaySeconds: number,
): void {
  if (delaySeconds <= AUTO_ATTACK_TIMER_EPSILON || !shouldDelayAutoAttacksOnCastStart(state, spellId)) {
    return;
  }

  for (const hand of ['mainHand', 'offHand'] as const) {
    const timer = hand === 'mainHand' ? state.mhSwingTimer : state.ohSwingTimer;
    if (timer < state.currentTime - AUTO_ATTACK_TIMER_EPSILON) {
      continue;
    }

    setNextSwing(hand, timer + delaySeconds, state, queue);
  }
}

function activeChannelAutoAttackMode(state: GameState): AutoAttackInterruptionMode {
  const activeChannel = state.getActiveChannel();
  if (!activeChannel) {
    return 'continue';
  }
  if (state.currentTime >= activeChannel.endsAt - AUTO_ATTACK_TIMER_EPSILON) {
    return 'continue';
  }

  const activeSpell = state.executionHooks.resolveSpellDef?.(state, activeChannel.spellId);
  return activeSpell?.autoAttackInterruption?.duringChannel ?? 'continue';
}

function suppressesAutoAttacksDuringActiveChannel(state: GameState): boolean {
  return activeChannelAutoAttackMode(state) === 'suppress';
}

// ---------------------------------------------------------------------------
// initAutoAttacks
// ---------------------------------------------------------------------------

/**
 * Initialize the auto-attack timers in state and schedule the first MH and OH swings.
 * Call once at ENCOUNTER_START.
 *
 * - First MH swing fires at `state.currentTime`.
 * - First OH swing also fires at `state.currentTime` when an off-hand weapon is equipped.
 *
 * SimC schedules both hands from the same auto-attack execute path rather than
 * introducing a trainer-local half-swing offset, so we start them in phase and
 * let later weapon-speed differences create the natural drift.
 *
 * @param state - The current game state.
 * @param queue - The simulation event queue.
 */
export function initAutoAttacks(state: GameState, queue: SimEventQueue): void {
  // Reset swing timers
  state.mhSwingTimer = state.currentTime;
  state.ohSwingTimer = state.currentTime;

  // Schedule first swings
  queue.push({ type: EventType.AUTO_ATTACK_MH, time: state.currentTime });
  queue.push({ type: EventType.AUTO_ATTACK_OH, time: state.currentTime });
}

// ---------------------------------------------------------------------------
// processAutoAttack
// ---------------------------------------------------------------------------

/**
 * Process an AUTO_ATTACK_MH or AUTO_ATTACK_OH event.
 *
 * Calculates damage, applies monk auto-attack proc handling, and schedules
 * the next swing in the queue.
 *
 * @param hand - Which hand triggered (`'mainHand'` or `'offHand'`).
 * @param state - The current game state.
 * @param queue - The simulation event queue.
 * @param rng - The seeded random number generator instance.
 * @returns The final damage dealt by this auto-attack.
 */
export function processAutoAttack(
  hand: 'mainHand' | 'offHand',
  state: GameState,
  queue: SimEventQueue,
  rng: RngInstance,
  classModule?: ClassModule,
): number {
  if (suppressesAutoAttacksDuringActiveChannel(state)) {
    const activeChannel = state.getActiveChannel();
    if (activeChannel) {
      const timer = hand === 'mainHand' ? state.mhSwingTimer : state.ohSwingTimer;
      const fallbackDelay = activeChannel.endsAt - activeChannel.startedAt;
      const nextTime = Math.max(timer, state.currentTime) + fallbackDelay;
      setNextSwing(hand, nextTime, state, queue);
    }
    return 0;
  }

  if (classModule?.on_auto_attack) {
    return classModule.on_auto_attack(hand, state, queue, rng);
  }
  // Fallback path removed in Task 31 — all callers must provide classModule.
  // If this throws, it means monk_module was not initialized.
  throw new Error('processAutoAttack: classModule.on_auto_attack is required');
}
