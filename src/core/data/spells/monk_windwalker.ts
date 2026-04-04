/**
 * WW Monk Shado-Pan Spell Database
 *
 * Hand-authored typed spell and buff definitions for the Windwalker Monk
 * Shado-Pan build used in the WoW Rotation Trainer simulator.
 */

import { SHARED_PLAYER_BUFFS, SHARED_PLAYER_SPELLS } from '../../shared/player_effects';
import type { BuffDef, SpellDef } from './types';

export type { BuffDef, SpellDef } from './types';
export { spellRequiresGcdReady } from './types';

// ---------------------------------------------------------------------------
// Spell definitions
// ---------------------------------------------------------------------------

const SPELLS: SpellDef[] = [
  // Tiger Palm — Windwalker passive makes this an effective 60 energy builder
  {
    id: 100787,
    name: 'tiger_palm',
    displayName: 'Tiger Palm',
    energyCost: 60,
    chiCost: 0,
    chiGain: 2,
    cooldown: 0,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0.9,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:797
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Blackout Kick — 1 chi cost, no cooldown
  {
    id: 100784,
    name: 'blackout_kick',
    displayName: 'Blackout Kick',
    energyCost: 0,
    chiCost: 1,
    chiGain: 0,
    cooldown: 0,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0.847,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:1267
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Blackout Kick (free proc variant — BoK! proc, 0 chi cost, same damage)
  {
    id: 100784001, // Pseudo-ID for the free proc variant (BoK! — Blackout Reinforcement); differs from base BoK for event logging
    name: 'blackout_kick_free',
    displayName: 'Blackout Kick (Free)',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 0,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0.847,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // same action as blackout_kick in SimC
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Rising Sun Kick — 2 chi, 10s CD (haste scaled)
  {
    id: 107428,
    name: 'rising_sun_kick',
    displayName: 'Rising Sun Kick',
    energyCost: 0,
    chiCost: 2,
    chiGain: 0,
    cooldown: 10,
    hasteScalesCooldown: true,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 1.438,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:1007
    talentRequired: 'rising_sun_kick',
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Rushing Wind Kick — proc-enabled RSK replacement after consuming BoK!
  {
    id: 467307,
    name: 'rushing_wind_kick',
    displayName: 'Rushing Wind Kick',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 0,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 1.7975,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:1047
    talentRequired: 'rushing_wind_kick',
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
    isPhysical: false,
  },

  // Zenith — 2 charges with a 90s recharge, plus a 16s per-cast lockout
  // Spell data effect #9: Energize Power, chi, 2 (grants 2 chi on cast)
  // Also resets RSK cooldown on cast (handled in executor.ts).
  {
    id: 1249625,
    name: 'zenith',
    displayName: 'Zenith',
    energyCost: 0,
    chiCost: 0,
    chiGain: 2,
    cooldown: 90,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: false,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:3639 (zenith_stomp_t)
    talentRequired: 'zenith',
    isWdp: false,
    isZenith: true,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Fists of Fury — 3 chi, 24s CD (haste), channeled 5 ticks over 4s
  {
    id: 113656,
    name: 'fists_of_fury',
    displayName: 'Fists of Fury',
    energyCost: 0,
    chiCost: 3,
    chiGain: 0,
    cooldown: 24,
    hasteScalesCooldown: true,
    isChanneled: true,
    channelDuration: 4,
    channelTicks: 5,
    isOnGcd: true,
    apCoefficient: 2.6082,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:1609 (jadefire_stomp_t)
    talentRequired: 'fists_of_fury',
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
    autoAttackInterruption: { delayAtCastStart: true, duringChannel: 'suppress' },
  },

  // Whirling Dragon Punch — 35s base CD, reduced by talents/set bonuses
  {
    id: 152175,
    name: 'whirling_dragon_punch',
    displayName: 'Whirling Dragon Punch',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 35,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 4.5,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:1695
    talentRequired: 'whirling_dragon_punch',
    isWdp: true,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Spinning Crane Kick — 2 chi, no CD, channeled 4 ticks over 1.5s
  // (period=0.5s + extra-initial-period => ticks at 0.0/0.5/1.0/1.5 before haste scaling)
  {
    id: 101546,
    name: 'spinning_crane_kick',
    displayName: 'Spinning Crane Kick',
    energyCost: 0,
    chiCost: 2,       // effective cost managed by SpinningCraneKickAction.chiCost()
    chiGain: 0,
    cooldown: 0,
    hasteScalesCooldown: false,
    isChanneled: true,          // channeled: 4 ticks over 1.5s
    channelDuration: 1.5,
    channelTicks: 4,
    isOnGcd: true,
    apCoefficient: 0.1,         // per-tick; total = 0.40 AP over 4 ticks
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:1455 (jade_ignition_t)
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
    autoAttackInterruption: { duringChannel: 'continue' },
  },

  // Strike of the Windlord — 2 chi, 35s CD
  {
    id: 392983,
    name: 'strike_of_the_windlord',
    displayName: 'Strike of the Windlord',
    energyCost: 0,
    chiCost: 2,
    chiGain: 0,
    cooldown: 35,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 2.2,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:1809
    talentRequired: 'strike_of_the_windlord',
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Slicing Winds — ShadoPan spec row 9 talent (replaces Flying Serpent Kick)
  // 2 chi, 30s CD, nature school (no armor). Damage via SlicingWindsAction.
  // Source: SimC sc_monk.cpp cooldown=30s; damage spell 1217411 AP 4.48
  {
    id: 1217413,              // cast spell ID; damage handled by MONK_DBC[1217411]
    name: 'slicing_winds',
    displayName: 'Slicing Winds',
    energyCost: 0,
    chiCost: 2,               // managed by SlicingWindsAction.chiCost()
    chiGain: 0,
    cooldown: 30,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0,         // damage via SlicingWindsAction; 0 prevents executor fallback calc
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:2618 (slicing_winds damage_t)
    talentRequired: 'slicing_winds',
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
    isPhysical: false,
  },

  // Touch of Death — 180s CD, execute (no AP coefficient for direct damage)
  {
    id: 322109,
    name: 'touch_of_death',
    displayName: 'Touch of Death',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 180,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:2318
    isWdp: false,
    isZenith: false,
    isExecute: true,
    executeHpDamage: 1.0,
  },

  // Invoke Xuen, the White Tiger — 120s CD
  {
    id: 123904,
    name: 'invoke_xuen_the_white_tiger',
    displayName: 'Invoke Xuen, the White Tiger',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 120,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    talentRequired: 'invoke_xuen_the_white_tiger',
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Celestial Conduit — 90s CD, channeled 4 ticks over 4s
  {
    id: 443028,
    name: 'celestial_conduit',
    displayName: 'Celestial Conduit',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 90,
    hasteScalesCooldown: false,
    isChanneled: true,
    channelDuration: 4,
    channelTicks: 4,
    isOnGcd: true,
    apCoefficient: 2.2,
    baseDmgMin: 0,
    baseDmgMax: 0,
    autoAttackInterruption: { duringChannel: 'continue' },
    buffApplied: 'celestial_conduit_active',
    buffDuration: 4,
    buffMaxStacks: 1,
    requiresComboStrike: false,
    mayComboStrike: true,  // sc_monk.cpp:3582 (tick_action_t)
    talentRequired: 'celestial_conduit',
    isWdp: false,
    isZenith: true,
    isExecute: false,
    executeHpDamage: 0,
  },

  // Touch of Karma — defensive, no damage coefficient, 90s CD
  {
    id: 122470,
    name: 'touch_of_karma',
    displayName: 'Touch of Karma',
    energyCost: 0,
    chiCost: 0,
    chiGain: 0,
    cooldown: 90,
    hasteScalesCooldown: false,
    isChanneled: false,
    channelDuration: 0,
    channelTicks: 0,
    isOnGcd: true,
    apCoefficient: 0,
    baseDmgMin: 0,
    baseDmgMax: 0,
    requiresComboStrike: false,
    isWdp: false,
    isZenith: false,
    isExecute: false,
    executeHpDamage: 0,
  },
];

// ---------------------------------------------------------------------------
// Buff definitions
// ---------------------------------------------------------------------------

const BUFFS: BuffDef[] = [
  {
    id: 'hit_combo',
    displayName: 'Hit Combo',
    duration: 30,
    maxStacks: 5,
    isHarmful: false,
  },
  {
    id: 'combo_strikes',
    displayName: 'Combo Strikes',
    duration: 3600,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'combo_breaker',
    displayName: 'Combo Breaker',
    duration: 15,
    maxStacks: 2,
    isHarmful: false,
    stackExpirationModel: 'separate' as const,
  },
  {
    id: 'dance_of_chi_ji',
    displayName: 'Dance of Chi-Ji',
    duration: 15,
    maxStacks: 2,
    isHarmful: false,
  },
  {
    id: 'zenith',
    displayName: 'Zenith',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'celestial_conduit_active',
    displayName: 'Celestial Conduit',
    duration: 4,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'rushing_wind_kick',
    displayName: 'Rushing Wind Kick',
    duration: 15,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'whirling_dragon_punch',
    displayName: 'Whirling Dragon Punch',
    duration: 4,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'teachings_of_the_monastery',
    displayName: 'Teachings of the Monastery',
    duration: 20,
    maxStacks: 4,
    isHarmful: false,
  },
  {
    id: 'stand_ready',
    displayName: 'Stand Ready',
    duration: 30,
    maxStacks: 10,
    isHarmful: false,
  },
  {
    id: 'tigereye_brew_1',
    displayName: 'Tigereye Brew',
    duration: 120,
    maxStacks: 20,
    isHarmful: false,
  },
  {
    id: 'tigereye_brew_3',
    displayName: 'Tigereye Brew 3',
    duration: 10,
    maxStacks: 10,
    isHarmful: false,
  },
  {
    id: 'zenith_teb_crit',
    displayName: 'Tigereye Brew (Zenith)',
    duration: 20,
    maxStacks: 20,
    isHarmful: false,
  },
  {
    id: 'momentum_boost_damage',
    displayName: 'Momentum Boost Damage',
    duration: 10,
    maxStacks: 10,
    isHarmful: false,
  },
  {
    id: 'momentum_boost_speed',
    displayName: 'Momentum Boost',
    duration: 8,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'combat_wisdom',
    displayName: 'Combat Wisdom',
    duration: 20,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'pressure_point',
    displayName: 'Pressure Point',
    duration: 5,
    maxStacks: 1,
    isHarmful: false,
  },
  {
    id: 'bonedust_brew',
    displayName: 'Bonedust Brew',
    duration: 10,
    maxStacks: 1,
    isHarmful: true,
  },
];

// ---------------------------------------------------------------------------
// Exported maps
// ---------------------------------------------------------------------------

/** All WW Monk spells, keyed by ability name (machine name). */
export const MONK_WW_SPELLS = new Map<string, SpellDef>(
  [...SPELLS, ...SHARED_PLAYER_SPELLS.values()].map((s) => [s.name, s])
);

/** All WW Monk buffs/debuffs, keyed by buff id (machine name). */
export const MONK_WW_BUFFS = new Map<string, BuffDef>(
  [...BUFFS, ...SHARED_PLAYER_BUFFS.values()].map((b) => [b.id, b])
);
