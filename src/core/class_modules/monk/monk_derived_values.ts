// src/core/class_modules/monk/monk_derived_values.ts
//
// Centralized monk-derived constants and DBC-backed values.
// All WW spec scalars and buff constants that appear in multiple action files
// or as one-off hardcoded literals belong here to prevent drift.

import { requireMonkSpellData } from '../../dbc/monk_spell_data';
import { MONK_WW_BUFFS } from '../../data/spells/monk_windwalker';

// ---------------------------------------------------------------------------
// WW passive (137025) — spec damage scalars
// ---------------------------------------------------------------------------

const _WW_PASSIVE_SPELL = requireMonkSpellData(137025);

/**
 * SCK spec multiplier: WW passive (137025) effectN(18) = +1647% → ×17.47.
 * Applied in SpinningCraneKickAction.composite_da_multiplier() on top of
 * the generic WW baseline multiplier.
 */
export const SCK_WW_SPEC_MULTIPLIER = 1 + _WW_PASSIVE_SPELL.effectN(18).base_value() / 100;

/**
 * BoK spec multiplier: WW aura (137025) effectN(14) = +329% → ×4.29.
 * The DBC snapshot does not include effectN(14) of 137025; value is from
 * SimC sc_monk.cpp. Also used as the numerator when computing the
 * teachings_of_the_monastery net factor (4.29 × 0.25 = 1.0725).
 */
export const BOK_WW_SPEC_MULTIPLIER = 4.29;

// ---------------------------------------------------------------------------
// Martial Agility auto-attack haste
// ---------------------------------------------------------------------------

/**
 * Martial Agility base auto-attack haste bonus (%).
 * Source: SimC — +30% haste to auto attacks when the talent is selected.
 */
export const MARTIAL_AGILITY_BASE_HASTE_PCT = 30;

/**
 * Martial Agility Zenith auto-attack haste bonus (%).
 * Source: SimC — Zenith doubles the Martial Agility haste bonus to 60%.
 */
export const MARTIAL_AGILITY_ZENITH_HASTE_PCT = 60;

// ---------------------------------------------------------------------------
// Thunderfist buff constants
// ---------------------------------------------------------------------------

const _THUNDERFIST_TALENT_SPELL = requireMonkSpellData(392985);
const _THUNDERFIST_BUFF_SPELL = requireMonkSpellData(393565);

/** Thunderfist stacks granted on the primary target hit (effectN(1) of talent 392985 = 4). */
export const THUNDERFIST_BASE_STACKS: number = _THUNDERFIST_TALENT_SPELL.effectN(1).base_value();

/** Maximum Thunderfist buff stacks (buff 393565 max_stacks = 10). */
export const THUNDERFIST_MAX_STACKS: number =
  _THUNDERFIST_BUFF_SPELL.max_stacks() > 0
    ? _THUNDERFIST_BUFF_SPELL.max_stacks()
    : (MONK_WW_BUFFS.get('thunderfist')?.maxStacks ?? 10);

/** Thunderfist buff duration in seconds (buff 393565 duration_ms = 60 000 ms). */
export const THUNDERFIST_DURATION_SECONDS: number =
  _THUNDERFIST_BUFF_SPELL.duration_ms() > 0
    ? _THUNDERFIST_BUFF_SPELL.duration_ms() / 1000
    : (MONK_WW_BUFFS.get('thunderfist')?.duration ?? 60);

// ---------------------------------------------------------------------------
// Teachings of the Monastery buff constants
// ---------------------------------------------------------------------------

/** Base maximum stacks for Teachings of the Monastery before Knowledge of the Broken Temple extends the cap. */
export const TEACHINGS_OF_THE_MONASTERY_BASE_MAX_STACKS: number =
  MONK_WW_BUFFS.get('teachings_of_the_monastery')?.maxStacks ?? 4;

/** Teachings of the Monastery buff duration in seconds. */
export const TEACHINGS_OF_THE_MONASTERY_DURATION_SECONDS: number =
  MONK_WW_BUFFS.get('teachings_of_the_monastery')?.duration ?? 20;

// ---------------------------------------------------------------------------
// Combo Breaker (Blackout Reinforcement) buff constants
// ---------------------------------------------------------------------------

/** Maximum Combo Breaker buff stacks. */
export const COMBO_BREAKER_MAX_STACKS: number =
  MONK_WW_BUFFS.get('combo_breaker')?.maxStacks ?? 2;

/** Combo Breaker buff duration in seconds. */
export const COMBO_BREAKER_DURATION_SECONDS: number =
  MONK_WW_BUFFS.get('combo_breaker')?.duration ?? 15;
