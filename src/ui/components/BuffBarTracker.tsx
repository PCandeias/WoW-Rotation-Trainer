import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS } from '@ui/theme/elvui';
import { AbilityIcon } from './AbilityIcon';
import type { GameStateSnapshot } from '@core/engine/gameState';

interface TrackedBuffDef {
  buffId: string;
  iconName: string;
  emoji: string;
  displayName: string;
  color: string;
  showStacks: boolean;
}

export interface BuffBarTrackerProps {
  gameState: GameStateSnapshot;
  currentTime: number;
  blacklist?: string[];
  whitelist?: string[];
  containerStyle?: CSSProperties;
}

const TRACKED_BUFFS: TrackedBuffDef[] = [
  { buffId: 'zenith', iconName: 'inv_ability_monk_weaponsoforder', emoji: '✨', displayName: 'Zenith', color: '#ffdd44', showStacks: false },
  { buffId: 'hit_combo', iconName: 'ability_monk_palmstrike', emoji: '🔗', displayName: 'Hit Combo', color: '#00cc7a', showStacks: true },
  { buffId: 'combo_strikes', iconName: 'ability_monk_palmstrike', emoji: '🥋', displayName: 'Combo Strikes', color: '#44aaff', showStacks: false },
  { buffId: 'blackout_reinforcement', iconName: 'ability_monk_roundhousekick', emoji: '👊', displayName: 'Blackout Kick!', color: '#8844cc', showStacks: true },
  { buffId: 'dance_of_chi_ji', iconName: 'ability_monk_quitornado', emoji: '🌀', displayName: 'Dance of Chi-Ji', color: '#44aaff', showStacks: false },
  { buffId: 'rushing_wind_kick', iconName: 'inv12_ability_monk_rushingwindkick', emoji: '🌪️', displayName: 'Rushing Wind Kick', color: '#00ccaa', showStacks: false },
  { buffId: 'flurry_charge', iconName: 'inv_ability_shadopanmonk_flurrystrikes', emoji: '💨', displayName: 'Flurry Charges', color: '#44aaff', showStacks: true },
  { buffId: 'memory_of_the_monastery', iconName: 'ability_monk_tigerpalm', emoji: '🐯', displayName: 'Memory of the Monastery', color: '#ffaa66', showStacks: false },
  { buffId: 'teachings_of_the_monastery', iconName: 'passive_monk_teachingsofmonastery', emoji: '📖', displayName: 'Teachings of the Monastery', color: '#c1a5ff', showStacks: true },
  { buffId: 'stand_ready', iconName: 'ability_monk_tigerpalm', emoji: '🐯', displayName: 'Stand Ready', color: '#77e6c2', showStacks: true },
  { buffId: 'momentum_boost', iconName: 'inv_belt_leather_raidmonk_n_01', emoji: '⚡', displayName: 'Momentum Boost', color: '#ffaa00', showStacks: false },
  { buffId: 'combat_wisdom', iconName: 'ability_monk_tigerpalm', emoji: '📖', displayName: 'Combat Wisdom', color: '#99d9ff', showStacks: false },
  { buffId: 'pressure_point', iconName: 'monk_ability_fistoffury', emoji: '👊', displayName: 'Pressure Point', color: '#ff8888', showStacks: false },
  { buffId: 'whirling_dragon_punch', iconName: 'ability_monk_hurricanestrike', emoji: '🐉', displayName: 'Whirling Dragon Punch', color: '#5ec9ff', showStacks: false },
  { buffId: 'celestial_conduit_active', iconName: 'inv_ability_conduitofthecelestialsmonk_celestialconduit', emoji: '🌀', displayName: 'Celestial Conduit', color: '#8ecbff', showStacks: false },
  { buffId: 'tigereye_brew_1', iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'Tigereye Brew', color: '#d9ad4f', showStacks: true },
  { buffId: 'tigereye_brew_3', iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'Tigereye Brew (FoF)', color: '#d98d3d', showStacks: true },
  { buffId: 'zenith_teb_crit', iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺', displayName: 'TEB Zenith Crit', color: '#ffe082', showStacks: true },
];

const BUFF_DURATIONS: Record<string, number> = {
  zenith: 15,
  hit_combo: 30,
  combo_strikes: 3600,
  blackout_reinforcement: 15,
  dance_of_chi_ji: 15,
  rushing_wind_kick: 15,
  flurry_charge: 99,
  memory_of_the_monastery: 30,
  teachings_of_the_monastery: 20,
  stand_ready: 30,
  momentum_boost: 10,
  combat_wisdom: 20,
  pressure_point: 5,
  whirling_dragon_punch: 4,
  celestial_conduit_active: 4,
  tigereye_brew_1: 120,
  tigereye_brew_3: 10,
  zenith_teb_crit: 20,
};

function getTrackedBuffDuration(gameState: GameStateSnapshot, buffId: string): number {
  switch (buffId) {
    case 'zenith':
    case 'zenith_teb_crit':
      return gameState.talents.has('drinking_horn_cover') ? 20 : 15;
    default:
      return BUFF_DURATIONS[buffId] ?? 15;
  }
}

/**
 * Renders the trainer's tracked buffs as Blizzard-style timer bars.
 */
export function BuffBarTracker({
  gameState,
  currentTime,
  blacklist,
  whitelist,
  containerStyle: trackerContainerStyle,
}: BuffBarTrackerProps): React.ReactElement {
  const containerStyle: CSSProperties = {
    display: 'grid',
    gap: '6px',
    ...trackerContainerStyle,
  };

  const barContainerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const trackStyle: CSSProperties = {
    flex: 1,
    height: '18px',
    background: 'rgba(9, 12, 18, 0.96)',
    border: `1px solid ${T.border}`,
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  };

  const innerLabelStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 3px',
    pointerEvents: 'none',
  };

  const leftTextStyle: CSSProperties = {
    fontSize: '9px',
    color: T.textBright,
    fontFamily: FONTS.ui,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const rightTextStyle: CSSProperties = {
    fontSize: '9px',
    color: T.textDim,
    fontFamily: FONTS.ui,
    lineHeight: 1,
    flexShrink: 0,
  };

  const orderedTrackedBuffs = whitelist && whitelist.length > 0
    ? whitelist.flatMap((buffId) => TRACKED_BUFFS.find((def) => def.buffId === buffId) ?? [])
    : TRACKED_BUFFS;

  const buffBars = orderedTrackedBuffs.map((def) => {
    if (whitelist && whitelist.length > 0 && !whitelist.includes(def.buffId)) {
      return null;
    }

    if (blacklist?.includes(def.buffId)) {
      return null;
    }

    const buffState = gameState.buffs.get(def.buffId);
    if (!buffState) {
      return null;
    }

    const { expiresAt, stacks } = buffState;
    const isPermanent = expiresAt === 0;
    if (!isPermanent && expiresAt <= currentTime) {
      return null;
    }

    const maxDuration = getTrackedBuffDuration(gameState, def.buffId);
    const remaining = isPermanent ? 0 : expiresAt - currentTime;
    const fillPct = isPermanent || maxDuration >= 99
      ? 100
      : Math.min(100, Math.max(0, (remaining / maxDuration) * 100));
    const labelText = def.showStacks && stacks > 1 ? `${def.displayName} (${stacks})` : def.displayName;

    const fillStyle: CSSProperties = {
      height: '100%',
      background: `linear-gradient(90deg, ${def.color}, ${def.color}dd)`,
      width: `${fillPct}%`,
      borderRadius: 0,
      boxShadow: 'none',
    };

    return (
      <div key={def.buffId} data-testid={`buff-bar-${def.buffId}`} style={barContainerStyle}>
        <AbilityIcon iconName={def.iconName} emoji={def.emoji} size={18} />
        <div style={trackStyle}>
          <div data-testid={`buff-fill-${def.buffId}`} style={fillStyle} />
          <div style={innerLabelStyle}>
            <span style={leftTextStyle}>{labelText}</span>
            {!isPermanent && maxDuration < 99 && (
              <span style={rightTextStyle}>{remaining.toFixed(1)}s</span>
            )}
          </div>
        </div>
      </div>
    );
  });

  return (
    <div style={containerStyle}>
      <div style={{ display: 'grid', gap: '6px' }}>{buffBars}</div>
    </div>
  );
}

export default BuffBarTracker;
