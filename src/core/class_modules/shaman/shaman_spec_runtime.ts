import type { ActionList, CastAction } from '../../apl/actionList';
import type { CharacterProfile } from '../../data/profileParser';
import enhancementDefaultProfileText from '../../data/profiles/shaman_enhancement_mid1.simc?raw';
import { SHAMAN_ENHANCEMENT_BUFFS, SHAMAN_ENHANCEMENT_SPELLS } from '../../data/spells/shaman_enhancement';
import type { SpellDef } from '../../data/spells';
import type { GameState } from '../../engine/gameState';
import { EventType, type SimEvent, type SimEventQueue } from '../../engine/eventQueue';
import { applyActionResult } from '../../engine/action_result';
import type { RngInstance } from '../../engine/rng';
import type { SpecRuntime } from '../../runtime/spec_runtime';
import { resolveSharedUseItemSpell } from '../../shared/player_effect_runtime';
import { SHARED_PLAYER_SPELLS } from '../../shared/player_effects';
import { applyShamanBuffStacks } from './shaman_action';
import { CrashLightningUnleashedAction } from './actions/crash_lightning';
import { doomWindsDurationSeconds, DoomWindsAction, DoomWindsDamageAction } from './actions/doom_winds';
import { AlphaWolfAction, isLatestAlphaWolfInstance } from './actions/feral_spirit';
import { StormflurryStormstrikeAction, StormflurryWindstrikeAction } from './actions/stormstrike';
import { SearingBoltAction } from './actions/lively_totems';
import { maybeScheduleNextSurgingTotemPulse, SurgingBoltAction, TremorAction } from './actions/surging_totem';
import { PrimordialStormAction } from './actions/primordial_storm';
import { LavaLashAction } from './actions/lava_lash';
import { shamanEnhancementModule } from './shaman_module';

/** Enhancement Shaman runtime scaffold. Action-level gameplay is added incrementally. */
const defaultAplText = enhancementDefaultProfileText
  .split('\n')
  .filter((line) => line.startsWith('actions'))
  .join('\n');

export const shamanEnhancementRuntime: SpecRuntime = {
  specId: 'shaman_enhancement',
  spells: SHAMAN_ENHANCEMENT_SPELLS,
  buffs: SHAMAN_ENHANCEMENT_BUFFS,
  defaultApl: defaultAplText,
  module: shamanEnhancementModule,
  initializeState(state: GameState, _profile: CharacterProfile): void {
    shamanEnhancementModule.init(state);
  },
  resolveActionSpell(action: CastAction, state: GameState): SpellDef | null {
    if (action.ability === 'stormstrike' && state.isBuffActive('ascendance')) {
      return SHAMAN_ENHANCEMENT_SPELLS.get('windstrike') ?? null;
    }
    // When the Tempest proc is active, pressing Lightning Bolt should cast Tempest.
    // This mirrors SimC's behavior and also fixes the stale-render timing window
    // where the ActionBar keymap hasn't updated yet but the live state already
    // blocks lightning_bolt via LightningBoltAction.preCastFailReason().
    if (action.ability === 'lightning_bolt' && state.isBuffActive('tempest')) {
      return SHAMAN_ENHANCEMENT_SPELLS.get('tempest') ?? null;
    }
    const spell = SHAMAN_ENHANCEMENT_SPELLS.get(action.ability);
    if (spell) {
      return spell;
    }

    if (action.ability === 'use_item') {
      return resolveSharedUseItemSpell(action, state, SHAMAN_ENHANCEMENT_SPELLS);
    }

    return SHARED_PLAYER_SPELLS.get(action.ability) ?? null;
  },
  assertDefaultAplCompatibility(_actionLists: ActionList[]): void {
    void _actionLists;
  },
  processScheduledEvent(
    event: SimEvent,
    state: GameState,
    _queue: SimEventQueue,
    rng: RngInstance,
  ) {
    if (event.type !== EventType.DELAYED_SPELL_IMPACT) {
      return { handled: false };
    }

    if (event.spellId === 'crash_lightning_unleashed') {
      const action = state.action_list?.get('crash_lightning_unleashed');
      if (!(action instanceof CrashLightningUnleashedAction)) {
        return { handled: false };
      }

      const damages: { spellId: string; amount: number; isCrit: boolean }[] = [];
      let totalDamage = 0;
      let anyCrit = false;

      for (let targetId = 0; targetId < state.activeEnemies; targetId += 1) {
        if (rng.next() >= 0.85) {
          continue;
        }

        const impact = action.executeOnTarget(targetId, rng, false);
        totalDamage += impact.amount;
        anyCrit = anyCrit || impact.isCrit;
        damages.push({
          spellId: 'crash_lightning_unleashed',
          amount: impact.amount,
          isCrit: impact.isCrit,
        });
      }

      if (damages.length > 0) {
        state.recordPendingSpellStat('crash_lightning_unleashed', totalDamage, 1, anyCrit);
      }

      return { handled: true, damages };
    }

    if (
      event.spellId === 'doom_winds_damage'
    ) {
      const action = state.action_list?.get('doom_winds_damage');
      if (!(action instanceof DoomWindsDamageAction)) {
        return { handled: false };
      }

      const damages = action.executePulse(rng, false).map((damage) => ({
        spellId: 'doom_winds_damage',
        amount: damage.amount,
        isCrit: damage.isCrit,
      }));

      return { handled: true, damages };
    }

    if (event.spellId === 'ascendance_doom_winds') {
      const action = state.action_list?.get('doom_winds');
      if (!(action instanceof DoomWindsAction)) {
        return { handled: false };
      }
      state.applyBuff('doom_winds', doomWindsDurationSeconds(state), 1);
      _queue.push({
        type: EventType.BUFF_APPLY,
        time: state.currentTime,
        buffId: 'doom_winds',
        stacks: 1,
      });
      const result = action.execute(_queue, rng, false);
      for (const nextEvent of result.newEvents) {
        _queue.push(nextEvent);
      }
      return { handled: true };
    }

    if (event.spellId === 'feral_spirit_tick' || event.spellId === 'static_accumulation_tick') {
      const buffEvents: SimEvent[] = [];
      applyShamanBuffStacks(
        state,
        'maelstrom_weapon',
        Math.min(10, state.getBuffStacks('maelstrom_weapon') + 1),
        buffEvents,
      );
      for (const buffEvent of buffEvents) {
        _queue.push(buffEvent);
      }
      return { handled: true };
    }

    if (event.spellId === 'tremor') {
      const action = state.action_list?.get('tremor');
      if (!(action instanceof TremorAction)) {
        return { handled: false };
      }
      const expiresAt = typeof event.castContext?.surgingTotemExpiresAt === 'number'
        ? event.castContext.surgingTotemExpiresAt
        : undefined;
      const damages = action.executePulse(rng, false).map((damage) => ({
        spellId: 'tremor',
        amount: damage.amount,
        isCrit: damage.isCrit,
      }));
      if (typeof expiresAt === 'number') {
        maybeScheduleNextSurgingTotemPulse(state, _queue, expiresAt);
      }
      return { handled: true, damages };
    }

    if (event.spellId === 'surging_bolt') {
      const action = state.action_list?.get('surging_bolt');
      if (!(action instanceof SurgingBoltAction)) {
        return { handled: false };
      }
      const targetId = typeof event.castContext?.targetId === 'number' ? event.castContext.targetId : 0;
      const impact = action.executeOnTarget(targetId, rng, false);
      return {
        handled: true,
        damages: [{ spellId: 'surging_bolt', amount: impact.amount, isCrit: impact.isCrit }],
      };
    }

    if (event.spellId === 'searing_bolt') {
      const action = state.action_list?.get('searing_bolt');
      if (!(action instanceof SearingBoltAction)) {
        return { handled: false };
      }

      const pulseMultiplier = typeof event.castContext?.pulseMultiplier === 'number'
        ? event.castContext.pulseMultiplier
        : 1;
      const impact = action.executeOnTarget(0, rng, false, pulseMultiplier);
      return {
        handled: true,
        damages: [{ spellId: 'searing_bolt', amount: impact.amount, isCrit: impact.isCrit }],
      };
    }

    if (event.spellId === 'elemental_overflow_lava_lash') {
      const action = state.action_list?.get('lava_lash');
      if (!(action instanceof LavaLashAction)) {
        return { handled: false };
      }

      const result = action.execute(_queue, rng, false, event.castContext);
      state.addDamage(result.damage);
      applyActionResult(state, _queue, [], result);
      return {
        handled: true,
        damages: [{ spellId: 'lava_lash', amount: result.damage, isCrit: result.isCrit }],
      };
    }

    if (event.spellId === 'alpha_wolf') {
      const action = state.action_list?.get('alpha_wolf');
      const instanceId = typeof event.castContext?.instanceId === 'number' ? event.castContext.instanceId : 0;
      if (!(action instanceof AlphaWolfAction) || !isLatestAlphaWolfInstance(state, instanceId)) {
        return { handled: true, damages: [] };
      }
      const damages = [];
      for (let targetId = 0; targetId < action.nTargets(); targetId += 1) {
        const impact = action.calculateDamage(rng, false, targetId);
        state.addDamage(impact.damage, targetId);
        damages.push({ spellId: 'alpha_wolf', amount: impact.damage, isCrit: impact.isCrit });
      }
      if (damages.length > 0) {
        state.recordPendingSpellStat('alpha_wolf', damages.reduce((sum, damage) => sum + damage.amount, 0), 1, damages.some((damage) => damage.isCrit));
      }
      return { handled: true, damages };
    }

    if (event.spellId === 'stormflurry_stormstrike' || event.spellId === 'stormflurry_windstrike') {
      const action = state.action_list?.get(event.spellId);
      if (!(action instanceof StormflurryStormstrikeAction) && !(action instanceof StormflurryWindstrikeAction)) {
        return { handled: false };
      }

      const result = action.execute(_queue, rng, false, event.castContext);
      for (const nextEvent of result.newEvents) {
        _queue.push(nextEvent);
      }
      if (result.damage > 0) {
        state.recordPendingSpellStat('stormflurry_proc', 0, 1, false, 'landed', state.currentTime);
        if (event.spellId === 'stormflurry_stormstrike') {
          state.recordPendingSpellStat('stormflurry_stormstrike_proc', 0, 1, false, 'landed', state.currentTime);
        }
      }

      return {
        handled: true,
        damages: result.damage > 0 ? [{ spellId: 'stormflurry', amount: result.damage, isCrit: result.isCrit }] : [],
      };
    }

    if (
      event.spellId === 'primordial_frost'
      || event.spellId === 'primordial_lightning'
      || event.spellId === 'lightning_bolt_ps'
      || event.spellId === 'chain_lightning_ps'
    ) {
      const action = state.action_list?.get('primordial_storm');
      if (!(action instanceof PrimordialStormAction)) {
        return { handled: false };
      }

      return {
        handled: true,
        damages: (() => {
          const result = action.executeScheduledImpact(event.spellId, event.castContext, _queue, rng);
          for (const nextEvent of result.newEvents) {
            _queue.push(nextEvent);
          }
          return result.damages;
        })(),
      };
    }

    return { handled: false };
  },
};
