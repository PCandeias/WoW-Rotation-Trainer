import type { GameStateSnapshot } from '../../engine/gameState';
import { PLAYER_EFFECT_BUFF_REGISTRY } from '../../shared/player_effect_buff_registry';

type BuffRegistry = Record<string, { iconName?: string; emoji?: string; displayName?: string; hideTimer?: boolean }>;

const COMBO_STRIKE_SPELL_ICONS: Record<string, string> = {
  tiger_palm: 'ability_monk_tigerpalm',
  blackout_kick: 'ability_monk_roundhousekick',
  rising_sun_kick: 'ability_monk_risingsunkick',
  fists_of_fury: 'monk_ability_fistoffury',
  whirling_dragon_punch: 'ability_monk_hurricanestrike',
  strike_of_the_windlord: 'inv_hand_1h_artifactskywall_d_01',
  spinning_crane_kick: 'ability_monk_cranekick_new',
  slicing_winds: 'ability_monk_flyingdragonkick',
  rushing_wind_kick: 'inv12_ability_monk_rushingwindkick',
};

export function resolveMonkBuffIconName(
  buffId: string,
  gameState: GameStateSnapshot,
  fallback?: string,
): string | undefined {
  if (buffId !== 'combo_strikes') return fallback;

  const lastComboSpell = gameState.lastComboStrikeAbility;
  if (!lastComboSpell) return fallback;

  return COMBO_STRIKE_SPELL_ICONS[lastComboSpell] ?? fallback;
}

export const MONK_BUFF_REGISTRY: BuffRegistry = {
  ...PLAYER_EFFECT_BUFF_REGISTRY,
  zenith:                    { iconName: 'inv_ability_monk_weaponsoforder', emoji: '✨', displayName: 'Zenith' },
  combo_strikes:             { iconName: 'ability_monk_palmstrike',       emoji: '🥋', displayName: 'Combo Strikes', hideTimer: true },
  hit_combo:                 { iconName: 'ability_monk_palmstrike',       emoji: '🔗', displayName: 'Hit Combo' },
  blackout_reinforcement:    { iconName: 'ability_monk_roundhousekick',   emoji: '👊', displayName: 'Blackout Kick!' },
  dance_of_chi_ji:           { iconName: 'ability_monk_quitornado',       emoji: '🌀', displayName: 'Dance of Chi-Ji' },
  rushing_wind_kick:         { iconName: 'inv12_ability_monk_rushingwindkick', emoji: '🌪️', displayName: 'Rushing Wind Kick' },
  flurry_charge:             { iconName: 'inv_ability_shadopanmonk_flurrystrikes', emoji: '💨', displayName: 'Flurry Charges', hideTimer: true },
  momentum_boost:            { iconName: 'inv_belt_leather_raidmonk_n_01', emoji: '⚡', displayName: 'Momentum Boost' },
  momentum_boost_damage:     { iconName: 'inv_belt_leather_raidmonk_n_01', emoji: '⚡', displayName: 'Momentum (Damage)' },
  momentum_boost_speed:      { iconName: 'inv_belt_leather_raidmonk_n_01', emoji: '⚡', displayName: 'Momentum (Speed)' },
  memory_of_the_monastery:   { iconName: 'ability_monk_tigerpalm',        emoji: '🐯', displayName: 'Memory of the Monastery' },
  teachings_of_the_monastery:{ iconName: 'passive_monk_teachingsofmonastery', emoji: '📖', displayName: 'Teachings' },
  whirling_dragon_punch:     { iconName: 'ability_monk_hurricanestrike',   emoji: '🐉', displayName: 'Whirling Dragon Punch' },
  stand_ready:               { iconName: 'ability_monk_tigerpalm',        emoji: '🐯', displayName: 'Stand Ready' },
  pressure_point:            { iconName: 'monk_ability_fistoffury',       emoji: '👊', displayName: 'Pressure Point' },
  tigereye_brew_1:           { iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'Tigereye Brew' },
  tigereye_brew_3:           { iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'Tigereye Brew (FoF)' },
  zenith_teb_crit:           { iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'TEB Zenith Crit' },
  combat_wisdom:             { iconName: 'ability_monk_tigerpalm',        emoji: '📖', displayName: 'Combat Wisdom', hideTimer: true },
  celestial_conduit_active:  { iconName: 'inv_ability_conduitofthecelestialsmonk_celestialconduit', emoji: '🌀', displayName: 'Celestial Conduit' },
};
