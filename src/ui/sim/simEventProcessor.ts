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
import { executeAbility, processAbilityCast } from '@core/engine/executor';
import { initAutoAttacks, processAutoAttack } from '@core/engine/autoAttack';
import { interruptActiveChannel, processChannelEnd, processChannelTickDetailed } from '@core/engine/channel';
import { processDotTickDetailed } from '@core/engine/dot';
import { tryQueueAbility } from '@core/engine/spellQueue';
import { expireSharedPlayerBuff } from '@core/shared/player_effects';
import type { SpellDef } from '@core/data/spells/types';
import type { RngInstance } from '@core/engine/rng';
import type { ClassModule } from '@core/class_modules/class_module';
import { monk_module } from '@core/class_modules/monk/monk_module';
import { getSpellbookForProfileSpec } from '@core/data/specSpellbook';
import type { SpecRuntime } from '@core/runtime/spec_runtime';
import { monkWindwalkerRuntime } from '@core/class_modules/monk/monk_spec_runtime';
import { getTopNRecommendations } from './aplRecommender';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SimEventProcessorConfig {
  onDamage: (spellId: string, amount: number, isCrit: boolean, time: number) => void;
  onEncounterEnd: () => void;
  onChannelStart?: (spellId: string, startTime: number, duration: number) => void;
  onChannelEnd?: () => void;
  onSuccessfulCast?: (
    spellId: string,
    time: number,
    preCastSnapshot: GameStateSnapshot,
    preCastRecommendations: readonly string[],
  ) => void;
  onCombatEvent?: (event: SimEvent) => void;
  spellbook?: ReadonlyMap<string, SpellDef>;
  classModule?: ClassModule;
  runtime?: SpecRuntime;
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
  const runtime = config.runtime ?? monkWindwalkerRuntime;
  const cm = config.classModule ?? runtime.module ?? monk_module;
  const spellbook = config.spellbook ?? runtime.spells ?? getSpellbookForProfileSpec('monk');

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
          const resolvedSpell = runtime.resolveActionSpell?.(
            { type: 'cast', ability: event.ability },
            state,
          ) ?? spellbook.get(event.ability) ?? null;
          const spell = resolvedSpell;
          if (spell) {
            const preCastSnapshot = state.snapshot();
            const preCastRecommendations = getTopNRecommendations(state, 4, runtime);
            const result = executeAbility(spell, state, queue, rng);
            if (
              !result.success
              && (
                result.failReason === 'on_gcd'
                || result.failReason === 'channel_locked'
                || result.failReason === 'cast_locked'
              )
            ) {
              tryQueueAbility(state, event.ability);
            }
            if (result.success) {
              config.onSuccessfulCast?.(spell.name, state.currentTime, preCastSnapshot, preCastRecommendations);
            }
            if (result.success && result.damage > 0) {
              emitDirectDamage(spell.name, result.damage, result.isCrit, state.currentTime);
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
          const tickResult = processChannelTickDetailed(event, state, rng, queue);
          if (tickResult.damage > 0) {
            emitDirectDamage(event.spellId, tickResult.damage, tickResult.isCrit, state.currentTime);
          }
          break;
        }

        case EventType.DOT_TICK: {
          const tickResult = processDotTickDetailed(event, state, rng, queue);
          if (tickResult.damage > 0) {
            emitDirectDamage(event.spellId, tickResult.damage, tickResult.isCrit, state.currentTime);
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

        case EventType.DELAYED_SPELL_IMPACT:
        case EventType.TIGEREYE_BREW_TICK:
        case EventType.COMBAT_WISDOM_TICK: {
          const result = runtime.processScheduledEvent?.(event, state, queue, rng, state.encounterDuration);
          if (result?.handled) {
            const damages = result.damages ?? (result.damage ? [result.damage] : []);
            for (const damage of damages) {
              if (damage.amount <= 0) {
                continue;
              }
              emitDirectDamage(
                damage.spellId,
                damage.amount,
                damage.isCrit,
                state.currentTime,
              );
            }
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

        case EventType.CAST_START: {
          if (event.duration && config.onChannelStart) {
            config.onChannelStart(event.spellId, event.time, event.duration);
          }
          break;
        }

        case EventType.ABILITY_CAST: {
          const result = processAbilityCast(event, state, queue, rng);
          if (result.success && result.damage > 0) {
            emitDirectDamage(event.spellId, result.damage, result.isCrit, state.currentTime);
          }
          config.onChannelEnd?.();
          break;
        }

        case EventType.COOLDOWN_READY:
        case EventType.BUFF_APPLY:
        case EventType.BUFF_STACK_CHANGE:
        case EventType.GCD_READY:
        case EventType.ENERGY_CAP_CHECK:
        case EventType.QUEUED_ABILITY_FIRE:
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
