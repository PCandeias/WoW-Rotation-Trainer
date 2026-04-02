import type { Action } from '../../engine/action';
import type { IGameState } from '../../engine/i_game_state';
import type { GameState } from '../../engine/gameState';
import { computePhysicalArmorMultiplier } from '../../engine/armor';
import { currentSwingInterval } from '../../engine/autoAttack';
import { EventType, type SimEvent, type SimEventQueue } from '../../engine/eventQueue';
import { rollRange, type RngInstance } from '../../engine/rng';
import { SHARED_PLAYER_SPELLS } from '../../shared/player_effects';
import type { ClassModule } from '../class_module';
import { requireShamanSpellData } from '../../dbc/shaman_spell_data';
import { SHAMAN_ENHANCEMENT_SPELLS } from '../../data/spells/shaman_enhancement';
import { ChainLightningAction } from './actions/chain_lightning';
import { AscendanceAction, AscendanceDamageAction, WindlashAttackAction } from './actions/ascendance';
import { CrashLightningAction, CrashLightningUnleashedAction } from './actions/crash_lightning';
import { DoomWindsAction, DoomWindsDamageAction } from './actions/doom_winds';
import { AlphaWolfAction, FeralSpiritAction } from './actions/feral_spirit';
import { FlameShockAction } from './actions/flame_shock';
import { LavaLashAction } from './actions/lava_lash';
import { LightningBoltAction } from './actions/lightning_bolt';
import { PrimordialStormAction } from './actions/primordial_storm';
import { StormstrikeAction, WindstrikeAction } from './actions/stormstrike';
import { SunderingAction } from './actions/sundering';
import { SurgingBoltAction, SurgingTotemAction, TremorAction } from './actions/surging_totem';
import { TempestAction } from './actions/tempest';
import { VoltaicBlazeAction } from './actions/voltaic_blaze';
import { applyShamanBuffStacks, triggerMaelstromWeaponProc } from './shaman_action';
import { triggerStormsurgeProc } from './actions/stormsurge';
import {
  triggerFlametongueWeapon,
  triggerWindfuryWeapon,
  WindfuryAttackAction,
} from './actions/windfury_weapon';

const SURGING_ELEMENTS = requireShamanSpellData(382043);
const LIGHTNING_SHIELD_DURATION_SECONDS = 3600;
const STORM_UNLEASHED_COOLDOWN_SPELL = 'crash_lightning';

/** Minimal Enhancement Shaman module scaffold for multi-spec runtime wiring. */
export const shamanEnhancementModule: ClassModule = {
  className: 'Shaman',
  init(state: GameState): void {
    const existingStatHooks = state.statHooks;
    state.statHooks = {
      ...existingStatHooks,
      getAttackPowerMultiplierBonus: (currentState): number => {
        const inheritedBonus = existingStatHooks.getAttackPowerMultiplierBonus?.(currentState) ?? 0;
        if (!currentState.hasTalent('instinctive_imbuements') || !currentState.isBuffActive('lightning_shield')) {
          return inheritedBonus;
        }
        return inheritedBonus + 0.03;
      },
      getSpellPowerPerAttackPowerCoefficient: (): number => 1.01,
      getHastePercentBonus: (currentState): number => {
        const inheritedBonus = existingStatHooks.getHastePercentBonus?.(currentState) ?? 0;
        const surgingElementsStacks = currentState.getBuffStacks('surging_elements');
        if (surgingElementsStacks <= 0) {
          return inheritedBonus;
        }
        return inheritedBonus + SURGING_ELEMENTS.effectN(1).base_value() * surgingElementsStacks;
      },
    };
    const existingExecutionHooks = state.executionHooks;
    state.executionHooks = {
      ...existingExecutionHooks,
      resolveSpellDef(currentState, spellId) {
        return existingExecutionHooks.resolveSpellDef?.(currentState, spellId)
          ?? SHAMAN_ENHANCEMENT_SPELLS.get(spellId)
          ?? SHARED_PLAYER_SPELLS.get(spellId);
      },
      getCooldownStateForQuery(currentState, spellId, baseState): typeof baseState {
        let resolvedBaseState = existingExecutionHooks.getCooldownStateForQuery?.(currentState, spellId, baseState) ?? baseState;
        if (
          resolvedBaseState === undefined
          && (spellId === 'stormstrike' || spellId === 'windstrike')
        ) {
          resolvedBaseState = currentState.cooldowns.get('strike');
        }
        if (resolvedBaseState === undefined && spellId === 'flame_shock') {
          resolvedBaseState = currentState.cooldowns.get('flame_shock');
        }
        if (spellId !== STORM_UNLEASHED_COOLDOWN_SPELL || !currentState.isBuffActive('storm_unleashed')) {
          return resolvedBaseState;
        }

        return {
          ...(resolvedBaseState ?? {}),
          readyAt: currentState.currentTime,
        };
      },
      startCooldown(currentState, spell): SimEvent[] | undefined {
        if (spell.name === STORM_UNLEASHED_COOLDOWN_SPELL && currentState.isBuffActive('storm_unleashed')) {
          return [];
        }
        if (spell.name === 'stormstrike' || spell.name === 'windstrike') {
          const rechargeDuration = spell.cooldown / (1 + currentState.getHastePercent() / 100);
          const maxCharges = currentState.hasTalent('stormblast') ? 2 : 1;
          currentState.startChargeCooldown('strike', maxCharges, rechargeDuration);
          return [];
        }
        if (spell.name === 'flame_shock') {
          const cooldownDuration = spell.cooldown;
          currentState.startCooldown('flame_shock', cooldownDuration);
          return [{
            type: EventType.COOLDOWN_READY,
            time: currentState.currentTime + cooldownDuration,
            spellId: 'flame_shock',
          }];
        }
        return existingExecutionHooks.startCooldown?.(currentState, spell);
      },
    };
    state.action_list = new Map([
      ...(state.action_list?.entries() ?? []),
      ...this.create_actions(state).entries(),
    ]);
    if (state.hasTalent('voltaic_blaze') && !state.isBuffActive('voltaic_blaze')) {
      applyShamanBuffStacks(state, 'voltaic_blaze', 1, []);
    }
    if (!state.isBuffActive('lightning_shield')) {
      state.applyBuff('lightning_shield', LIGHTNING_SHIELD_DURATION_SECONDS, 1);
    }
  },
  create_actions(state: IGameState): Map<string, Action> {
    return new Map<string, Action>([
      ['ascendance', new AscendanceAction(state)],
      ['ascendance_damage', new AscendanceDamageAction(state)],
      ['alpha_wolf', new AlphaWolfAction(state)],
      ['crash_lightning', new CrashLightningAction(state)],
      ['crash_lightning_unleashed', new CrashLightningUnleashedAction(state)],
      ['chain_lightning', new ChainLightningAction(state)],
      ['doom_winds', new DoomWindsAction(state)],
      ['doom_winds_damage', new DoomWindsDamageAction(state)],
      ['feral_spirit', new FeralSpiritAction(state)],
      ['flame_shock', new FlameShockAction(state)],
      ['lava_lash', new LavaLashAction(state)],
      ['lightning_bolt', new LightningBoltAction(state)],
      ['primordial_storm', new PrimordialStormAction(state)],
      ['sundering', new SunderingAction(state)],
      ['surging_bolt', new SurgingBoltAction(state)],
      ['surging_totem', new SurgingTotemAction(state)],
      ['stormstrike', new StormstrikeAction(state)],
      ['tempest', new TempestAction(state)],
      ['tremor', new TremorAction(state)],
      ['voltaic_blaze', new VoltaicBlazeAction(state)],
      ['windfury_attack', new WindfuryAttackAction(state)],
      ['windlash', new WindlashAttackAction(state)],
      ['windstrike', new WindstrikeAction(state)],
    ]);
  },
  combat_begin(_state: GameState, _queue: SimEventQueue): void {
    void _state;
    void _queue;
  },
  on_auto_attack(
    hand: 'mainHand' | 'offHand',
    state: IGameState,
    queue: SimEventQueue,
    rng: RngInstance,
  ): number {
    const gs = state as GameState;
    const minDmg = hand === 'mainHand' ? gs.stats.mainHandMinDmg : gs.stats.offHandMinDmg;
    const maxDmg = hand === 'mainHand' ? gs.stats.mainHandMaxDmg : gs.stats.offHandMaxDmg;
    const weaponSpeed = hand === 'mainHand' ? gs.stats.mainHandSpeed : gs.stats.offHandSpeed;
    const spellKey = `auto_attack_${hand === 'mainHand' ? 'mh' : 'oh'}`;

    const scheduleNextSwing = (): void => {
      const nextTime = state.currentTime + currentSwingInterval(hand, gs);
      if (hand === 'mainHand') {
        queue.push({ type: EventType.AUTO_ATTACK_MH, time: nextTime });
        gs.mhSwingTimer = nextTime;
      } else {
        queue.push({ type: EventType.AUTO_ATTACK_OH, time: nextTime });
        gs.ohSwingTimer = nextTime;
      }
    };

    const levelDelta = state.targetLevel - state.characterLevel;
    const baseAvoidancePct = 3.0;
    const levelPenaltyPerLevel = 1.5;
    const dualWieldMissPenalty = gs.stats.offHandSpeed > 0 ? 19 : 0;
    const missChance = Math.max(
      0,
      baseAvoidancePct + levelDelta * levelPenaltyPerLevel + dualWieldMissPenalty - state.hitPercent,
    ) / 100;
    const dodgeChance = Math.max(
      0,
      baseAvoidancePct + levelDelta * levelPenaltyPerLevel - state.expertisePercent,
    ) / 100;

    const roll = rng.next();
    if (roll < missChance) {
      state.recordPendingSpellStat(spellKey, 0, 1, false, 'miss');
      scheduleNextSwing();
      return 0;
    }

    if (roll < missChance + dodgeChance) {
      state.recordPendingSpellStat(spellKey, 0, 1, false, 'dodge');
      scheduleNextSwing();
      return 0;
    }

    const critChance = Math.max(0, Math.min(1, state.getCritPercent() / 100));
    const critWindow = Math.max(0, 1 - missChance - dodgeChance);
    const isCrit = roll < missChance + dodgeChance + Math.min(critChance, critWindow);

    const weaponDamage = minDmg === maxDmg ? minDmg : rollRange(rng, minDmg, maxDmg);
    const attackPowerDamage = weaponSpeed * (state.getAttackPower() / 6);
    let baseDamage = weaponDamage + attackPowerDamage;
    if (hand === 'offHand') {
      baseDamage *= 0.5;
    }

    const versMult = 1 + state.getVersatilityPercent() / 100;
    const armorMultiplier = computePhysicalArmorMultiplier(state, 0);
    let autoAttackDamage = baseDamage * versMult * armorMultiplier;
    if (isCrit) {
      autoAttackDamage *= 2.0;
    }

    if (state.isBuffActive('ascendance')) {
      const windlashAction = new WindlashAttackAction(state, hand === 'offHand');
      const windlashWeaponDamage = weaponDamage + attackPowerDamage;
      const windlashBase = windlashWeaponDamage * (windlashAction.spellData.effectN(1).base_value() / 100);
      let windlashDamage = windlashBase * versMult * armorMultiplier;
      if (isCrit) {
        windlashDamage *= 2.0;
      }
      state.addDamage(windlashDamage);
      state.recordPendingSpellStat('windlash', windlashDamage, 1, isCrit);
      autoAttackDamage = windlashDamage;
    } else {
      state.addDamage(autoAttackDamage);
      state.recordPendingSpellStat(spellKey, autoAttackDamage, 1, isCrit);
    }

    let totalDamage = autoAttackDamage;
    const procEvents: SimEvent[] = [];

    if (autoAttackDamage > 0) {
      triggerStormsurgeProc(state, rng, procEvents);
    }

    const flametongueResult = triggerFlametongueWeapon(state, rng, false, {
      allowHotHandProc: true,
    });
    totalDamage += flametongueResult.damage;
    for (const event of procEvents) {
      queue.push(event);
    }
    for (const event of flametongueResult.newEvents) {
      queue.push(event);
    }

    const maelstromProcEvents: SimEvent[] = [];
    if (triggerMaelstromWeaponProc(state, rng, maelstromProcEvents)) {
      for (const event of maelstromProcEvents) {
        queue.push(event);
      }
    }

    if (hand === 'mainHand') {
      const windfuryResult = triggerWindfuryWeapon(state, queue, rng, false);
      totalDamage += windfuryResult.damage;
      for (const event of windfuryResult.newEvents) {
        queue.push(event);
      }
    }

    scheduleNextSwing();
    return totalDamage;
  },
};
