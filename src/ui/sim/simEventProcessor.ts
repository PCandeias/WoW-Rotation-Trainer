/**
 * SimEventProcessor — processes simulation events in the browser context.
 *
 * Replicates the headless.ts event handling logic but for player-controlled
 * mode where abilities are triggered via PLAYER_INPUT events.
 */

import type { SimEvent } from '@core/engine/eventQueue';
import { EventType } from '@core/engine/eventQueue';
import type { GameState, GameStateSnapshot } from '@core/engine/gameState';
import type { SimEventQueue } from '@core/engine/eventQueue';
import { executeAbility } from '@core/engine/executor';
import { initAutoAttacks, processAutoAttack } from '@core/engine/autoAttack';
import { interruptActiveChannel, processChannelTick, processChannelEnd } from '@core/engine/channel';
import { tryQueueAbility } from '@core/engine/spellQueue';
import { expireSharedPlayerBuff } from '@core/shared/player_effects';
import { MONK_WW_SPELLS } from '@data/spells/monk_windwalker';
import type { RngInstance } from '@core/engine/rng';
import type { ClassModule } from '@core/class_modules/class_module';
import { monk_module } from '@core/class_modules/monk/monk_module';
import { processDelayedSpellImpact } from '@core/class_modules/monk/flurry_strikes';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SimEventProcessorConfig {
  onDamage: (spellId: string, amount: number, isCrit: boolean, time: number) => void;
  onEncounterEnd: () => void;
  onChannelStart?: (spellId: string, startTime: number, duration: number) => void;
  onChannelEnd?: () => void;
  onSuccessfulCast?: (spellId: string, time: number, preCastSnapshot: GameStateSnapshot) => void;
  onCombatEvent?: (event: SimEvent) => void;
  classModule?: ClassModule;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSimEventProcessor(
  state: GameState,
  queue: SimEventQueue,
  rng: RngInstance,
  config: SimEventProcessorConfig
): (events: SimEvent[]) => void {
  const cm = config.classModule ?? monk_module;

  function buildDamageSignature(spellId: string, amount: number, isCrit: boolean, time: number): string {
    return `${spellId}|${Math.round(amount)}|${isCrit ? 'crit' : 'hit'}|${time.toFixed(3)}`;
  }

  return function processEvents(events: SimEvent[]): void {
    const directDamageCounts = new Map<string, number>();

    function emitDirectDamage(spellId: string, amount: number, isCrit: boolean, time: number): void {
      const signature = buildDamageSignature(spellId, amount, isCrit, time);
      directDamageCounts.set(signature, (directDamageCounts.get(signature) ?? 0) + 1);
      config.onDamage(spellId, amount, isCrit, time);
    }

    for (const event of events) {
      switch (event.type) {
        case EventType.ENCOUNTER_START:
          initAutoAttacks(state, queue);
          cm.combat_begin(state, queue);
          break;

        case EventType.PLAYER_INPUT: {
          const spell = MONK_WW_SPELLS.get(event.ability);
          if (spell) {
            const preCastSnapshot = state.snapshot();
            const result = executeAbility(spell, state, queue, rng);
            if (
              !result.success
              && (result.failReason === 'on_gcd' || result.failReason === 'channel_locked')
            ) {
              tryQueueAbility(state, event.ability);
            }
            if (result.success) {
              config.onSuccessfulCast?.(event.ability, state.currentTime, preCastSnapshot);
            }
            if (result.success && result.damage > 0) {
              emitDirectDamage(event.ability, result.damage, false, state.currentTime);
            }
            if (result.success && state.gcdReady > state.currentTime) {
              queue.push({ type: EventType.GCD_READY, time: state.gcdReady });
            }
          }
          break;
        }

        case EventType.PLAYER_CANCEL:
          interruptActiveChannel(state, queue, rng);
          break;

        case EventType.CHANNEL_TICK: {
          const damage = processChannelTick(event, state, rng);
          if (damage > 0) {
            emitDirectDamage(event.spellId, damage, false, state.currentTime);
          }
          break;
        }

        case EventType.CHANNEL_END:
          {
            const shouldCloseChannelUi =
              (event.interrupted ?? false) ||
              event.channelId === undefined ||
              state.isCurrentChannel(event.spellId, event.channelId);
            processChannelEnd(event, state, queue, rng);
            if (shouldCloseChannelUi) {
              config.onChannelEnd?.();
            }
          }
          break;

        case EventType.AUTO_ATTACK_MH: {
          const aaDmg = processAutoAttack('mainHand', state, queue, rng, cm);
          if (aaDmg > 0) emitDirectDamage('auto_attack', aaDmg, false, state.currentTime);
          break;
        }

        case EventType.AUTO_ATTACK_OH: {
          const aaDmg = processAutoAttack('offHand', state, queue, rng, cm);
          if (aaDmg > 0) emitDirectDamage('auto_attack', aaDmg, false, state.currentTime);
          break;
        }

        case EventType.DELAYED_SPELL_IMPACT: {
          const result = processDelayedSpellImpact(event.spellId, state, queue, rng);
          if (result && result.damage > 0) {
            emitDirectDamage(event.spellId, result.damage, result.isCrit, state.currentTime);
          }
          break;
        }

        case EventType.BUFF_EXPIRE: {
          expireSharedPlayerBuff(state, event.buffId);
          break;
        }

        case EventType.ENCOUNTER_END:
          config.onEncounterEnd();
          break;

        case EventType.CHANNEL_START: {
          if (event.duration && config.onChannelStart) {
            config.onChannelStart(event.spellId, event.time, event.duration);
          }
          break;
        }

        case EventType.TIGEREYE_BREW_TICK: {
          if (state.hasTalent('tigereye_brew')) {
            const current = state.getBuffStacks('tigereye_brew_1');
            if (current < 20) {
              state.applyBuff('tigereye_brew_1', 120, current + 1);
            }
            const period = 8 / (1 + state.getHastePercent() / 100);
            queue.push({ type: EventType.TIGEREYE_BREW_TICK, time: state.currentTime + period });
          }
          break;
        }

        case EventType.COMBAT_WISDOM_TICK: {
          if (state.hasTalent('combat_wisdom')) {
            state.applyBuff('combat_wisdom', state.encounterDuration - state.currentTime);
            const nextTick = state.currentTime + 15;
            state.nextCombatWisdomAt = nextTick;
            if (nextTick < state.encounterDuration) {
              queue.push({ type: EventType.COMBAT_WISDOM_TICK, time: nextTick });
            }
          }
          break;
        }

        case EventType.COOLDOWN_READY:
        case EventType.BUFF_APPLY:
        case EventType.BUFF_STACK_CHANGE:
        case EventType.GCD_READY:
        case EventType.ENERGY_CAP_CHECK:
        case EventType.QUEUED_ABILITY_FIRE:
        case EventType.ABILITY_CAST:
          // No-op
          break;
      }

      config.onCombatEvent?.(event);
    }

    for (const pending of state.drainPendingSpellStats()) {
      if ((pending.outcome ?? 'landed') !== 'landed' || pending.damage <= 0) {
        continue;
      }

      const time = pending.time ?? state.currentTime;
      const signature = buildDamageSignature(pending.spellId, pending.damage, pending.isCrit ?? false, time);
      const directCount = directDamageCounts.get(signature) ?? 0;
      if (directCount > 0) {
        directDamageCounts.set(signature, directCount - 1);
        continue;
      }

      config.onDamage(pending.spellId, pending.damage, pending.isCrit ?? false, time);
    }
  };
}
