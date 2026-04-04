import type { Action } from '../../engine/action';
import type { CooldownState } from '../../apl/evaluator';
import type { SpellDef } from '../../data/spells/types';
import type { IGameState } from '../../engine/i_game_state';
import type { GameState } from '../../engine/gameState';
import { computePhysicalArmorMultiplier } from '../../engine/armor';
import { currentSwingInterval } from '../../engine/autoAttack';
import { EventType, type SimEvent, type SimEventQueue } from '../../engine/eventQueue';
import { rollChance, rollRange, type RngInstance } from '../../engine/rng';
import { maybeTriggerSkyfuryProc } from '../../shared/melee_player_effects';
import { getSharedPlayerDamageMultiplier, SHARED_PLAYER_SPELLS } from '../../shared/player_effects';
import type { ClassModule } from '../class_module';
import { requireShamanSpellData } from '../../dbc/shaman_spell_data';
import { SHAMAN_ENHANCEMENT_BUFFS, SHAMAN_ENHANCEMENT_SPELLS } from '../../data/spells/shaman_enhancement';
import { ChainLightningAction } from './actions/chain_lightning';
import { AscendanceAction, AscendanceDamageAction, WindlashAttackAction } from './actions/ascendance';
import { CrashLightningAction, CrashLightningUnleashedAction } from './actions/crash_lightning';
import { DoomWindsAction, DoomWindsDamageAction } from './actions/doom_winds';
import { AlphaWolfAction, FeralSpiritAction } from './actions/feral_spirit';
import { FlameShockAction } from './actions/flame_shock';
import { LavaLashAction } from './actions/lava_lash';
import { SearingBoltAction, SearingVolleyAction } from './actions/lively_totems';
import { LightningBoltAction } from './actions/lightning_bolt';
import { PrimordialStormAction } from './actions/primordial_storm';
import {
  StormflurryStormstrikeAction,
  StormflurryWindstrikeAction,
  StormstrikeAction,
  WindstrikeAction,
} from './actions/stormstrike';
import { SunderingAction } from './actions/sundering';
import { SurgingBoltAction, SurgingTotemAction, TremorAction, TremorEarthsurgeAction } from './actions/surging_totem';
import { TempestAction } from './actions/tempest';
import { VoltaicBlazeAction } from './actions/voltaic_blaze';
import { applyShamanBuffStacks, consumeShamanBuffStacks, triggerMaelstromWeaponProc } from './shaman_action';
import {
  triggerFlametongueWeapon,
  triggerWindfuryWeapon,
  WindfuryAttackAction,
} from './actions/windfury_weapon';

const SURGING_ELEMENTS = requireShamanSpellData(382043);
const FLURRY = requireShamanSpellData(382889);
const CRITICAL_STRIKES = requireShamanSpellData(157444);
const NATURES_FURY = requireShamanSpellData(381655);
const OVERCHARGE = requireShamanSpellData(1251026);
const STORM_UNLEASHED_FINAL = requireShamanSpellData(1252373);
const SPIRITUAL_AWAKENING = requireShamanSpellData(1270375);
const SUPPORTIVE_IMBUEMENTS = requireShamanSpellData(445033);
const ELEMENTAL_ATTUNEMENT = requireShamanSpellData(1263288);
const ENHANCEMENT_SHAMAN_PASSIVE = requireShamanSpellData(137041);
const LIGHTNING_SHIELD_DURATION_SECONDS = 3600;
const STORM_UNLEASHED_COOLDOWN_SPELL = 'crash_lightning';
const STRIKE_MAX_CHARGES = 2;
const ENHANCEMENT_AUTO_ATTACK_MULTIPLIER = 1 + ENHANCEMENT_SHAMAN_PASSIVE.effectN(5).percent();
const NATURES_FURY_SPELL_IDS = new Set([188196, 188443, 188389, 187874, 195592]);
const SUPPORTIVE_IMBUEMENTS_SPELL_IDS = new Set([10444, 467386]);
const AUTO_ATTACK_SPELL_DEFS: Record<'mainHand' | 'offHand', SpellDef> = {
  mainHand: {
    id: 1,
    name: 'auto_attack_mh',
    displayName: 'Auto Attack (Main Hand)',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 0,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: false,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
    isPhysical: true,
  },
  offHand: {
    id: 2,
    name: 'auto_attack_oh',
    displayName: 'Auto Attack (Off Hand)',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 0,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: false,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
    isPhysical: true,
  },
};

function settledCooldownAliasState(
  state: GameState,
  spellId: string,
): CooldownState | undefined {
  const cooldown = state.cooldowns.get(spellId);
  if (!cooldown?.readyTimes) {
    return cooldown;
  }

  const readyTimes = cooldown.readyTimes.filter((time) => time > state.currentTime);
  if (readyTimes.length === cooldown.readyTimes.length) {
    return cooldown;
  }

  return {
    ...cooldown,
    readyTimes,
  };
}

/** Minimal Enhancement Shaman module scaffold for multi-spec runtime wiring. */
export const shamanEnhancementModule: ClassModule = {
  className: 'Shaman',
  init(state: GameState): void {
    const statsSeedIncludesPassiveBonuses = state.profileStatsSource === 'simc_buffed_snapshot';
    const existingStatHooks = state.statHooks;
    state.statHooks = {
      ...existingStatHooks,
      getMasteryPercentBonus: (currentState): number => {
        const inheritedBonus = existingStatHooks.getMasteryPercentBonus?.(currentState) ?? 0;
        if (statsSeedIncludesPassiveBonuses) {
          return inheritedBonus;
        }
        let bonus = inheritedBonus;
        if (currentState.hasTalent('elemental_attunement')) {
          bonus += ELEMENTAL_ATTUNEMENT.effectN(1).base_value();
        }
        if (currentState.hasTalent('spiritual_awakening')) {
          bonus += SPIRITUAL_AWAKENING.effectN(1).base_value();
        }
        return bonus;
      },
      getCritPercentBonus: (currentState): number => {
        const inheritedBonus = existingStatHooks.getCritPercentBonus?.(currentState) ?? 0;
        if (statsSeedIncludesPassiveBonuses) {
          return inheritedBonus;
        }
        return inheritedBonus + CRITICAL_STRIKES.effectN(1).base_value();
      },
      getAttackPowerMultiplierBonus: (currentState): number => {
        const inheritedBonus = existingStatHooks.getAttackPowerMultiplierBonus?.(currentState) ?? 0;
        if (statsSeedIncludesPassiveBonuses) {
          return inheritedBonus;
        }
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
        const surgingElementsBonus = SURGING_ELEMENTS.effectN(1).base_value() * surgingElementsStacks;
        const baseHasteMultiplier = 1 + (currentState.getBaseHastePercent?.() ?? 0) / 100;
        // Surging Elements is an additive haste bonus in SimC. Convert it into the
        // local hook multiplier so the final total haste matches rating-derived haste
        // plus the buff's flat percentage instead of multiplying the two together.
        return inheritedBonus + surgingElementsBonus / baseHasteMultiplier;
      },
      getAutoAttackSpeedMultiplier: (currentState): number => {
        const inheritedMultiplier = existingStatHooks.getAutoAttackSpeedMultiplier?.(currentState) ?? 1;
        let multiplier = inheritedMultiplier;
        if (currentState.isBuffActive('flurry')) {
          multiplier *= 1 + FLURRY.effectN(1).percent();
        }
        if (currentState.getTalentRank('storm_unleashed') >= 4) {
          const crashLightningStacks = currentState.getBuffStacks('crash_lightning');
          if (crashLightningStacks > 0) {
            multiplier *= (1 + STORM_UNLEASHED_FINAL.effectN(3).percent()) ** crashLightningStacks;
          }
        }
        return multiplier;
      },
    };
    const existingDamageHooks = state.damageHooks ?? {};
    const getShamanSpellCritChanceBonusPercent = (spell: SpellDef, currentState: IGameState): number => {
      let bonus = existingDamageHooks.getSpellCritChanceBonusPercent?.(spell, currentState) ?? 0;
      const naturesFuryRank = currentState.getTalentRank('natures_fury');
      if (naturesFuryRank > 0 && NATURES_FURY_SPELL_IDS.has(spell.id)) {
        bonus += NATURES_FURY.effectN(1).base_value() * naturesFuryRank;
      }
      if (
        currentState.hasTalent('supportive_imbuements')
        && SUPPORTIVE_IMBUEMENTS_SPELL_IDS.has(spell.id)
      ) {
        bonus += SUPPORTIVE_IMBUEMENTS.effectN(1).base_value();
      }
      return bonus;
    };
    state.damageHooks = {
      ...existingDamageHooks,
      getSpellCritChanceBonusPercent(spell, currentState): number {
        return getShamanSpellCritChanceBonusPercent(spell, currentState);
      },
      getCritDamageMultiplier(spell, currentState): number {
        let critMultiplier = existingDamageHooks.getCritDamageMultiplier?.(spell, currentState) ?? 2.0;
        if (
          currentState.hasTalent('supportive_imbuements')
          && SUPPORTIVE_IMBUEMENTS_SPELL_IDS.has(spell.id)
        ) {
          critMultiplier += SUPPORTIVE_IMBUEMENTS.effectN(2).percent();
        }
        if (currentState.hasTalent('overcharge') && spell.schools?.includes('nature')) {
          const critChancePercent = Math.max(
            0,
            Math.min(100, currentState.getCritPercent() + getShamanSpellCritChanceBonusPercent(spell, currentState)),
          );
          critMultiplier *= 1 + OVERCHARGE.effectN(2).percent() * (critChancePercent / 100) * 0.5;
        }
        return critMultiplier;
      },
    };
    const existingExecutionHooks = state.executionHooks;
    const inheritedPreCastFailReason = existingExecutionHooks.preCastFailReason;
    state.executionHooks = {
      ...existingExecutionHooks,
      preCastFailReason(
        currentState,
        spell,
      ): 'talent_missing' | 'wdp_constraint' | 'execute_not_ready' | 'not_available' | undefined {
        const inheritedFailReason = inheritedPreCastFailReason?.(currentState, spell);
        if (inheritedFailReason) {
          return inheritedFailReason;
        }
        if (spell.name === 'flame_shock' && currentState.hasTalent('voltaic_blaze')) {
          return 'not_available';
        }
        return undefined;
      },
      getBuffStackExpirationModel(currentState, buffId) {
        if (buffId === 'crash_lightning' && currentState.hasTalent('storm_unleashed')) {
          return 'separate';
        }
        return SHAMAN_ENHANCEMENT_BUFFS.get(buffId)?.stackExpirationModel
          ?? existingExecutionHooks.getBuffStackExpirationModel?.(currentState, buffId);
      },
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
          resolvedBaseState = settledCooldownAliasState(currentState, 'strike');
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
      onAbilityExecuted(currentState, spell, rng, queue): void {
        existingExecutionHooks.onAbilityExecuted?.(currentState, spell, rng, queue);
        if (spell.name !== 'stormstrike' && spell.name !== 'windstrike') {
          return;
        }

        const rechargeDuration = spell.cooldown / (1 + currentState.getHastePercent() / 100);
        currentState.startChargeCooldown('strike', STRIKE_MAX_CHARGES, rechargeDuration);
        const chargeCooldown = currentState.cooldowns.get('strike');
        const futureReadyTimes = chargeCooldown?.readyTimes?.filter((time) => time > currentState.currentTime) ?? [];
        const availableCharges = (chargeCooldown?.maxCharges ?? STRIKE_MAX_CHARGES) - futureReadyTimes.length;
        if (availableCharges <= 0 && futureReadyTimes.length > 0) {
          queue.push({
            type: EventType.COOLDOWN_READY,
            time: futureReadyTimes[0]!,
            spellId: 'strike',
          });
        }
      },
    };
    state.action_list = new Map([
      ...(state.action_list?.entries() ?? []),
      ...this.create_actions(state).entries(),
    ]);
    if (!state.isBuffActive('lightning_shield')) {
      state.applyBuff('lightning_shield', LIGHTNING_SHIELD_DURATION_SECONDS, 1);
    }
  },
  create_actions(state: IGameState): Map<string, Action> {
    const hasVoltaicBlaze = state.hasTalent('voltaic_blaze');
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
      ...(!hasVoltaicBlaze ? [['flame_shock', new FlameShockAction(state)] satisfies [string, Action]] : []),
      ['lava_lash', new LavaLashAction(state)],
      ['lightning_bolt', new LightningBoltAction(state)],
      ['primordial_storm', new PrimordialStormAction(state)],
      ['searing_bolt', new SearingBoltAction(state)],
      ['searing_volley', new SearingVolleyAction(state)],
      ['sundering', new SunderingAction(state)],
      ['surging_bolt', new SurgingBoltAction(state)],
      ['surging_totem', new SurgingTotemAction(state)],
      ['stormflurry_stormstrike', new StormflurryStormstrikeAction(state)],
      ['stormflurry_windstrike', new StormflurryWindstrikeAction(state)],
      ['stormstrike', new StormstrikeAction(state)],
      ['tempest', new TempestAction(state)],
      ['tremor', new TremorAction(state)],
      ['tremor_es', new TremorEarthsurgeAction(state)],
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

    const maybeTriggerSkyfury = (): number => {
      return maybeTriggerSkyfuryProc({
        hand,
        state: gs,
        rng,
        replayAutoAttack: () => resolveAutoAttack({
          mayMiss: false,
          allowSkyfuryProc: false,
          scheduleSwing: false,
          consumeFlurry: false,
        }),
      });
    };

    const resolveAutoAttack = (
      options: { mayMiss: boolean; allowSkyfuryProc: boolean; scheduleSwing: boolean; consumeFlurry: boolean },
    ): number => {
      let isCrit = false;
      const buffEvents: SimEvent[] = [];

      if (options.consumeFlurry && state.getBuffStacks('flurry') > 0) {
        consumeShamanBuffStacks(state, 'flurry', 1, buffEvents);
      }

      if (options.mayMiss) {
        const roll = rng.next();
        if (roll < missChance) {
          state.recordPendingSpellStat(spellKey, 0, 1, false, 'miss');
          for (const event of buffEvents) {
            queue.push(event);
          }
          if (options.scheduleSwing) {
            scheduleNextSwing();
          }
          return 0;
        }

        if (roll < missChance + dodgeChance) {
          state.recordPendingSpellStat(spellKey, 0, 1, false, 'dodge');
          for (const event of buffEvents) {
            queue.push(event);
          }
          if (options.scheduleSwing) {
            scheduleNextSwing();
          }
          return 0;
        }

        const critChance = Math.max(0, Math.min(1, state.getCritPercent() / 100));
        const critWindow = Math.max(0, 1 - missChance - dodgeChance);
        isCrit = roll < missChance + dodgeChance + Math.min(critChance, critWindow);
      } else {
        isCrit = rollChance(rng, state.getCritPercent());
      }

      const weaponDamage = minDmg === maxDmg ? minDmg : rollRange(rng, minDmg, maxDmg);
      const weaponAttackPower = hand === 'offHand'
        ? state.getWeaponOffHandAttackPower?.() ?? 0
        : state.getWeaponMainHandAttackPower?.() ?? state.getAttackPower();
      const attackPowerDamage = weaponSpeed * (weaponAttackPower / 6);
      let baseDamage = weaponDamage + attackPowerDamage;
      if (hand === 'offHand') {
        baseDamage *= 0.5;
      }
      baseDamage *= ENHANCEMENT_AUTO_ATTACK_MULTIPLIER;

      const spellDef = AUTO_ATTACK_SPELL_DEFS[hand];
      const versMult = 1 + state.getVersatilityPercent() / 100;
      const playerMultiplier = getSharedPlayerDamageMultiplier(state);
      const targetMultiplier = state.damageHooks?.getTargetMultiplier?.(spellDef, state) ?? 1.0;
      const armorPenPercent = state.damageHooks?.getArmorPenPercent?.(state) ?? 0;
      const armorMultiplier = computePhysicalArmorMultiplier(state, armorPenPercent);
      let autoAttackDamage = baseDamage * versMult * playerMultiplier * targetMultiplier * armorMultiplier;
      if (isCrit) {
        autoAttackDamage *= state.damageHooks?.getCritDamageMultiplier?.(spellDef, state) ?? 2.0;
      }

      if (state.isBuffActive('ascendance')) {
        const windlashAction = new WindlashAttackAction(state, hand === 'offHand');
        const windlashSpellDef = SHAMAN_ENHANCEMENT_SPELLS.get('windlash') ?? spellDef;
        const windlashWeaponDamage = (weaponDamage + attackPowerDamage) * ENHANCEMENT_AUTO_ATTACK_MULTIPLIER;
        const windlashBase = windlashWeaponDamage * (windlashAction.spellData.effectN(1).base_value() / 100);
        let windlashDamage = windlashBase * versMult * playerMultiplier * (
          state.damageHooks?.getTargetMultiplier?.(windlashSpellDef, state) ?? 1.0
        );
        if (isCrit) {
          windlashDamage *= state.damageHooks?.getCritDamageMultiplier?.(windlashSpellDef, state) ?? 2.0;
        }
        state.addDamage(windlashDamage);
        state.recordPendingSpellStat(hand === 'offHand' ? 'windlash_oh' : 'windlash_mh', windlashDamage, 1, isCrit);
        autoAttackDamage = windlashDamage;
      } else {
        state.addDamage(autoAttackDamage);
        state.recordPendingSpellStat(spellKey, autoAttackDamage, 1, isCrit);
      }

      let totalDamage = autoAttackDamage;
      const procEvents: SimEvent[] = [];

      if (isCrit && state.hasTalent('flurry')) {
        // SimC triggers Flurry from the crit, then the swing consumes one stack.
        // Auto-attacks in our engine consume Flurry up-front, so refresh to the
        // post-swing state here instead of leaving the proc one stack too high.
        applyShamanBuffStacks(state, 'flurry', FLURRY.max_stacks() - 1, buffEvents);
      }

      const flametongueResult = triggerFlametongueWeapon(state, rng, false, {
        allowHotHandProc: true,
      });
      totalDamage += flametongueResult.damage;
      for (const event of buffEvents) {
        queue.push(event);
      }
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

      if (options.allowSkyfuryProc) {
        totalDamage += maybeTriggerSkyfury();
      }
      if (options.scheduleSwing) {
        scheduleNextSwing();
      }

      return totalDamage;
    };

    return resolveAutoAttack({ mayMiss: true, allowSkyfuryProc: true, scheduleSwing: true, consumeFlurry: true });
  },
};
