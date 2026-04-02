import React from 'react';
import type { CSSProperties } from 'react';
import { SIZES } from '@ui/theme/elvui';
import { ActionBarSlot } from './ActionBarSlot';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { getCooldownCharges } from '@core/engine/spell_usability';
import { getSpellbookForProfileSpec } from '@core/data/specSpellbook';
import type { SpellInputStatus } from '@core/engine/spell_input';
import type { SpellDef } from '@core/data/spells';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';

export interface CooldownTrackerDefinition {
  spellId: string;
  iconName: string;
  emoji: string;
  displayName: string;
  cooldownQuerySpellId?: string;
  procBuffId?: string;
  activeBuffId?: string;
  procOverride?: {
    buffId: string;
    spellId: string;
    cooldownQuerySpellId?: string;
    iconName?: string;
    displayName?: string;
  };
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
  /** Spec spellbook used for talent gating, cooldown totals, and GCD rules. */
  spellbook?: ReadonlyMap<string, SpellDef>;
  /** Presentation metadata for tracked cooldown entries. */
  cooldownDefinitions?: Readonly<Record<string, CooldownTrackerDefinition>>;
}

const DEFAULT_MONK_COOLDOWN_DEFINITIONS: Record<string, CooldownTrackerDefinition> = {
  tiger_palm: { spellId: 'tiger_palm', iconName: 'ability_monk_tigerpalm', emoji: '🐯', displayName: 'Tiger Palm' },
  blackout_kick: { spellId: 'blackout_kick', iconName: 'ability_monk_roundhousekick', emoji: '👊', displayName: 'Blackout Kick', procBuffId: 'combo_breaker' },
  spinning_crane_kick: { spellId: 'spinning_crane_kick', iconName: 'ability_monk_cranekick_new', emoji: '🌀', displayName: 'Spinning Crane Kick', procBuffId: 'dance_of_chi_ji' },
  fists_of_fury: { spellId: 'fists_of_fury', iconName: 'monk_ability_fistoffury', emoji: '👊', displayName: 'Fists of Fury' },
  rising_sun_kick: {
    spellId: 'rising_sun_kick',
    iconName: 'ability_monk_risingsunkick',
    emoji: '☀️',
    displayName: 'Rising Sun Kick',
    procBuffId: 'rushing_wind_kick',
    procOverride: {
      buffId: 'rushing_wind_kick',
      spellId: 'rushing_wind_kick',
      iconName: 'inv12_ability_monk_rushingwindkick',
      displayName: 'Rushing Wind Kick',
    },
  },
  whirling_dragon_punch: { spellId: 'whirling_dragon_punch', iconName: 'ability_monk_hurricanestrike', emoji: '🐉', displayName: 'Whirling Dragon Punch' },
  strike_of_the_windlord: { spellId: 'strike_of_the_windlord', iconName: 'inv_hand_1h_artifactskywall_d_01', emoji: '⚡', displayName: 'Strike of the Windlord' },
  slicing_winds: { spellId: 'slicing_winds', iconName: 'ability_monk_flyingdragonkick', emoji: '💨', displayName: 'Slicing Winds' },
  zenith: { spellId: 'zenith', iconName: 'inv_ability_monk_weaponsoforder', emoji: '✨', displayName: 'Zenith', activeBuffId: 'zenith' },
  invoke_xuen_the_white_tiger: { spellId: 'invoke_xuen_the_white_tiger', iconName: 'ability_monk_summontigerstatue', emoji: '🐅', displayName: 'Invoke Xuen' },
  celestial_conduit: { spellId: 'celestial_conduit', iconName: 'inv_ability_conduitofthecelestialsmonk_celestialconduit', emoji: '🌀', displayName: 'Celestial Conduit' },
  touch_of_death: { spellId: 'touch_of_death', iconName: 'ability_monk_touchofdeath', emoji: '💀', displayName: 'Touch of Death' },
  touch_of_karma: { spellId: 'touch_of_karma', iconName: 'ability_monk_touchofkarma', emoji: '🛡️', displayName: 'Touch of Karma' },
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
  spellbook,
  cooldownDefinitions,
}: CooldownManagerProps): React.ReactElement {
  const effectiveSpellbook = spellbook ?? getSpellbookForProfileSpec('monk');
  const effectiveDefinitions = cooldownDefinitions ?? DEFAULT_MONK_COOLDOWN_DEFINITIONS;
  const gcdRemaining = Math.max(0, gameState.gcdReady - currentTime);
  const gcdTotal = Math.max(0.75, 1.5 / (1 + (gameState.stats?.hastePercent ?? 0) / 100));

  const renderCooldownRow = (trackedIds: readonly string[]): React.ReactElement[] => {
    const visibleIcons = trackedIds.flatMap((spellId) => {
      const def = effectiveDefinitions[spellId];
      if (!def) {
        return [];
      }

      const requiredTalent = effectiveSpellbook.get(def.spellId)?.talentRequired;
      if (requiredTalent && gameState.talents?.has(requiredTalent) !== true) {
        return [];
      }

      return [def];
    });

    return visibleIcons.map((def) => {
      const overrideActive = def.procOverride
        && (gameState.buffs.get(def.procOverride.buffId)?.expiresAt ?? 0) > currentTime;
      const effectiveSpellId = overrideActive ? def.procOverride?.spellId ?? def.spellId : def.spellId;
      const effectiveCooldownSpellId = overrideActive
        ? (def.procOverride?.cooldownQuerySpellId ?? effectiveSpellId)
        : (def.cooldownQuerySpellId ?? effectiveSpellId);
      const effectiveIconName = overrideActive ? (def.procOverride?.iconName ?? def.iconName) : def.iconName;
      const effectiveDisplayName = overrideActive ? (def.procOverride?.displayName ?? def.displayName) : def.displayName;
      const effectiveProcBuffId = overrideActive ? def.procOverride?.buffId : def.procBuffId;
        const effectiveSpell = effectiveSpellbook.get(effectiveSpellId) ?? SHARED_PLAYER_SPELLS.get(effectiveSpellId);
        const tooltipText = effectiveSpell?.id !== undefined
          ? `${effectiveDisplayName}\nSpell ID: ${effectiveSpell.id}`
          : effectiveDisplayName;

      const cd = gameState.cooldowns.get(effectiveCooldownSpellId);
      const chargeInfo = getCooldownCharges(cd, currentTime);
      const cdRemaining = chargeInfo
        ? (chargeInfo.current > 0 ? 0 : chargeInfo.nextChargeIn)
        : Math.max(0, (cd?.readyAt ?? currentTime) - currentTime);
      const usability = spellInputStatus?.get(effectiveSpellId);
      const activeBuffId = def.activeBuffId ?? effectiveSpellbook.get(def.spellId)?.buffApplied;
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
          cdTotal={effectiveSpell?.cooldown ?? 0}
          size={SIZES.cooldownIconLg}
          charges={chargeInfo ? { current: chargeInfo.current, max: chargeInfo.max } : undefined}
          procced={procced}
          usable={usability?.visuallyUsable ?? true}
          activeBuffRemaining={activeBuffRemaining}
          gcdRemaining={effectiveSpell?.isOnGcd ? gcdRemaining : 0}
          gcdTotal={gcdTotal}
          tooltipText={tooltipText}
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
