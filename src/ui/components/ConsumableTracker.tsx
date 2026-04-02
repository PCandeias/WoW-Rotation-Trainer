import React from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS, SIZES } from '@ui/theme/elvui';
import { ActionBarSlot } from './ActionBarSlot';
import type { GameStateSnapshot } from '@core/engine/gameState';
import { getCooldownCharges } from '@core/engine/spell_usability';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';

interface ConsumableTrackerDef {
  spellId: string;
  iconName: string;
  emoji: string;
  displayName: string;
  cdTotal: number;
  activeBuffId?: string;
}

export interface ConsumableTrackerProps {
  gameState: GameStateSnapshot;
  currentTime: number;
  trackedIds?: readonly string[];
  iconsPerRow?: number;
}

const CONSUMABLE_TRACKERS: readonly ConsumableTrackerDef[] = [
  { spellId: 'berserking', iconName: 'racial_troll_berserk', emoji: '🔴', displayName: 'Berserking', cdTotal: 180, activeBuffId: 'berserking' },
  { spellId: 'algethar_puzzle_box', iconName: 'inv_misc_enggizmos_18', emoji: '💎', displayName: "Algeth'ar Puzzle Box", cdTotal: 120, activeBuffId: 'algethar_puzzle' },
  { spellId: 'potion', iconName: 'inv_12_profession_alchemy_voidpotion_red', emoji: '🧪', displayName: 'Potion', cdTotal: 300, activeBuffId: 'potion_of_recklessness_haste' },
];

/**
 * Separate HUD group for consumables, trinkets, and racials.
 */
export function ConsumableTracker({
  gameState,
  currentTime,
  trackedIds,
  iconsPerRow = 12,
}: ConsumableTrackerProps): React.ReactElement {
  const gcdRemaining = Math.max(0, gameState.gcdReady - currentTime);
  const gcdTotal = Math.max(0.75, 1.5 / (1 + (gameState.stats?.hastePercent ?? 0) / 100));
  const visibleTrackers = CONSUMABLE_TRACKERS.flatMap((def) => {
    if (trackedIds && !trackedIds.includes(normalizeTrackedId(def.spellId))) {
      return [];
    }

    const cooldown = gameState.cooldowns.get(def.spellId);
    const chargeInfo = getCooldownCharges(cooldown, currentTime);
    const cdRemaining = chargeInfo
      ? (chargeInfo.current > 0 ? 0 : chargeInfo.nextChargeIn)
      : Math.max(0, (cooldown?.readyAt ?? currentTime) - currentTime);
    const activeBuffRemaining = def.activeBuffId
      ? Math.max(0, (gameState.buffs.get(def.activeBuffId)?.expiresAt ?? 0) - currentTime)
      : 0;

    if (cdRemaining <= 0 && activeBuffRemaining <= 0) {
      return [];
    }

    return [{
      def,
      chargeInfo,
      cdRemaining,
      activeBuffRemaining,
    }];
  });

  if (visibleTrackers.length === 0) {
    return <></>;
  }

  const containerStyle: CSSProperties = {
    display: 'grid',
    gap: '8px',
  };

  const rowStyle: CSSProperties = {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'flex-start',
    width: `${Math.max(1, iconsPerRow) * SIZES.cooldownIconLg + Math.max(0, iconsPerRow - 1) * 4}px`,
  };

  return (
    <div data-testid="consumable-tracker" style={containerStyle}>
      <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        Consumables
      </div>
      <div data-testid="consumable-tracker-row" style={rowStyle}>
        {visibleTrackers.map(({ def, chargeInfo, cdRemaining, activeBuffRemaining }) => {
          const spell = SHARED_PLAYER_SPELLS.get(def.spellId);

          return (
            <ActionBarSlot
              key={def.spellId}
              iconName={def.iconName}
              emoji={def.emoji}
              abilityName={def.displayName}
              cdRemaining={cdRemaining}
              cdTotal={def.cdTotal}
              size={SIZES.cooldownIconLg}
              charges={chargeInfo ? { current: chargeInfo.current, max: chargeInfo.max } : undefined}
              activeBuffRemaining={activeBuffRemaining}
              gcdRemaining={spell?.isOnGcd ? gcdRemaining : 0}
              gcdTotal={gcdTotal}
              tooltipText={spell?.id !== undefined ? `${def.displayName}\nSpell ID: ${spell.id}` : def.displayName}
            />
          );
        })}
      </div>
    </div>
  );
}

function normalizeTrackedId(spellId: string): string {
  if (spellId === 'algethar_puzzle_box') {
    return 'algethar_puzzle';
  }

  return spellId;
}

export default ConsumableTracker;
