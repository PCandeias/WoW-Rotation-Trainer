import type { CastAction } from '../apl/actionList';
import { cloneLoadout, createEmptyLoadout } from '../data/loadout';
import type { CharacterProfile } from '../data/profileParser';
import { convertSecondaryRatingToPercent } from '../data/profileParser';
import type { SpellDef } from '../data/spells';
import type { GameState, GameStateExecutionHooks } from '../engine/gameState';
import { EventType } from '../engine/eventQueue';
import type { RngInstance } from '../engine/rng';
import type { SimEventQueue } from '../engine/eventQueue';
import { createRppmTracker, attemptProc, type RppmTracker } from '../engine/rppm';
import { SHARED_PLAYER_SPELLS, getSharedTargetDebuffMultiplier } from './player_effects';
import {
  createSharedPlayerActions,
  getAllSharedRacialActionNames,
  getAvailableSharedRacialActionNames,
} from './player_effect_actions';

const SHARED_USE_BUFF_TRINKETS = new Set(['algethar_puzzle_box']);
const ARCANOWEAVE_BONUS_IDS = new Set([13668]);
const ARCANOWEAVE_RPPM = 2.0;
const ARCANOWEAVE_DURATION = 20;
const ARCANOWEAVE_PRIMARY_STAT = 25.236664;
const MIGHT_OF_THE_VOID_RPPM = 3.0;
const MIGHT_OF_THE_VOID_DURATION = 15;
const ACUITY_OF_THE_RENDOREI_AMOUNTS = new Map<string, number>([
  ['enchant_weapon__acuity_of_the_rendorei_1', 53.43994],
  ['enchant_weapon__acuity_of_the_rendorei_2', 66.80006],
]);
const FLASK_OF_THE_BLOOD_KNIGHTS_HASTE_RATING = 89.39348;
const HARANDAR_CELEBRATION_PRIMARY_STAT = 50;
const VOID_TOUCHED_PRIMARY_STAT = 25.10191;
const PRIMARY_STAT_AUGMENTS = new Set(['void_touched', 'void_touched_augment_rune']);
const LOA_WORSHIPERS_BAND_NAME = 'loa_worshipers_band';
const LOA_WORSHIPERS_BAND_RPPM = 2.0;
const HUNT_TRIGGER_RPPM = 4.0;
const JANALAI_PRECISION_RPPM = 3.0;
const HUNT_EMBELLISHMENT_BONUS_ID = 12693;
const JANALAI_PRECISION_ENCHANT_IDS = new Set([7980, 7981]);
const DARKMOON_HUNT_TRINKETS = new Set(['darkmoon_deck_hunt', 'darkmoon_dominion_hunt']);
const GEM_COLOR_BY_ID = new Map<number, 'peridot' | 'garnet' | 'amethyst' | 'lapis'>([
  [240890, 'peridot'],
  [240892, 'peridot'],
  [240906, 'garnet'],
  [240908, 'garnet'],
  [240898, 'amethyst'],
  [240900, 'amethyst'],
  [240914, 'lapis'],
  [240916, 'lapis'],
  [240918, 'lapis'],
]);
const SHARED_PROC_EXCLUDED_SPELLS = new Set(['bloodlust', 'potion', 'berserking', 'algethar_puzzle_box']);
const DISABLED_CONSUMABLE_VALUES = new Set(['disabled', 'none', '0']);

type LoaProcId = 'blessing_of_the_capybara' | 'akilzons_cry_of_victory';
type HuntBuffId = 'hasty_hunt' | 'focused_hunt' | 'masterful_hunt' | 'versatile_hunt';

function profileHasEmbeddedAction(profile: CharacterProfile, actionName: string): boolean {
  return profile.rawLines.some((line) => {
    if (!line.startsWith('actions')) {
      return false;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex < 0) {
      return false;
    }
    return line.slice(eqIndex + 1)
      .split('/')
      .some((segment) => segment.trim().split(',')[0] === actionName);
  });
}

interface LoaProcState {
  tracker: RppmTracker;
  availableProcs: LoaProcId[];
}

interface HuntProcState {
  tracker: RppmTracker;
  sourceStacks: 1 | 2;
  selectedBuffId?: HuntBuffId;
}

interface DragonhawkProcState {
  tracker: RppmTracker;
}

interface ArcanoweaveProcState {
  tracker: RppmTracker;
}

interface MightOfTheVoidProcState {
  tracker: RppmTracker;
  amount: number;
}

// ---------------------------------------------------------------------------
// Gaze of the Alnseer — RPPM tracker (passive 2.0 PPM, haste-scaled)
// ---------------------------------------------------------------------------

/** Gaze RPPM tracker keyed by GameState instance. */
const gazeRppmTrackers = new WeakMap<GameState, RppmTracker>();
/** Last time an Alnscorned Essence stack was applied (0.75s ICD). */
const gazeLastStackTime = new WeakMap<GameState, number>();
const loaProcStates = new WeakMap<GameState, LoaProcState>();
const huntProcStates = new WeakMap<GameState, HuntProcState>();
const dragonhawkProcStates = new WeakMap<GameState, DragonhawkProcState>();
const arcanoweaveProcStates = new WeakMap<GameState, ArcanoweaveProcState>();
const mightOfTheVoidProcStates = new WeakMap<GameState, MightOfTheVoidProcState>();

/** DBC: spell 1256896, 2.0 RPPM, haste-scaled. */
const GAZE_RPPM = 2.0;
/** DBC: Alnsight duration (spell 1266686). */
const ALNSIGHT_DURATION = 12;
/** DBC: Alnscorned Essence max stacks and duration (spell 1266687). */
const ALNSCORNED_ESSENCE_DURATION = 12;
const ALNSCORNED_ESSENCE_MAX_STACKS = 20;
/** DBC: Alnscorned Essence internal cooldown (0.75s). */
const ALNSCORNED_ESSENCE_ICD = 0.75;

function getGazeRppm(state: GameState): RppmTracker {
  let tracker = gazeRppmTrackers.get(state);
  if (!tracker) {
    // SimC: Gaze of the Alnseer does not have an RPPM_HASTE scale flag in
    // real_ppm_modifier data for spell 1256896, so it should not haste-scale.
    tracker = createRppmTracker(GAZE_RPPM, /* hastenScales */ false);
    gazeRppmTrackers.set(state, tracker);
  }
  return tracker;
}

function hasGazeTrinketEquipped(state: GameState): boolean {
  return state.trinkets.some((t) => t.itemName === 'gaze_of_the_alnseer');
}

function applyTimedSharedBuff(
  state: GameState,
  queue: SimEventQueue,
  buffId: string,
  duration: number,
  stacks = 1,
): void {
  const wasActive = state.isBuffActive(buffId);
  state.applyBuff(buffId, duration, stacks);
  if (!wasActive) {
    queue.push({ type: EventType.BUFF_APPLY, time: state.currentTime, buffId, stacks });
  }
  queue.push({ type: EventType.BUFF_EXPIRE, time: state.currentTime + duration, buffId });
}

function applyTimedSharedHasteBuff(
  state: GameState,
  queue: SimEventQueue,
  buffId: string,
  duration: number,
  stacks = 1,
): void {
  state.settleEnergy();
  applyTimedSharedBuff(state, queue, buffId, duration, stacks);
  state.recomputeEnergyRegenRate();
}

function isSharedProcTriggerSpell(spell: SpellDef): boolean {
  return !SHARED_PROC_EXCLUDED_SPELLS.has(spell.name);
}

function getEquippedGemColors(loadout: ReturnType<typeof cloneLoadout>): Set<'peridot' | 'garnet' | 'amethyst' | 'lapis'> {
  const colors = new Set<'peridot' | 'garnet' | 'amethyst' | 'lapis'>();
  for (const item of loadout.gear) {
    for (const gemId of item.gemIds) {
      const color = GEM_COLOR_BY_ID.get(gemId);
      if (color) {
        colors.add(color);
      }
    }
  }
  return colors;
}

function initializeLoaProcState(state: GameState, loadout: ReturnType<typeof cloneLoadout>): void {
  if (!loadout.gear.some((item) => item.itemName === LOA_WORSHIPERS_BAND_NAME)) {
    return;
  }

  const gemColors = getEquippedGemColors(loadout);
  const availableProcs: LoaProcId[] = ['blessing_of_the_capybara'];
  if (gemColors.has('peridot')) {
    availableProcs.push('akilzons_cry_of_victory');
  }

  loaProcStates.set(state, {
    tracker: createRppmTracker(LOA_WORSHIPERS_BAND_RPPM),
    availableProcs,
  });
}

function initializeHuntProcState(state: GameState, loadout: ReturnType<typeof cloneLoadout>): void {
  const hasEmbellishment = loadout.gear.some((item) => item.bonusIds.includes(HUNT_EMBELLISHMENT_BONUS_ID));
  const hasTrinket = loadout.gear.some((item) => (
    (item.slot === 'trinket1' || item.slot === 'trinket2') && DARKMOON_HUNT_TRINKETS.has(item.itemName)
  ));

  if (!hasEmbellishment && !hasTrinket) {
    return;
  }

  huntProcStates.set(state, {
    tracker: createRppmTracker(HUNT_TRIGGER_RPPM),
    sourceStacks: hasEmbellishment ? 1 : 2,
  });
}

function initializeDragonhawkProcState(state: GameState, loadout: ReturnType<typeof cloneLoadout>): void {
  const hasEnchant = loadout.gear.some((item) => (
    (item.slot === 'main_hand' || item.slot === 'off_hand') &&
    item.enchantId !== undefined &&
    JANALAI_PRECISION_ENCHANT_IDS.has(item.enchantId)
  ));

  if (!hasEnchant) {
    return;
  }

  dragonhawkProcStates.set(state, {
    tracker: createRppmTracker(JANALAI_PRECISION_RPPM),
  });
}

function initializeArcanoweaveProcState(state: GameState, loadout: ReturnType<typeof cloneLoadout>): void {
  const hasArcanoweave = loadout.gear.some((item) => item.bonusIds.some((bonusId) => ARCANOWEAVE_BONUS_IDS.has(bonusId)));
  if (!hasArcanoweave) {
    return;
  }

  arcanoweaveProcStates.set(state, {
    tracker: createRppmTracker(ARCANOWEAVE_RPPM),
  });
}

function initializeMightOfTheVoidProcState(state: GameState, loadout: ReturnType<typeof cloneLoadout>): void {
  let amount = 0;
  for (const item of loadout.gear) {
    if (item.slot !== 'main_hand' && item.slot !== 'off_hand') {
      continue;
    }
    amount = Math.max(amount, ACUITY_OF_THE_RENDOREI_AMOUNTS.get(item.enchantName ?? '') ?? 0);
  }

  if (amount <= 0) {
    return;
  }

  mightOfTheVoidProcStates.set(state, {
    tracker: createRppmTracker(MIGHT_OF_THE_VOID_RPPM),
    amount,
  });
}

function pickRandomEntry<T>(rng: RngInstance, values: readonly T[]): T {
  const index = Math.min(values.length - 1, Math.floor(rng.next() * values.length));
  return values[index];
}

function isConsumableDisabled(value: string | null | undefined): boolean {
  if (value == null) {
    return true;
  }

  return DISABLED_CONSUMABLE_VALUES.has(value.trim().toLowerCase());
}

function resolveRaidRandomHuntBuff(rng: RngInstance): HuntBuffId {
  return pickRandomEntry(rng, [
    'hasty_hunt',
    'hasty_hunt',
    'masterful_hunt',
    'masterful_hunt',
    'masterful_hunt',
    'masterful_hunt',
    'hasty_hunt',
    'hasty_hunt',
    'versatile_hunt',
  ] satisfies HuntBuffId[]);
}

export function initializeSharedPlayerState(state: GameState, profile: CharacterProfile): void {
  const loadout = cloneLoadout(profile.loadout ?? createEmptyLoadout());
  const trinketEffects = profile.gearEffects.filter((effect) => effect.source.startsWith('trinket_'));
  const bloodlustEnabled = loadout.externalBuffs.bloodlust;
  const bloodlustIsActionDriven = profileHasEmbeddedAction(profile, 'bloodlust');
  const availableRacials = new Set(getAvailableSharedRacialActionNames(profile.race));

  // Mystic Touch is modeled as a target-side assumption flag, not a standard buff.
  state.assumeMysticTouch = loadout.externalBuffs.mysticTouch;
  state.damageHooks = {
    ...state.damageHooks,
    getTargetMultiplier: (spell, s, targetIndex): number => getSharedTargetDebuffMultiplier(s, spell, targetIndex),
  };

  applyPassiveLoadoutStats(state, profile, loadout);

  const trinketNames = new Map<number, string>();
  for (const item of loadout.gear) {
    if (item.slot === 'trinket1') {
      trinketNames.set(1, item.itemName);
    } else if (item.slot === 'trinket2') {
      trinketNames.set(2, item.itemName);
    }
  }

  state.trinkets = [];
  for (let slot = 1; slot <= 2; slot++) {
    const effect = trinketEffects.find((gearEffect) => gearEffect.source === `trinket_${slot}`);
    const itemName = trinketNames.get(slot);
    const hasUseBuff = itemName !== undefined
      && (effect?.type === 'on_use' || SHARED_USE_BUFF_TRINKETS.has(itemName));

    state.trinkets.push({
      cooldownReadyAt: 0,
      procActive: false,
      procExpiresAt: 0,
      itemName,
      hasUseBuff,
      pendingUseBuffStartedAt: undefined,
    });
  }

  if (bloodlustEnabled && !bloodlustIsActionDriven) {
    state.applyBuff('bloodlust', 40);
  }
  if (loadout.externalBuffs.battleShout) {
    state.applyBuff('battle_shout', 0);
  }
  if (loadout.externalBuffs.arcaneIntellect) {
    state.applyBuff('arcane_intellect', 0);
  }
  if (loadout.externalBuffs.markOfTheWild) {
    state.applyBuff('mark_of_the_wild', 0);
  }
  if (loadout.externalBuffs.powerWordFortitude) {
    state.applyBuff('power_word_fortitude', 0);
  }
  if (loadout.externalBuffs.skyfury) {
    state.applyBuff('skyfury', 0);
  }
  if (loadout.externalBuffs.chaosBrand) {
    // Target debuff modeled as a permanent validation flag buff.
    state.applyBuff('chaos_brand', 0);
  }
  if (loadout.externalBuffs.huntersMark) {
    // Target debuff modeled as a permanent validation flag buff.
    state.applyBuff('hunters_mark', 0);
  }

  initializeLoaProcState(state, loadout);
  initializeHuntProcState(state, loadout);
  initializeDragonhawkProcState(state, loadout);
  initializeArcanoweaveProcState(state, loadout);
  initializeMightOfTheVoidProcState(state, loadout);

  const priorAttackPowerBonus = state.statHooks.getAttackPowerBonus;
  const mightOfTheVoidAmount = mightOfTheVoidProcStates.get(state)?.amount ?? 0;
  state.statHooks = {
    ...state.statHooks,
    getAttackPowerBonus: (currentState): number => {
      let bonus = priorAttackPowerBonus?.(currentState) ?? 0;
      if (currentState.isBuffActive('arcanoweave_insight')) {
        bonus += ARCANOWEAVE_PRIMARY_STAT;
      }
      if (mightOfTheVoidAmount > 0 && currentState.isBuffActive('might_of_the_void')) {
        bonus += mightOfTheVoidAmount;
      }
      return bonus;
    },
  };

  state.recomputeEnergyRegenRate();
  state.executionHooks = createSharedPlayerExecutionHooks();
  state.action_list = createSharedPlayerActions(state, profile.race, loadout.consumables.potion);

  for (const actionName of getAllSharedRacialActionNames()) {
    if (!availableRacials.has(actionName)) {
      state.disabledPlayerActions.add(actionName);
    }
  }

  if (!bloodlustIsActionDriven) {
    state.disabledPlayerActions.add('bloodlust');
  }
  if (isConsumableDisabled(loadout.consumables.potion)) {
    state.disabledPlayerActions.add('potion');
  }
}

function applyPassiveLoadoutStats(
  state: GameState,
  profile: CharacterProfile,
  loadout: ReturnType<typeof cloneLoadout>,
): void {
  if (profile.statsSource === 'simc_buffed_snapshot') {
    return;
  }

  if (loadout.consumables.flask === 'flask_of_the_blood_knights_2') {
    const baseHasteRating = state.stats.hasteRating ?? 0;
    const totalHasteRating = baseHasteRating + FLASK_OF_THE_BLOOD_KNIGHTS_HASTE_RATING;
    state.stats.hasteRating = totalHasteRating;
    if (baseHasteRating > 0) {
      state.stats.hastePercent = convertSecondaryRatingToPercent(
        totalHasteRating,
        'haste',
        state.characterLevel,
      );
    } else {
      state.stats.hastePercent += convertSecondaryRatingToPercent(
        FLASK_OF_THE_BLOOD_KNIGHTS_HASTE_RATING,
        'haste',
        state.characterLevel,
      );
    }
  }

  if (loadout.consumables.food === 'harandar_celebration') {
    applyPrimaryStatBonus(state, profile, HARANDAR_CELEBRATION_PRIMARY_STAT);
  }

  if (loadout.consumables.augmentation && PRIMARY_STAT_AUGMENTS.has(loadout.consumables.augmentation)) {
    applyPrimaryStatBonus(state, profile, VOID_TOUCHED_PRIMARY_STAT);
  }
}

function applyPrimaryStatBonus(state: GameState, profile: CharacterProfile, amount: number): void {
  // The current trainer models monk damage primarily through attack power. Keep the
  // bonus routing here so future specs can extend it without touching engine code.
  if (profile.spec === 'monk') {
    state.stats.attackPower += amount;
  }
}

export function resolveSharedUseItemSpell(
  action: CastAction,
  state: Pick<GameState, 'trinkets'>,
  spells: ReadonlyMap<string, SpellDef> = SHARED_PLAYER_SPELLS,
): SpellDef | null {
  if (action.ability !== 'use_item') {
    return null;
  }

  if (action.params?.name) {
    const matchingTrinket = state.trinkets.find((trinket) => trinket.itemName === action.params?.name);
    if (!matchingTrinket) {
      return null;
    }
    return spells.get(action.params.name) ?? null;
  }

  if (action.params?.slot === 'trinket1') {
    const itemName = state.trinkets[0]?.itemName;
    return itemName ? spells.get(itemName) ?? null : null;
  }

  if (action.params?.slot === 'trinket2') {
    const itemName = state.trinkets[1]?.itemName;
    return itemName ? spells.get(itemName) ?? null : null;
  }

  return null;
}

export function createSharedPlayerExecutionHooks(): GameStateExecutionHooks {
  return {
    preCastFailReason: (state, spell): 'not_available' | undefined => {
      if (state.disabledPlayerActions.has(spell.name)) {
        return 'not_available';
      }
      return undefined;
    },
    deferCooldownUntilChannelEnd: (_state, spell): boolean => spell.name === 'algethar_puzzle_box',
    onCooldownStarted: (state, spell, _duration): void => {
      if (spell.name !== 'algethar_puzzle_box') {
        return;
      }

      const slotIndex = state.trinkets.findIndex((trinket) => trinket.itemName === 'algethar_puzzle_box');
      state.pendingUseBuffStartedAt.set(spell.name, state.currentTime);
      if (slotIndex >= 0) {
        state.trinkets[slotIndex].pendingUseBuffStartedAt = state.currentTime;
      }
    },
    onChannelEnd: (state, event, _queue, completedChannel): boolean => {
      if (event.spellId !== 'algethar_puzzle_box') {
        return false;
      }

      const slotIndex = state.trinkets.findIndex((trinket) => trinket.itemName === 'algethar_puzzle_box');
      const startedAt = completedChannel?.startedAt
        ?? state.pendingUseBuffStartedAt.get(event.spellId)
        ?? (slotIndex >= 0 ? state.trinkets[slotIndex].pendingUseBuffStartedAt : undefined);
      if (startedAt === undefined) {
        return false;
      }

      const elapsed = Math.max(0, event.time - startedAt);
      state.delayCooldown('algethar_puzzle_box', elapsed);

      if (slotIndex >= 0) {
        const aplCooldownDuration = SHARED_PLAYER_SPELLS.get('algethar_puzzle_box')?.cooldown;
        if (aplCooldownDuration === undefined) {
          throw new Error('Missing shared spell cooldown for algethar_puzzle_box');
        }
        state.trinkets[slotIndex].cooldownReadyAt = startedAt + aplCooldownDuration;
        state.trinkets[slotIndex].pendingUseBuffStartedAt = undefined;
      }
      state.pendingUseBuffStartedAt.delete(event.spellId);

      return false;
    },
    onAbilityExecuted: (state, spell, rng, queue): void => {
      if (!isSharedProcTriggerSpell(spell)) {
        return;
      }

      const haste = state.getHastePercent();

      if (hasGazeTrinketEquipped(state)) {
        // Step 1: Roll RPPM for Alnsight proc
        const tracker = getGazeRppm(state);
        if (attemptProc(tracker, state.currentTime, haste, rng)) {
          applyTimedSharedBuff(state, queue, 'alnsight', ALNSIGHT_DURATION);
        }

        // Step 2: While Alnsight is active, each ability grants an Alnscorned Essence stack (0.75s ICD)
        if (state.isBuffActive('alnsight')) {
          const lastStack = gazeLastStackTime.get(state) ?? -Infinity;
          if (state.currentTime - lastStack >= ALNSCORNED_ESSENCE_ICD) {
            const currentStacks = state.getBuffStacks('alnscorned_essence');
            const newStacks = Math.min(currentStacks + 1, ALNSCORNED_ESSENCE_MAX_STACKS);
            applyTimedSharedBuff(state, queue, 'alnscorned_essence', ALNSCORNED_ESSENCE_DURATION, newStacks);
            gazeLastStackTime.set(state, state.currentTime);
          }
        }
      }

      const loaProcState = loaProcStates.get(state);
      if (loaProcState && attemptProc(loaProcState.tracker, state.currentTime, haste, rng)) {
        const selectedProc = pickRandomEntry(rng, loaProcState.availableProcs);
        if (selectedProc === 'akilzons_cry_of_victory') {
          applyTimedSharedHasteBuff(state, queue, selectedProc, 15);
        } else {
          applyTimedSharedBuff(state, queue, selectedProc, 15);
        }
      }

      const huntProcState = huntProcStates.get(state);
      if (huntProcState && attemptProc(huntProcState.tracker, state.currentTime, haste, rng)) {
        huntProcState.selectedBuffId ??= resolveRaidRandomHuntBuff(rng);

        if (huntProcState.selectedBuffId === 'hasty_hunt') {
          applyTimedSharedHasteBuff(state, queue, huntProcState.selectedBuffId, 15, huntProcState.sourceStacks);
        } else {
          applyTimedSharedBuff(state, queue, huntProcState.selectedBuffId, 15, huntProcState.sourceStacks);
        }
      }

      const dragonhawkProcState = dragonhawkProcStates.get(state);
      if (dragonhawkProcState && attemptProc(dragonhawkProcState.tracker, state.currentTime, haste, rng)) {
        applyTimedSharedBuff(state, queue, 'precision_of_the_dragonhawk', 15);
      }

      const arcanoweaveProcState = arcanoweaveProcStates.get(state);
      if (arcanoweaveProcState && attemptProc(arcanoweaveProcState.tracker, state.currentTime, haste, rng)) {
        applyTimedSharedBuff(state, queue, 'arcanoweave_insight', ARCANOWEAVE_DURATION);
      }

      const mightOfTheVoidProcState = mightOfTheVoidProcStates.get(state);
      if (mightOfTheVoidProcState && attemptProc(mightOfTheVoidProcState.tracker, state.currentTime, haste, rng)) {
        applyTimedSharedBuff(state, queue, 'might_of_the_void', MIGHT_OF_THE_VOID_DURATION);
      }
    },
  };
}
