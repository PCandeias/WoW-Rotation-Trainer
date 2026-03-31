import { SpellData, type SpellEffectData } from '../../dbc/spell_data';
import { Action, type ActionResult } from '../../engine/action';
import { applyActionResult } from '../../engine/action_result';
import { EventType, type SimEvent, type SimEventQueue } from '../../engine/eventQueue';
import type { GameState } from '../../engine/gameState';
import type { RngInstance } from '../../engine/rng';
import {
  getChiProficiencyMagicDamageMultiplier,
  getMartialInstinctsPhysicalDamageMultiplier,
  getWindwalkerBaselineDirectMultiplier,
  setMonkFlurryCharges,
} from './monk_runtime';
import { requireMonkSpellData } from '../../dbc/monk_spell_data';

const HIT_COMBO_BUFF_SPELL = requireMonkSpellData(196741);
const WEAPON_OF_WIND_SPELL = requireMonkSpellData(1272678);

const FEROCITY_OF_XUEN_SPELL = requireMonkSpellData(388674);
const PRIDE_OF_PANDARIA_SPELL = requireMonkSpellData(450979);
const STAND_READY_SPELL = requireMonkSpellData(1262603);
const WISDOM_OF_THE_WALL_SPELL = requireMonkSpellData(1272821);

const FLURRY_STRIKE_DELAY_SECONDS = 0.15;
const STAND_READY_COUNT = STAND_READY_SPELL.effectN(1).base_value();
const STAND_READY_EFFICIENCY_MULTIPLIER = STAND_READY_SPELL.effectN(2).percent();
const WISDOM_OF_THE_WALL_COUNT = WISDOM_OF_THE_WALL_SPELL.effectN(1).base_value();
const WISDOM_OF_THE_WALL_ICD_SECONDS = WISDOM_OF_THE_WALL_SPELL.internal_cooldown_ms() / 1000;

const FLURRY_STRIKE_EFFECTS: SpellEffectData[] = [
  { _id: 0, _subtype: 0, _value: 0, _ap_coefficient: 0.6, _sp_coefficient: 0 },
];

const SHADO_OVER_THE_BATTLEFIELD_EFFECTS: SpellEffectData[] = [
  { _id: 0, _subtype: 0, _value: 0, _ap_coefficient: 0.52, _sp_coefficient: 0 },
];

const FLURRY_STRIKE_SPELL_DATA = new SpellData(450617, 'Flurry Strike', FLURRY_STRIKE_EFFECTS);
const SHADO_OVER_THE_BATTLEFIELD_SPELL_DATA = new SpellData(
  451250,
  'Flurry Strike (Shado Over the Battlefield)',
  SHADO_OVER_THE_BATTLEFIELD_EFFECTS,
);

export enum FlurryStrikeSource {
  FLURRY_STRIKES = 'flurry_strikes',
  STAND_READY = 'stand_ready',
  WISDOM_OF_THE_WALL = 'wisdom_of_the_wall',
}

abstract class MonkFlurryAction extends Action {
  protected actionIsPhysical(): boolean {
    return true;
  }

  override composite_crit_chance(): number {
    let chance = super.composite_crit_chance();
    if (this.p.hasTalent('pride_of_pandaria')) {
      chance += PRIDE_OF_PANDARIA_SPELL.effectN(1).base_value() / 100;
    }
    return chance;
  }

  override composite_da_multiplier(): number {
    // WW spec aura (137025) eff#1 applies -10% to both physical flurry_strike
    // (450617) and magic shado_over_the_battlefield (451250) — confirmed via
    // SimC debug: "modifying Flurry Strike (450617) direct_damage by -10%".
    let mult = super.composite_da_multiplier();
    mult *= getWindwalkerBaselineDirectMultiplier();

    // Hit Combo: 1% per stack to da_mul — applied via parse_effects in SimC.
    // SimC flurry da_mul=0.945 = 0.9×1.05 (5 stacks), confirmed in debug log.
    if (this.p.hasTalent('hit_combo')) {
      mult *= 1 + this.p.hitComboStacks * HIT_COMBO_BUFF_SPELL.effectN(1).percent();
    }

    // Zenith + Weapon of Wind: +10% direct damage when zenith buff is active.
    // SimC parse_effects(buff.zenith) adds effect #2 (base_value modified by
    // WoW from 0 to 10) as a 10% da_mul bonus.
    if (this.p.hasTalent('weapon_of_wind') && this.p.isBuffActive('zenith')) {
      mult *= 1 + WEAPON_OF_WIND_SPELL.effectN(1).percent();
    }

    return mult;
  }

  /**
   * SimC ply_mul = MI(1.04) × Ferocity(1.04) = 1.0816 for flurry.
   * Mastery does NOT apply to flurry (ww_mastery=false in SimC constructor).
   * Hit Combo is in da_mul, not ply_mul.
   */
  override composite_player_multiplier(_isComboStrike: boolean): number {
    let mult = super.composite_player_multiplier(_isComboStrike);

    // MI (physical) / Chi Proficiency (magic) — maps to SimC ply_mul
    if (this.actionIsPhysical()) {
      mult *= getMartialInstinctsPhysicalDamageMultiplier(this.p);
    } else {
      mult *= getChiProficiencyMagicDamageMultiplier(this.p);
    }

    if (this.p.hasTalent('ferocity_of_xuen')) {
      const rank = this.p.getTalentRank?.('ferocity_of_xuen') ?? 2;
      mult *= 1 + FEROCITY_OF_XUEN_SPELL.effectN(1).percent() * rank;
    }

    return mult;
  }
}

class FlurryStrikeAction extends MonkFlurryAction {
  readonly spellData = FLURRY_STRIKE_SPELL_DATA;

  constructor(
    state: GameState,
    readonly name: 'flurry_strike' | 'flurry_strike_stand_ready' | 'flurry_strike_wisdom_of_the_wall',
    private readonly efficiencyMultiplier = 1,
  ) {
    super(state);
  }

  override composite_da_multiplier(): number {
    return super.composite_da_multiplier() * this.efficiencyMultiplier;
  }
}

class ShadoOverTheBattlefieldAction extends MonkFlurryAction {
  readonly name = 'flurry_strike_shado_over_the_battlefield';
  readonly spellData = SHADO_OVER_THE_BATTLEFIELD_SPELL_DATA;

  protected override actionIsPhysical(): boolean {
    return false;
  }
}

function getFlurryStrikeAction(
  state: GameState,
  spellId: string,
): FlurryStrikeAction | ShadoOverTheBattlefieldAction | undefined {
  switch (spellId) {
    case 'flurry_strike':
      return new FlurryStrikeAction(state, 'flurry_strike');
    case 'flurry_strike_stand_ready':
      return new FlurryStrikeAction(
        state,
        'flurry_strike_stand_ready',
        STAND_READY_EFFICIENCY_MULTIPLIER,
      );
    case 'flurry_strike_wisdom_of_the_wall':
      return new FlurryStrikeAction(state, 'flurry_strike_wisdom_of_the_wall');
    case 'flurry_strike_shado_over_the_battlefield':
      return new ShadoOverTheBattlefieldAction(state);
    default:
      return undefined;
  }
}

function getSourceSpellId(source: FlurryStrikeSource): string {
  switch (source) {
    case FlurryStrikeSource.STAND_READY:
      return 'flurry_strike_stand_ready';
    case FlurryStrikeSource.WISDOM_OF_THE_WALL:
      return 'flurry_strike_wisdom_of_the_wall';
    case FlurryStrikeSource.FLURRY_STRIKES:
    default:
      return 'flurry_strike';
  }
}

function getFlurryStrikeCount(state: GameState, source: FlurryStrikeSource): number {
  switch (source) {
    case FlurryStrikeSource.FLURRY_STRIKES: {
      const count = Math.max(state.flurryCharges, state.getBuffStacks('flurry_charge'));
      setMonkFlurryCharges(state, 0);
      return count;
    }
    case FlurryStrikeSource.STAND_READY:
      if (!state.isBuffActive('stand_ready')) {
        return 0;
      }
      state.expireBuff('stand_ready');
      return STAND_READY_COUNT;
    case FlurryStrikeSource.WISDOM_OF_THE_WALL:
      if (!state.hasTalent('wisdom_of_the_wall')) {
        return 0;
      }
      if (!state.isBuffActive('zenith')) {
        return 0;
      }
      if (!state.isCooldownReady('wisdom_of_the_wall')) {
        return 0;
      }
      state.startCooldown('wisdom_of_the_wall', WISDOM_OF_THE_WALL_ICD_SECONDS);
      return WISDOM_OF_THE_WALL_COUNT;
    default:
      return 0;
  }
}

/**
 * Consume the relevant flurry source and build the delayed impact events.
 */
export function triggerFlurryStrikes(state: GameState, source: FlurryStrikeSource): SimEvent[] {
  const count = Math.max(0, getFlurryStrikeCount(state, source));
  if (count === 0) {
    return [];
  }

  const sourceSpellId = getSourceSpellId(source);
  const events: SimEvent[] = [];

  if (source === FlurryStrikeSource.STAND_READY) {
    events.push({ type: EventType.BUFF_EXPIRE, time: state.currentTime, buffId: 'stand_ready' });
  }

  for (let i = 0; i < count; i++) {
    const delay = i * FLURRY_STRIKE_DELAY_SECONDS;
    events.push({
      type: EventType.DELAYED_SPELL_IMPACT,
      time: state.currentTime + delay,
      spellId: sourceSpellId,
    });

    if (state.hasTalent('shado_over_the_battlefield')) {
      events.push({
        type: EventType.DELAYED_SPELL_IMPACT,
        time: state.currentTime + delay,
        spellId: 'flurry_strike_shado_over_the_battlefield',
      });
    }
  }

  return events;
}

/**
 * Resolve a delayed flurry child impact through the monk action chain.
 */
export function processDelayedSpellImpact(
  spellId: string,
  state: GameState,
  queue: SimEventQueue,
  rng: RngInstance,
): ActionResult | undefined {
  const action = getFlurryStrikeAction(state, spellId);
  if (!action) {
    return undefined;
  }

  const result = action.execute(queue, rng, false);
  state.addDamage(result.damage);
  state.recordPendingSpellStat(action.name, result.damage, 1, result.isCrit);
  applyActionResult(state, queue, [], result);
  return result;
}
