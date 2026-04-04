import type { ActionResult } from '../../../engine/action';
import { EventType, type SimEvent, type SimEventQueue } from '../../../engine/eventQueue';
import type { IGameState } from '../../../engine/i_game_state';
import type { RngInstance } from '../../../engine/rng';
import { rollChance } from '../../../engine/rng';
import { requireShamanSpellData } from '../../../dbc/shaman_spell_data';
import { applyShamanBuffStacks, ShamanAction } from '../shaman_action';

const LIVELY_TOTEMS = requireShamanSpellData(458101);
const LIVELY_TOTEMS_BUFF = requireShamanSpellData(461242);
const SEARING_BOLT = requireShamanSpellData(3606);
const SEARING_VOLLEY = requireShamanSpellData(458147);

const LIVELY_TOTEMS_PROC_CHANCE = 6;
const LIVELY_TOTEMS_ACCUM_STATE = 'shaman.lively_totems_accum';
const SEARING_TOTEM_BUFF_ID = 'searing_totem';
const SEARING_BOLT_INTERVAL_SECONDS = 2;
const SEARING_TOTEM_EXTRA_DURATION_SECONDS = 0.85;

export function createLivelyTotemsBoltEvents(currentTime: number, durationSeconds: number): SimEvent[] {
  const pulseCount = Math.floor(durationSeconds / SEARING_BOLT_INTERVAL_SECONDS);
  const partialPulseMultiplier = (durationSeconds % SEARING_BOLT_INTERVAL_SECONDS) / SEARING_BOLT_INTERVAL_SECONDS;
  const events: SimEvent[] = [];
  for (let pulse = 1; pulse <= pulseCount; pulse += 1) {
    events.push({
      type: EventType.DELAYED_SPELL_IMPACT,
      time: currentTime + pulse * SEARING_BOLT_INTERVAL_SECONDS,
      spellId: 'searing_bolt',
    });
  }
  if (partialPulseMultiplier > 0) {
    events.push({
      type: EventType.DELAYED_SPELL_IMPACT,
      time: currentTime + durationSeconds,
      spellId: 'searing_bolt',
      castContext: { pulseMultiplier: partialPulseMultiplier },
    });
  }
  return events;
}

export function triggerLivelyTotemsProc(
  state: IGameState,
  rng: RngInstance,
  newEvents: SimEvent[],
): boolean {
  if (!state.hasTalent('lively_totems')) {
    return false;
  }

  const attemptCount = (state.getNumericState?.(LIVELY_TOTEMS_ACCUM_STATE) ?? 0) + 1;
  const procChancePercent = Math.min(100, LIVELY_TOTEMS_PROC_CHANCE * attemptCount);
  if (!rollChance(rng, procChancePercent)) {
    state.setNumericState?.(LIVELY_TOTEMS_ACCUM_STATE, attemptCount);
    return false;
  }

  state.setNumericState?.(LIVELY_TOTEMS_ACCUM_STATE, 0);
  applyShamanBuffStacks(state, 'lively_totems', state.getBuffStacks('lively_totems') + 1, newEvents);
  const totemDurationSeconds = LIVELY_TOTEMS.duration_ms() / 1000 + rng.next() * SEARING_TOTEM_EXTRA_DURATION_SECONDS;
  spawnSearingTotemEvents(state, rng, newEvents, totemDurationSeconds);
  return true;
}

/**
 * Spawns a searing totem pet with a random duration and queues its bolt pulses.
 * Mirrors SimC `pet.searing_totem.spawn(8.0 + rng().range(0.85))` called from both
 * `lava_lash_t::execute()` (lively_totems proc) and `sundering_t::execute()` (whirling_earth consume).
 */
export function spawnSearingTotemEvents(
  state: IGameState,
  rng: RngInstance,
  newEvents: SimEvent[],
  durationSeconds = LIVELY_TOTEMS.duration_ms() / 1000 + rng.next() * SEARING_TOTEM_EXTRA_DURATION_SECONDS,
): void {
  state.applyBuff(
    SEARING_TOTEM_BUFF_ID,
    durationSeconds,
    Math.min(LIVELY_TOTEMS_BUFF.max_stacks(), state.getBuffStacks(SEARING_TOTEM_BUFF_ID) + 1),
  );
  newEvents.push(...createLivelyTotemsBoltEvents(state.currentTime, durationSeconds));
}

export class SearingBoltAction extends ShamanAction {
  readonly name = 'searing_bolt';
  readonly spellData = SEARING_BOLT;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ('fire')[] {
    return ['fire'];
  }

  executeOnTarget(
    targetId: number,
    rng: RngInstance,
    isComboStrike: boolean,
    pulseMultiplier = 1,
  ): { amount: number; isCrit: boolean } {
    const snapshot = this.captureSnapshot(isComboStrike);
    const impact = this.calculateDamageFromSnapshot({
      ...snapshot,
      actionMultiplier: snapshot.actionMultiplier * pulseMultiplier,
    }, rng, targetId);
    this.p.addDamage(impact.damage, targetId);
    this.p.recordPendingSpellStat(this.name, impact.damage, 1, impact.isCrit);
    return { amount: impact.damage, isCrit: impact.isCrit };
  }
}

export class SearingVolleyAction extends ShamanAction {
  readonly name = 'searing_volley';
  readonly spellData = SEARING_VOLLEY;
  readonly aoe = 5;

  protected override actionIsPhysical(): boolean {
    return false;
  }

  protected override actionSchools(): readonly ('fire')[] {
    return ['fire'];
  }

  executeVolley(rng: RngInstance, isComboStrike: boolean): { damage: number; isCrit: boolean } {
    let totalDamage = 0;
    let anyCrit = false;
    const targetCount = this.nTargets();
    for (let targetId = 0; targetId < targetCount; targetId += 1) {
      const snapshot = this.captureSnapshot(isComboStrike);
      const impact = this.calculateDamageFromSnapshot(snapshot, rng, targetId, this.aoeDamageMultiplier(targetId, targetCount));
      this.p.addDamage(impact.damage, targetId);
      totalDamage += impact.damage;
      anyCrit = anyCrit || impact.isCrit;
    }
    this.p.recordPendingSpellStat(this.name, totalDamage, 1, anyCrit);
    return { damage: totalDamage, isCrit: anyCrit };
  }
}

export function triggerLivelyTotemsVolleys(
  state: IGameState,
  queue: SimEventQueue,
  rng: RngInstance,
  isComboStrike: boolean,
): ActionResult {
  void queue;

  const activeTotems = Math.min(
    LIVELY_TOTEMS_BUFF.max_stacks(),
    Math.max(0, state.getBuffStacks(SEARING_TOTEM_BUFF_ID)),
  );
  if (activeTotems <= 0) {
    return {
      damage: 0,
      isCrit: false,
      newEvents: [],
      buffsApplied: [],
      cooldownAdjustments: [],
    };
  }

  let totalDamage = 0;
  let anyCrit = false;
  for (let index = 0; index < activeTotems; index += 1) {
    const impact = new SearingVolleyAction(state).executeVolley(rng, isComboStrike);
    totalDamage += impact.damage;
    anyCrit = anyCrit || impact.isCrit;
  }

  return {
    damage: totalDamage,
    isCrit: anyCrit,
    newEvents: [],
    buffsApplied: [],
    cooldownAdjustments: [],
  };
}
