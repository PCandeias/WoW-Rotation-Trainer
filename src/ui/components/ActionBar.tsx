import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ActionBarSlot } from './ActionBarSlot';
import { SIZES, T } from '@ui/theme/elvui';
import type { GameStateSnapshot, CooldownState } from '@core/engine/gameState';
import { MONK_WW_SPELLS } from '@data/spells/monk_windwalker';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';
import type { SpellInputStatus } from '@core/engine/spell_input';
import type { SpellDef } from '@core/data/spells';
import { normalizeKey, normalizeMouseButton } from '@ui/utils/keyUtils';

// ---------------------------------------------------------------------------
// Slot definition
// ---------------------------------------------------------------------------

export interface ActionBarSlotDef {
  spellId: string;
  defaultKey: string;
  cdTotal: number;
  talentRequired?: string;
  procOverride?: { buffId: string; spellId: string };
  procGlow?: { buffId: string };
  isOffGcd?: boolean;
}

export interface ActionBarButtonAssignment {
  spellIds: string[];
  keybind: string;
}

// Icon and emoji data for each spell (SpellDef lacks iconName/emoji fields)
export const SPELL_ICONS: Record<string, { iconName: string; emoji: string }> = {
  tiger_palm:             { iconName: 'ability_monk_tigerpalm',            emoji: '🐯' },
  blackout_kick:          { iconName: 'ability_monk_roundhousekick',       emoji: '👊' },
  rising_sun_kick:        { iconName: 'ability_monk_risingsunkick',        emoji: '☀️' },
  teachings_of_the_monastery: { iconName: 'passive_monk_teachingsofmonastery', emoji: '📖' },
  fists_of_fury:          { iconName: 'monk_ability_fistoffury',           emoji: '👊' },
  whirling_dragon_punch:  { iconName: 'ability_monk_hurricanestrike',      emoji: '🐉' },
  strike_of_the_windlord: { iconName: 'inv_hand_1h_artifactskywall_d_01', emoji: '⚡' },
  zenith:                 { iconName: 'inv_ability_monk_weaponsoforder',   emoji: '✨' },
  momentum_boost:         { iconName: 'inv_belt_leather_raidmonk_n_01',    emoji: '⚡' },
  momentum_boost_damage:  { iconName: 'inv_belt_leather_raidmonk_n_01',    emoji: '⚡' },
  momentum_boost_speed:   { iconName: 'inv_belt_leather_raidmonk_n_01',    emoji: '⚡' },
  spinning_crane_kick:    { iconName: 'ability_monk_cranekick_new',        emoji: '🌀' },
  touch_of_death:         { iconName: 'ability_monk_touchofdeath',         emoji: '💀' },
  slicing_winds:          { iconName: 'ability_monk_flyingdragonkick',     emoji: '💨' },
  touch_of_karma:         { iconName: 'ability_monk_touchofkarma',         emoji: '🛡️' },
  berserking:             { iconName: 'racial_troll_berserk',              emoji: '🔴' },
  potion:                 { iconName: 'inv_12_profession_alchemy_voidpotion_red', emoji: '🧪' },
  algethar_puzzle_box:    { iconName: 'inv_misc_enggizmos_18',             emoji: '💎' },
  rushing_wind_kick:      { iconName: 'inv12_ability_monk_rushingwindkick',emoji: '🌪️' },
};

export const WW_ACTION_BAR: ActionBarSlotDef[] = [
  { spellId: 'tiger_palm',             defaultKey: '1', cdTotal: 0 },
  { spellId: 'blackout_kick',          defaultKey: '2', cdTotal: 0,   procGlow: { buffId: 'blackout_reinforcement' } },
  { spellId: 'rising_sun_kick',        defaultKey: '3', cdTotal: 10,  procOverride: { buffId: 'rushing_wind_kick', spellId: 'rushing_wind_kick' } },
  { spellId: 'fists_of_fury',          defaultKey: '4', cdTotal: 20 },
  { spellId: 'whirling_dragon_punch',  defaultKey: '5', cdTotal: 13,  talentRequired: 'whirling_dragon_punch' },
  { spellId: 'strike_of_the_windlord', defaultKey: '6', cdTotal: 40,  talentRequired: 'strike_of_the_windlord' },
  { spellId: 'zenith',                 defaultKey: '7', cdTotal: 90,  talentRequired: 'zenith', isOffGcd: true },
  { spellId: 'spinning_crane_kick',    defaultKey: '8', cdTotal: 0,   procGlow: { buffId: 'dance_of_chi_ji' } },
  { spellId: 'slicing_winds',          defaultKey: '9', cdTotal: 30,  talentRequired: 'slicing_winds' },
  { spellId: 'touch_of_death',         defaultKey: ']', cdTotal: 180 },
  { spellId: 'touch_of_karma',         defaultKey: '=', cdTotal: 90 },
  { spellId: 'berserking',             defaultKey: '0', cdTotal: 180, isOffGcd: true },
  { spellId: 'algethar_puzzle_box',    defaultKey: '-', cdTotal: 120 },
  { spellId: 'potion',                 defaultKey: '[', cdTotal: 300, isOffGcd: true },
];

/**
 * Compute available charges for a charge-based cooldown.
 * Returns null for non-charge-based spells.
 */
export function getCharges(
  cd: CooldownState | undefined,
  now: number,
): { current: number; max: number; nextChargeIn: number } | null {
  if (!cd?.maxCharges || !cd?.readyTimes) return null;
  const missing = cd.readyTimes.filter(t => t > now).length;
  return {
    current: cd.maxCharges - missing,
    max: cd.maxCharges,
    nextChargeIn: missing > 0 ? Math.max(0, cd.readyTimes[0] - now) : 0,
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActionBarProps {
  /** Current sim state — used to read cooldown remaining times */
  gameState: GameStateSnapshot;
  /** Engine-derived input state per spell. Keeps gameplay logic out of the UI layer. */
  spellInputStatus?: ReadonlyMap<string, SpellInputStatus>;
  /** Which ability spellId is currently recommended (null = none) */
  recommendedAbility: string | null;
  /** Whether to show recommendations (Tutorial/Practice only) */
  showRecommendations: boolean;
  /** Optional subset and order of slots assigned to this bar. */
  slots?: readonly ActionBarSlotDef[];
  /** Optional button-centric assignments for multi-spell action-bar buttons. */
  buttons?: readonly ActionBarButtonAssignment[];
  /** Total visible button slots reserved by the configured bar. */
  totalButtons?: number;
  /** Called when the player presses a key or clicks a slot */
  onAbilityPress: (spellId: string) => void;
  /** When false, keyboard and M4/M5 input are expected to be routed by the parent encounter. */
  enableGlobalKeybinds?: boolean;
  /** Whether the action bar should render at all. */
  enabled?: boolean;
  /** Preferred number of rows for the configured layout. */
  rows?: number;
  /** Preferred slot count before wrapping to the next row. */
  slotsPerRow?: number;
  /** Accessible label for this specific bar. */
  ariaLabel?: string;
  /** Slot size in px. Default: SIZES.actionSlot */
  size?: number;
}

/** Returns the currently visible slots after talent gating. */
export function getVisibleActionBarSlots(
  gameState: Pick<GameStateSnapshot, 'talents'>,
  sourceSlots: readonly ActionBarSlotDef[] = WW_ACTION_BAR,
): ActionBarSlotDef[] {
  const getSpellDef = (spellId: string): SpellDef | undefined => (
    MONK_WW_SPELLS.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId)
  );
  const getTalentRequirement = (slot: ActionBarSlotDef): string | undefined => {
    const spell = getSpellDef(slot.spellId);
    return slot.talentRequired ?? spell?.talentRequired;
  };

  return sourceSlots.filter((slot) => {
    const talentRequirement = getTalentRequirement(slot);
    return !talentRequirement || gameState.talents?.has(talentRequirement) === true;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionBar({
  gameState,
  spellInputStatus,
  recommendedAbility,
  showRecommendations,
  slots,
  buttons,
  totalButtons,
  onAbilityPress,
  enableGlobalKeybinds = true,
  enabled = true,
  rows = 1,
  slotsPerRow,
  ariaLabel = 'Action Bar',
  size = SIZES.actionSlot,
}: ActionBarProps): React.ReactElement {
  const getSpellDef = (spellId: string): SpellDef | undefined => (
    MONK_WW_SPELLS.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId)
  );

  const slotBySpellId = new Map(WW_ACTION_BAR.map((slot) => [slot.spellId, slot]));
  const [pressedSpellId, setPressedSpellId] = useState<string | null>(null);
  const pressedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current usability map, readable from keyboard handler closure
  const usabilityRef = useRef<Map<string, boolean>>(new Map());
  // Always-current key→ordered spells map (chord strings), updated each render
  const keyMapRef = useRef<Record<string, string[]>>({});

  // Helper to check if a buff is currently active
  const isBuffActive = (buffId: string): boolean =>
    (gameState.buffs.get(buffId)?.expiresAt ?? 0) > gameState.currentTime;

  const sourceSlots = slots ?? WW_ACTION_BAR;
  const visibleSlots = enabled ? getVisibleActionBarSlots(gameState, sourceSlots) : [];

  // Compute GCD state
  const gcdRemaining = Math.max(0, gameState.gcdReady - gameState.currentTime);
  const hastePercent = gameState.stats?.hastePercent ?? 0;
  const gcdTotal = Math.max(0.75, 1.5 / (1 + hastePercent / 100));

  // Rebuild keyMap each render, using chord strings and ordered bindings
  const renderedButtons = buttons && buttons.length > 0
    ? Array.from({ length: totalButtons ?? buttons.length }, (_, index) => buttons[index] ?? { spellIds: [], keybind: '' })
      .map((button, index) => {
        const primarySpellId = button.spellIds[0];
        const slot = primarySpellId ? slotBySpellId.get(primarySpellId) : undefined;
        const visibleSlot = slot ? visibleSlots.find((candidate) => candidate.spellId === slot.spellId) : undefined;
        if (!visibleSlot || button.spellIds.length === 0) {
          return {
            key: `empty-${index}`,
            slot: null,
            spellIds: [],
            keybind: button.keybind,
          };
        }

        return {
          key: visibleSlot.spellId,
          slot: visibleSlot,
          spellIds: button.spellIds,
          keybind: button.keybind || visibleSlot.defaultKey,
        };
      })
    : visibleSlots.map((slot) => ({
      key: slot.spellId,
      slot,
      spellIds: [slot.spellId],
      keybind: slot.defaultKey,
    }));

  const newKeyMap: Record<string, string[]> = {};
  for (const button of renderedButtons) {
    if (!button.keybind || button.slot === null || button.spellIds.length === 0) {
      continue;
    }

    const effectiveSpellIds = button.spellIds.flatMap((spellId) => {
      const slot = slotBySpellId.get(spellId);
      if (!slot) {
        return [];
      }

      const overrideActive = slot.procOverride ? isBuffActive(slot.procOverride.buffId) : false;
      return [overrideActive ? (slot.procOverride?.spellId ?? slot.spellId) : slot.spellId];
    });

    if (effectiveSpellIds.length > 0) {
      newKeyMap[button.keybind] = [...(newKeyMap[button.keybind] ?? []), ...effectiveSpellIds];
    }
  }
  keyMapRef.current = newKeyMap;

  const flashPressedSpell = useCallback((spellId: string): void => {
    setPressedSpellId(spellId);
    if (pressedTimerRef.current) clearTimeout(pressedTimerRef.current);
    pressedTimerRef.current = setTimeout(() => {
      setPressedSpellId(null);
    }, 120);
  }, []);

  const dispatchSpellIds = useCallback((spellIds: readonly string[]): void => {
    if (spellIds.length === 0) {
      return;
    }

    if (spellIds.length === 1) {
      const [spellId] = spellIds;
      if (usabilityRef.current.get(spellId) === false) {
        return;
      }
      onAbilityPress(spellId);
      flashPressedSpell(spellId);
      return;
    }

    spellIds.forEach((spellId) => {
      onAbilityPress(spellId);
    });

    const highlightedSpellId = spellIds.find((candidate) => usabilityRef.current.get(candidate) !== false) ?? spellIds[0];
    flashPressedSpell(highlightedSpellId);
  }, [flashPressedSpell, onAbilityPress]);

  // Keyboard and mouse button handler
  useEffect(() => {
    if (!enableGlobalKeybinds) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey) return; // allow browser shortcuts (Cmd+R, etc.)
      const chord = normalizeKey(e);
      const spellIds = keyMapRef.current[chord] ?? [];
      if (spellIds.length === 0) return;
      e.preventDefault();
      dispatchSpellIds(spellIds);
    };

    const handleMouseDown = (e: MouseEvent): void => {
      const chord = normalizeMouseButton(e);
      if (chord === null) return;
      const spellIds = keyMapRef.current[chord] ?? [];
      if (spellIds.length === 0) return;
      e.preventDefault();
      dispatchSpellIds(spellIds);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [dispatchSpellIds, enableGlobalKeybinds]);

  // Cleanup pressed timer on unmount
  useEffect(() => {
    return (): void => {
      if (pressedTimerRef.current) {
        clearTimeout(pressedTimerRef.current);
      }
    };
  }, []);

  if (!enabled) {
    return <></>;
  }

  if (renderedButtons.length === 0) {
    return <></>;
  }

  const renderedButtonCount = totalButtons ?? renderedButtons.length;
  const preferredColumns = slotsPerRow ?? renderedButtonCount;
  const columnCount = Math.max(1, Math.min(renderedButtonCount || 1, preferredColumns || 1));
  const containerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columnCount}, ${size}px)`,
    gap: '4px',
    justifyContent: 'start',
    alignContent: 'start',
    maxWidth: `${columnCount * size + Math.max(0, columnCount - 1) * 4}px`,
  };

  return (
    <div role="toolbar" aria-label={ariaLabel} aria-rowcount={Math.max(1, rows)} style={containerStyle}>
      {renderedButtons.map(({ key, slot, spellIds, keybind }) => {
        if (slot === null) {
          return (
            <div
              key={key}
              data-testid="action-bar-empty-slot"
              aria-hidden="true"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: `${SIZES.borderRadius}px`,
                border: `1px solid ${T.border}`,
                background: 'linear-gradient(180deg, rgba(10, 16, 28, 0.44), rgba(5, 10, 18, 0.32))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
            />
          );
        }

        // Determine effective spell ID (base or proc override)
        const overrideActive = slot.procOverride ? isBuffActive(slot.procOverride.buffId) : false;
        const glowActive = slot.procGlow ? isBuffActive(slot.procGlow.buffId) : false;
        const procced = glowActive || overrideActive;
        const effectiveSpellId = overrideActive ? (slot.procOverride?.spellId ?? slot.spellId) : slot.spellId;
        const effectiveSpellIds = spellIds.flatMap((spellId) => {
          const buttonSlot = slotBySpellId.get(spellId);
          if (!buttonSlot) {
            return [];
          }

          const buttonOverrideActive = buttonSlot.procOverride ? isBuffActive(buttonSlot.procOverride.buffId) : false;
          return [buttonOverrideActive ? (buttonSlot.procOverride?.spellId ?? buttonSlot.spellId) : buttonSlot.spellId];
        });

        // Look up spell data for resource checks
        const spell = getSpellDef(effectiveSpellId);
        const baseSpell = getSpellDef(slot.spellId);

        // Icon/name lookup (SpellDef has displayName; icon data from SPELL_ICONS)
        const icons = SPELL_ICONS[effectiveSpellId] ?? SPELL_ICONS[slot.spellId] ?? { iconName: 'inv_misc_questionmark', emoji: '?' };
        const displayName = spell?.displayName ?? baseSpell?.displayName ?? slot.spellId;

        // Cooldown — use override spell's CD when override is active
        const cd = gameState.cooldowns.get(effectiveSpellId);
        const charges = getCharges(cd, gameState.currentTime);

        let cdRemaining: number;
        if (charges) {
          cdRemaining = charges.current <= 0 ? charges.nextChargeIn : 0;
        } else {
          cdRemaining = cd?.readyAt != null ? Math.max(0, cd.readyAt - gameState.currentTime) : 0;
        }

        const inputStatus = spell ? spellInputStatus?.get(effectiveSpellId) : undefined;
        const usable = inputStatus?.visuallyUsable ?? true;
        const canPress = inputStatus?.canPress ?? true;

        const slotGcdRemaining = slot.isOffGcd ? 0 : (baseSpell?.isOnGcd ? gcdRemaining : 0);

        // Keep usability ref current for keyboard handler
        usabilityRef.current.set(effectiveSpellId, canPress && cdRemaining === 0);
        if (effectiveSpellId !== slot.spellId) {
          usabilityRef.current.set(slot.spellId, canPress && cdRemaining === 0);
        }

        return (
          <ActionBarSlot
            key={key}
            iconName={icons.iconName}
            emoji={icons.emoji}
            abilityName={displayName}
            cdRemaining={cdRemaining}
            cdTotal={slot.cdTotal}
            keybind={keybind}
            recommended={slot.spellId === recommendedAbility && showRecommendations}
            procced={procced}
            procSpell={overrideActive ? slot.procOverride?.spellId : undefined}
            charges={charges ? { current: charges.current, max: charges.max } : undefined}
            gcdRemaining={slotGcdRemaining}
            gcdTotal={gcdTotal}
            size={size}
            onClick={() => dispatchSpellIds(effectiveSpellIds)}
            pressed={pressedSpellId === slot.spellId || pressedSpellId === effectiveSpellId}
            usable={usable}
          />
        );
      })}
    </div>
  );
}

export default ActionBar;
