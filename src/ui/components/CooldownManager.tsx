import React from 'react';
import type { CSSProperties } from 'react';
import { SIZES } from '@ui/theme/elvui';
import { ActionBarSlot } from './ActionBarSlot';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { getCooldownCharges } from '@core/engine/spell_usability';
import { MONK_WW_SPELLS } from '@data/spells/monk_windwalker';
import type { SpellInputStatus } from '@core/engine/spell_input';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';

interface CooldownIconDef {
  spellId: string;
  iconName: string;
  emoji: string;
  displayName: string;
  cdTotal: number;
  talentRequired?: string;
  procBuffId?: string;
}

export interface CooldownManagerProps {
  gameState: GameStateSnapshot;
  /** Sim current time — needed to compute remaining durations. */
  currentTime: number;
  /** Whether the essential cooldown section should render. */
  showEssential?: boolean;
  /** Whether the utility cooldown section should render. */
  showUtility?: boolean;
  /** Optional allowlist of essential entry ids. */
  essentialTrackedIds?: readonly string[];
  /** Optional allowlist of utility entry ids. */
  utilityTrackedIds?: readonly string[];
  /** Icons per row for the essential cooldown group. */
  essentialIconsPerRow?: number;
  /** Icons per row for the utility cooldown group. */
  utilityIconsPerRow?: number;
  /** Engine-derived input state for action-bar-like usability tinting. */
  spellInputStatus?: ReadonlyMap<string, SpellInputStatus>;
}

const COOLDOWN_ICON_DEFS: Record<string, CooldownIconDef> = {
  tiger_palm: { spellId: 'tiger_palm', iconName: 'ability_monk_tigerpalm', emoji: '🐯', displayName: 'Tiger Palm', cdTotal: 0 },
  blackout_kick: { spellId: 'blackout_kick', iconName: 'ability_monk_roundhousekick', emoji: '👊', displayName: 'Blackout Kick', cdTotal: 0, procBuffId: 'blackout_reinforcement' },
  spinning_crane_kick: { spellId: 'spinning_crane_kick', iconName: 'ability_monk_cranekick_new', emoji: '🌀', displayName: 'Spinning Crane Kick', cdTotal: 0, procBuffId: 'dance_of_chi_ji' },
  fists_of_fury: { spellId: 'fists_of_fury', iconName: 'monk_ability_fistoffury', emoji: '👊', displayName: 'Fists of Fury', cdTotal: 20 },
  rising_sun_kick: { spellId: 'rising_sun_kick', iconName: 'ability_monk_risingsunkick', emoji: '☀️', displayName: 'Rising Sun Kick', cdTotal: 10, procBuffId: 'rushing_wind_kick' },
  whirling_dragon_punch: { spellId: 'whirling_dragon_punch', iconName: 'ability_monk_hurricanestrike', emoji: '🐉', displayName: 'Whirling Dragon Punch', cdTotal: 13, talentRequired: 'whirling_dragon_punch' },
  strike_of_the_windlord: { spellId: 'strike_of_the_windlord', iconName: 'inv_hand_1h_artifactskywall_d_01', emoji: '⚡', displayName: 'Strike of the Windlord', cdTotal: 40, talentRequired: 'strike_of_the_windlord' },
  slicing_winds: { spellId: 'slicing_winds', iconName: 'ability_monk_flyingdragonkick', emoji: '💨', displayName: 'Slicing Winds', cdTotal: 30, talentRequired: 'slicing_winds' },
  zenith: { spellId: 'zenith', iconName: 'inv_ability_monk_weaponsoforder', emoji: '✨', displayName: 'Zenith', cdTotal: 90, talentRequired: 'zenith' },
  invoke_xuen_the_white_tiger: { spellId: 'invoke_xuen_the_white_tiger', iconName: 'ability_monk_summontigerstatue', emoji: '🐅', displayName: 'Invoke Xuen', cdTotal: 120, talentRequired: 'invoke_xuen_the_white_tiger' },
  celestial_conduit: { spellId: 'celestial_conduit', iconName: 'inv_ability_conduitofthecelestialsmonk_celestialconduit', emoji: '🌀', displayName: 'Celestial Conduit', cdTotal: 90, talentRequired: 'celestial_conduit' },
  touch_of_death: { spellId: 'touch_of_death', iconName: 'ability_monk_touchofdeath', emoji: '💀', displayName: 'Touch of Death', cdTotal: 180 },
  touch_of_karma: { spellId: 'touch_of_karma', iconName: 'ability_monk_touchofkarma', emoji: '🛡️', displayName: 'Touch of Karma', cdTotal: 90 },
};

const ESSENTIAL_CD_IDS: readonly string[] = [
  'tiger_palm',
  'blackout_kick',
  'spinning_crane_kick',
  'fists_of_fury',
  'rising_sun_kick',
  'whirling_dragon_punch',
  'strike_of_the_windlord',
  'slicing_winds',
  'zenith',
  'invoke_xuen_the_white_tiger',
  'celestial_conduit',
];

const UTILITY_CD_IDS: readonly string[] = [
  'touch_of_death',
  'touch_of_karma',
];

/**
 * Configurable encounter cooldown tracker split into essential and utility sections.
 */
export function CooldownManager({
  gameState,
  currentTime,
  showEssential = true,
  showUtility = true,
  essentialTrackedIds,
  utilityTrackedIds,
  essentialIconsPerRow = 12,
  utilityIconsPerRow = 12,
  spellInputStatus,
}: CooldownManagerProps): React.ReactElement {
  const getTalentRequirement = (def: CooldownIconDef): string | undefined => (
    def.talentRequired ?? MONK_WW_SPELLS.get(def.spellId)?.talentRequired
  );
  const gcdRemaining = Math.max(0, gameState.gcdReady - currentTime);
  const gcdTotal = Math.max(0.75, 1.5 / (1 + (gameState.stats?.hastePercent ?? 0) / 100));

  const renderCooldownRow = (trackedIds: readonly string[]): React.ReactElement[] => {
    const visibleIcons = trackedIds.flatMap((spellId) => {
      const def = COOLDOWN_ICON_DEFS[spellId];
      if (!def) {
        return [];
      }

      const requiredTalent = getTalentRequirement(def);
      if (requiredTalent && gameState.talents?.has(requiredTalent) !== true) {
        return [];
      }

      return [def];
    });

    return visibleIcons.map((def) => {
      const isRskOverride = def.spellId === 'rising_sun_kick'
        && (gameState.buffs.get('rushing_wind_kick')?.expiresAt ?? 0) > currentTime;
      const effectiveSpellId = isRskOverride ? 'rushing_wind_kick' : def.spellId;
      const effectiveIconName = isRskOverride ? 'inv12_ability_monk_rushingwindkick' : def.iconName;
      const effectiveDisplayName = isRskOverride ? 'Rushing Wind Kick' : def.displayName;
      const effectiveProcBuffId = isRskOverride ? 'rushing_wind_kick' : def.procBuffId;
      const effectiveSpell = MONK_WW_SPELLS.get(effectiveSpellId) ?? SHARED_PLAYER_SPELLS.get(effectiveSpellId);

      const cd = gameState.cooldowns.get(effectiveSpellId);
      const chargeInfo = getCooldownCharges(cd, currentTime);
      const cdRemaining = chargeInfo
        ? (chargeInfo.current > 0 ? 0 : chargeInfo.nextChargeIn)
        : Math.max(0, (cd?.readyAt ?? currentTime) - currentTime);
      const usability = spellInputStatus?.get(effectiveSpellId);
      const activeBuffId = MONK_WW_SPELLS.get(def.spellId)?.buffApplied ?? (def.spellId === 'zenith' ? 'zenith' : undefined);
      const activeBuffRemaining = activeBuffId
        ? Math.max(0, (gameState.buffs.get(activeBuffId)?.expiresAt ?? 0) - currentTime)
        : 0;
      const procced = effectiveProcBuffId !== undefined
        && (gameState.buffs.get(effectiveProcBuffId)?.expiresAt ?? 0) > currentTime;

      return (
        <ActionBarSlot
          key={def.spellId}
          iconName={effectiveIconName}
          emoji={def.emoji}
          abilityName={effectiveDisplayName}
          cdRemaining={cdRemaining}
          cdTotal={def.cdTotal}
          size={SIZES.cooldownIconLg}
          charges={chargeInfo ? { current: chargeInfo.current, max: chargeInfo.max } : undefined}
          procced={procced}
          usable={usability?.visuallyUsable ?? true}
          activeBuffRemaining={activeBuffRemaining}
          gcdRemaining={effectiveSpell?.isOnGcd ? gcdRemaining : 0}
          gcdTotal={gcdTotal}
        />
      );
    });
  };

  const containerStyle: CSSProperties = {
    display: 'grid',
    gap: '10px',
  };

  const cdRowStyle = (iconsPerRow: number): CSSProperties => ({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    justifyContent: 'center',
    alignContent: 'flex-start',
    width: `${Math.max(1, iconsPerRow) * SIZES.cooldownIconLg + Math.max(0, iconsPerRow - 1) * 6}px`,
  });

  const essentialIcons = showEssential
    ? renderCooldownRow(essentialTrackedIds ?? ESSENTIAL_CD_IDS)
    : null;
  const utilityIcons = showUtility
    ? renderCooldownRow(utilityTrackedIds ?? UTILITY_CD_IDS)
    : null;

  if ((!showEssential || essentialIcons?.length === 0) && (!showUtility || utilityIcons?.length === 0)) {
    return <></>;
  }

  return (
    <div style={containerStyle}>
      {showEssential && essentialIcons && essentialIcons.length > 0 && (
        <div data-testid="cooldown-section-essential">
          <div style={cdRowStyle(essentialIconsPerRow)}>{essentialIcons}</div>
        </div>
      )}

      {showUtility && utilityIcons && utilityIcons.length > 0 && (
        <div data-testid="cooldown-section-utility">
          <div style={cdRowStyle(utilityIconsPerRow)}>{utilityIcons}</div>
        </div>
      )}
    </div>
  );
}

export default CooldownManager;
