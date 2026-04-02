import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ActionBarSlot } from './ActionBarSlot';
import { SIZES, T } from '@ui/theme/elvui';
import type { GameStateSnapshot, CooldownState } from '@core/engine/gameState';
import { getSpellbookForProfileSpec } from '@core/data/specSpellbook';
import { SHARED_PLAYER_SPELLS } from '@core/shared/player_effects';
import type { SpellInputStatus } from '@core/engine/spell_input';
import type { SpellDef } from '@core/data/spells';
import { normalizeKey, normalizeMouseButton, normalizeMouseWheel } from '@ui/utils/keyUtils';

// ---------------------------------------------------------------------------
// Slot definition
// ---------------------------------------------------------------------------

export interface ActionBarSlotDef {
  spellId: string;
  defaultKey: string;
  cdTotal: number;
  cooldownQuerySpellId?: string;
  talentRequired?: string;
  talentExcluded?: string;
  replacesSpellId?: string;
  procOverride?: { buffId: string; spellId: string; cooldownQuerySpellId?: string };
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
  stormstrike:            { iconName: 'spell_shaman_improvedstormstrike',  emoji: '⚡' },
  windstrike:             { iconName: 'spell_shaman_windstrike',           emoji: '🌩️' },
  lava_lash:              { iconName: 'ability_shaman_lavalash',             emoji: '🔥' },
  flame_shock:            { iconName: 'spell_fire_flameshock',             emoji: '🔥' },
  voltaic_blaze:          { iconName: 'inv_10_dungeonjewelry_primalist_trinket_1ragingelement_fire', emoji: '⚡' },
  lightning_bolt:         { iconName: 'spell_nature_lightning',            emoji: '⚡' },
  chain_lightning:        { iconName: 'spell_nature_chainlightning',       emoji: '🌩️' },
  crash_lightning:        { iconName: 'spell_shaman_crashlightning',       emoji: '💥' },
  feral_spirit:           { iconName: 'spell_shaman_feralspirit',          emoji: '🐺' },
  sundering:              { iconName: 'ability_rhyolith_lavapool',            emoji: '🌋' },
  ascendance:             { iconName: 'spell_fire_elementaldevastation',           emoji: '🌪️' },
  doom_winds:             { iconName: 'ability_ironmaidens_swirlingvortex', emoji: '🌪️' },
  surging_totem:          { iconName: 'inv_ability_totemicshaman_surgingtotem', emoji: '🗿' },
  feral_lunge:            { iconName: 'spell_beastmaster_wolf',            emoji: '🐾' },
  astral_shift:           { iconName: 'ability_shaman_astralshift',        emoji: '🛡️' },
  wind_rush_totem:        { iconName: 'ability_shaman_windwalktotem',      emoji: '💨' },
  totemic_projection:     { iconName: 'ability_shaman_totemrelocation',    emoji: '🗿' },
  tempest:                { iconName: 'inv_ability_stormcallershaman_tempest',              emoji: '🌩️' },
  primordial_storm:       { iconName: 'ability_shaman_ascendance',       emoji: '🌩️' },
  windfury_weapon:        { iconName: 'spell_nature_cyclone',              emoji: '💨' },
  flametongue_weapon:     { iconName: 'spell_fire_flametounge',            emoji: '🔥' },
  hot_hand:               { iconName: 'spell_fire_playingwithfire',        emoji: '🔥' },
  storm_unleashed:        { iconName: 'inv12_apextalent_shaman_stormunleashed', emoji: '🌩️' },
  blood_fury:             { iconName: 'racial_orc_berserkerstrength',      emoji: '🩸' },
  bloodlust:              { iconName: 'spell_nature_bloodlust',            emoji: '⚡' },
};

export const WW_ACTION_BAR: ActionBarSlotDef[] = [
  { spellId: 'tiger_palm',             defaultKey: '1', cdTotal: 0 },
  { spellId: 'blackout_kick',          defaultKey: '2', cdTotal: 0,   procGlow: { buffId: 'combo_breaker' } },
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

export const ENHANCEMENT_ACTION_BAR: ActionBarSlotDef[] = [
  {
    spellId: 'stormstrike',
    defaultKey: '1',
    cdTotal: 8,
    cooldownQuerySpellId: 'strike',
    procOverride: { buffId: 'ascendance', spellId: 'windstrike', cooldownQuerySpellId: 'strike' },
    procGlow: { buffId: 'stormsurge' },
  },
  { spellId: 'lava_lash',          defaultKey: '2', cdTotal: 18, talentRequired: 'lava_lash', procGlow: { buffId: 'hot_hand' } },
  {
    spellId: 'flame_shock',
    defaultKey: '3',
    cdTotal: 6,
    talentExcluded: 'voltaic_blaze',
  },
  { spellId: 'voltaic_blaze',     defaultKey: '3', cdTotal: 10, talentRequired: 'voltaic_blaze', replacesSpellId: 'flame_shock' },
  {
    spellId: 'lightning_bolt',
    defaultKey: '4',
    cdTotal: 0,
    procGlow: { buffId: 'maelstrom_weapon' },
    procOverride: { buffId: 'tempest', spellId: 'tempest' },
  },
  { spellId: 'crash_lightning',    defaultKey: '5', cdTotal: 15, talentRequired: 'crash_lightning' },
  { spellId: 'chain_lightning',    defaultKey: '6', cdTotal: 0, talentRequired: 'chain_lightning', procGlow: { buffId: 'maelstrom_weapon' } },
  {
    spellId: 'sundering',
    defaultKey: '7',
    cdTotal: 30,
    talentRequired: 'sundering',
    procOverride: { buffId: 'primordial_storm', spellId: 'primordial_storm' },
  },
  { spellId: 'feral_spirit',       defaultKey: '8', cdTotal: 90, talentRequired: 'feral_spirit' },
  { spellId: 'surging_totem',      defaultKey: '9', cdTotal: 60, talentRequired: 'surging_totem' },
  { spellId: 'doom_winds',         defaultKey: '0', cdTotal: 60, talentRequired: 'doom_winds', isOffGcd: true },
  { spellId: 'ascendance',         defaultKey: '-', cdTotal: 180, talentRequired: 'ascendance' },
  { spellId: 'feral_lunge',        defaultKey: '=', cdTotal: 30 },
  { spellId: 'astral_shift',       defaultKey: '[', cdTotal: 90, talentRequired: 'astral_shift' },
  { spellId: 'wind_rush_totem',    defaultKey: ']', cdTotal: 120, talentRequired: 'wind_rush_totem' },
  { spellId: 'totemic_projection', defaultKey: '\\\\', cdTotal: 10, talentRequired: 'totemic_projection' },
  { spellId: 'bloodlust',          defaultKey: ';', cdTotal: 600 },
  { spellId: 'blood_fury',         defaultKey: '\'', cdTotal: 120, isOffGcd: true },
  { spellId: 'potion',             defaultKey: 'shift+1', cdTotal: 300, isOffGcd: true },
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
  /** Spell to spotlight in tutorial mode. */
  focusedSpellId?: string | null;
  /** Dim non-focused spells while a tutorial hint is active. */
  dimNonFocusedSpells?: boolean;
  /** Optional subset and order of slots assigned to this bar. */
  slots?: readonly ActionBarSlotDef[];
  /** Optional button-centric assignments for multi-spell action-bar buttons. */
  buttons?: readonly ActionBarButtonAssignment[];
  /** Total visible button slots reserved by the configured bar. */
  totalButtons?: number;
  /** Called when the player presses a key or clicks a slot */
  onAbilityPress: (spellId: string) => void;
  /** Optional handler that receives the full configured spell sequence for a button press. */
  onAbilitySequencePress?: (spellIds: readonly string[]) => void;
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
  /** Spec spellbook used to resolve spell metadata. */
  spellbook?: ReadonlyMap<string, SpellDef>;
}

/** Returns the currently visible slots after talent gating. */
export function getVisibleActionBarSlots(
  gameState: Pick<GameStateSnapshot, 'talents'>,
  sourceSlots: readonly ActionBarSlotDef[] = WW_ACTION_BAR,
  spellbook: ReadonlyMap<string, SpellDef> = getSpellbookForProfileSpec('monk'),
): ActionBarSlotDef[] {
  const getSpellDef = (spellId: string): SpellDef | undefined => (
    spellbook.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId)
  );
  const getTalentRequirement = (slot: ActionBarSlotDef): string | undefined => {
    const spell = getSpellDef(slot.spellId);
    return slot.talentRequired ?? spell?.talentRequired;
  };

  return sourceSlots.filter((slot) => {
    const talentRequirement = getTalentRequirement(slot);
    const excludedTalentActive = slot.talentExcluded !== undefined && gameState.talents?.has(slot.talentExcluded) === true;
    return (!talentRequirement || gameState.talents?.has(talentRequirement) === true) && !excludedTalentActive;
  });
}

export function augmentActionBarSlots(
  sourceSlots: readonly ActionBarSlotDef[],
  buttons?: readonly ActionBarButtonAssignment[],
): ActionBarSlotDef[] {
  const slotMap = new Map(sourceSlots.map((slot) => [slot.spellId, slot]));
  for (const button of buttons ?? []) {
    for (const spellId of button.spellIds) {
      if (slotMap.has(spellId)) {
        continue;
      }
      const sharedSpell = SHARED_PLAYER_SPELLS.get(spellId);
      if (!sharedSpell) {
        continue;
      }
      slotMap.set(spellId, {
        spellId,
        defaultKey: button.keybind,
        cdTotal: sharedSpell.cooldown,
        isOffGcd: sharedSpell.isOnGcd === false,
      });
    }
  }
  return [...slotMap.values()];
}

export function resolveActionBarButtonSpellIds(
  buttonSpellIds: readonly string[],
  visibleSlots: readonly ActionBarSlotDef[],
  slotBySpellId: ReadonlyMap<string, ActionBarSlotDef>,
): string[] {
  const visibleSpellIds = new Set(visibleSlots.map((slot) => slot.spellId));
  const replacementBySpellId = new Map(
    visibleSlots.flatMap((slot) => (slot.replacesSpellId ? [[slot.replacesSpellId, slot.spellId] as const] : [])),
  );

  const resolved: string[] = [];
  for (const spellId of buttonSpellIds) {
    if (visibleSpellIds.has(spellId)) {
      if (!resolved.includes(spellId)) {
        resolved.push(spellId);
      }
      continue;
    }

    const replacementSpellId = replacementBySpellId.get(spellId);
    if (replacementSpellId) {
      if (!resolved.includes(replacementSpellId)) {
        resolved.push(replacementSpellId);
      }
      continue;
    }

    if (!slotBySpellId.has(spellId) && !resolved.includes(spellId)) {
      resolved.push(spellId);
    }
  }

  return resolved;
}

function resolveReplacementButtonSpellId(
  slot: ActionBarSlotDef,
  spellInputStatus: ReadonlyMap<string, SpellInputStatus> | undefined,
): string {
  if (!slot.replacesSpellId) {
    return slot.spellId;
  }

  const replacementCanPress = spellInputStatus?.get(slot.spellId)?.canPress ?? true;
  const replacedCanPress = spellInputStatus?.get(slot.replacesSpellId)?.canPress ?? false;

  if (!replacementCanPress && replacedCanPress) {
    return slot.replacesSpellId;
  }

  return slot.spellId;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActionBar({
  gameState,
  spellInputStatus,
  recommendedAbility,
  showRecommendations,
  focusedSpellId = null,
  dimNonFocusedSpells = false,
  slots,
  buttons,
  totalButtons,
  onAbilityPress,
  onAbilitySequencePress,
  enableGlobalKeybinds = true,
  enabled = true,
  rows = 1,
  slotsPerRow,
  ariaLabel = 'Action Bar',
  size = SIZES.actionSlot,
  spellbook,
}: ActionBarProps): React.ReactElement {
  const effectiveSpellbook = spellbook ?? getSpellbookForProfileSpec('monk');
  const sourceSlots = slots ?? WW_ACTION_BAR;
  const getSpellDef = (spellId: string): SpellDef | undefined => (
    effectiveSpellbook.get(spellId) ?? SHARED_PLAYER_SPELLS.get(spellId)
  );

  const augmentedSlots = useMemo(() => augmentActionBarSlots(sourceSlots, buttons), [buttons, sourceSlots]);
  const slotBySpellId = useMemo(() => new Map(augmentedSlots.map((slot) => [slot.spellId, slot])), [augmentedSlots]);
  const [pressedSpellId, setPressedSpellId] = useState<string | null>(null);
  const pressedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current usability map, readable from keyboard handler closure
  const usabilityRef = useRef<Map<string, boolean>>(new Map());
  // Always-current key→ordered spells map (chord strings), updated each render
  const keyMapRef = useRef<Record<string, string[]>>({});

  // Helper to check if a buff is currently active
  const isBuffActive = (buffId: string): boolean =>
    (gameState.buffs.get(buffId)?.expiresAt ?? 0) > gameState.currentTime;

  const visibleSlots = enabled ? getVisibleActionBarSlots(gameState, augmentedSlots, effectiveSpellbook) : [];

  // Compute GCD state
  const gcdRemaining = Math.max(0, gameState.gcdReady - gameState.currentTime);
  const hastePercent = gameState.stats?.hastePercent ?? 0;
  const gcdTotal = Math.max(0.75, 1.5 / (1 + hastePercent / 100));

  // Rebuild keyMap each render, using chord strings and ordered bindings
  const renderedButtons = buttons && buttons.length > 0
    ? Array.from({ length: totalButtons ?? buttons.length }, (_, index) => buttons[index] ?? { spellIds: [], keybind: '' })
      .map((button, index) => {
        const resolvedSpellIds = resolveActionBarButtonSpellIds(button.spellIds, visibleSlots, slotBySpellId);
        const primarySpellId = resolvedSpellIds[0];
        const slot = primarySpellId ? slotBySpellId.get(primarySpellId) : undefined;
        const visibleSlot = slot ? visibleSlots.find((candidate) => candidate.spellId === slot.spellId) ?? slot : undefined;
        if (!visibleSlot || resolvedSpellIds.length === 0) {
          return {
            key: `empty-${index}`,
            slot: null,
            spellIds: [],
            keybind: button.keybind,
          };
        }

        return {
          key: `button-${index}-${visibleSlot.spellId}`,
          slot: visibleSlot,
          spellIds: resolvedSpellIds,
          keybind: button.keybind || visibleSlot.defaultKey,
        };
      })
    : visibleSlots.map((slot, index) => ({
      key: `slot-${index}-${slot.spellId}`,
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
        // Spell not in slot registry (e.g. consumable/racial) — pass through as-is
        return [spellId];
      }

      const overrideActive = slot.procOverride ? isBuffActive(slot.procOverride.buffId) : false;
      if (overrideActive) {
        return [slot.procOverride?.spellId ?? slot.spellId];
      }
      return [resolveReplacementButtonSpellId(slot, spellInputStatus)];
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

    if (spellIds.length > 1 && onAbilitySequencePress) {
      onAbilitySequencePress(spellIds);
      const highlightedSpellId = spellIds.find((candidate) => usabilityRef.current.get(candidate) !== false) ?? spellIds[0];
      flashPressedSpell(highlightedSpellId);
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
  }, [flashPressedSpell, onAbilityPress, onAbilitySequencePress]);

  // Keyboard and mouse button handler
  useEffect(() => {
    if (!enableGlobalKeybinds) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
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

    const handleWheel = (e: WheelEvent): void => {
      const chord = normalizeMouseWheel(e);
      if (chord === null) return;
      const spellIds = keyMapRef.current[chord] ?? [];
      if (spellIds.length === 0) return;
      e.preventDefault();
      dispatchSpellIds(spellIds);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('wheel', handleWheel);
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
                position: 'relative',
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: `${SIZES.borderRadius}px`,
                border: `1px solid rgba(12, 18, 28, 0.96)`,
                background: 'linear-gradient(180deg, rgba(16, 24, 36, 0.92), rgba(7, 11, 18, 0.96))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.24)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 4,
                  borderRadius: Math.max(4, SIZES.borderRadius - 4),
                  border: `1px solid ${T.border}`,
                  background: 'linear-gradient(180deg, rgba(4, 8, 14, 0.78), rgba(8, 12, 20, 0.42))',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                }}
              />
            </div>
          );
        }

        // Determine effective spell ID (base or proc override)
        const overrideActive = slot.procOverride ? isBuffActive(slot.procOverride.buffId) : false;
        const glowActive = slot.procGlow ? isBuffActive(slot.procGlow.buffId) : false;
        const procced = glowActive || overrideActive;
        const displaySpellId = overrideActive
          ? (slot.procOverride?.spellId ?? slot.spellId)
          : slot.spellId;
        const effectiveSpellId = overrideActive
          ? (slot.procOverride?.spellId ?? slot.spellId)
          : resolveReplacementButtonSpellId(slot, spellInputStatus);
        const effectiveCooldownSpellId = overrideActive
          ? (slot.procOverride?.cooldownQuerySpellId ?? effectiveSpellId)
          : (
            effectiveSpellId === slot.replacesSpellId
              ? effectiveSpellId
              : (slot.cooldownQuerySpellId ?? effectiveSpellId)
          );
        const effectiveSpellIds = spellIds.flatMap((spellId) => {
          const buttonSlot = slotBySpellId.get(spellId);
          if (!buttonSlot) {
            // Pass through unrecognized spells (e.g. consumables/racials)
            return [spellId];
          }

          const buttonOverrideActive = buttonSlot.procOverride ? isBuffActive(buttonSlot.procOverride.buffId) : false;
          return [buttonOverrideActive ? (buttonSlot.procOverride?.spellId ?? buttonSlot.spellId) : buttonSlot.spellId];
        });

        // Look up spell data for resource checks
        const spell = getSpellDef(effectiveSpellId);
        const displaySpell = getSpellDef(displaySpellId);
        const baseSpell = getSpellDef(slot.spellId);

        // Icon/name lookup (SpellDef has displayName; icon data from SPELL_ICONS)
        const icons = SPELL_ICONS[displaySpellId] ?? SPELL_ICONS[slot.spellId] ?? { iconName: 'inv_misc_questionmark', emoji: '?' };
        const displayName = displaySpell?.displayName ?? baseSpell?.displayName ?? slot.spellId;
        const tooltipId = displaySpell?.id ?? baseSpell?.id;

        // Cooldown — use override spell's CD when override is active
        const cd = gameState.cooldowns.get(effectiveCooldownSpellId);
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
        const buttonHasOffGcdOption = effectiveSpellIds.some((buttonSpellId) => {
          const buttonSpell = getSpellDef(buttonSpellId);
          const buttonSlot = slotBySpellId.get(buttonSpellId);
          return buttonSlot?.isOffGcd === true || buttonSpell?.isOnGcd === false;
        });
        const buttonHasOnGcdOption = effectiveSpellIds.some((buttonSpellId) => {
          const buttonSpell = getSpellDef(buttonSpellId);
          const buttonSlot = slotBySpellId.get(buttonSpellId);
          return buttonSlot?.isOffGcd !== true && buttonSpell?.isOnGcd !== false;
        });

        const slotGcdRemaining = buttonHasOnGcdOption
          ? gcdRemaining
          : ((slot.isOffGcd || buttonHasOffGcdOption) ? 0 : (baseSpell?.isOnGcd ? gcdRemaining : 0));

        // Keep usability ref current for keyboard handler
        usabilityRef.current.set(effectiveSpellId, canPress && cdRemaining === 0);
        if (effectiveSpellId !== slot.spellId) {
          usabilityRef.current.set(slot.spellId, canPress && cdRemaining === 0);
        }

        const isRecommended = showRecommendations
          && recommendedAbility !== null
          && (recommendedAbility === displaySpellId || effectiveSpellIds.includes(recommendedAbility));
        const isFocused = focusedSpellId !== null
          && (focusedSpellId === displaySpellId || effectiveSpellIds.includes(focusedSpellId));
        const dimmed = dimNonFocusedSpells && focusedSpellId !== null && !isFocused;

        return (
          <ActionBarSlot
            key={key}
            iconName={icons.iconName}
            emoji={icons.emoji}
            abilityName={displayName}
            cdRemaining={cdRemaining}
            cdTotal={spell?.cooldown ?? baseSpell?.cooldown ?? slot.cdTotal}
            keybind={keybind}
            recommended={isRecommended}
            learningHighlighted={isFocused}
            dimmed={dimmed}
            procced={procced}
            procSpell={overrideActive ? slot.procOverride?.spellId : undefined}
            charges={charges ? { current: charges.current, max: charges.max } : undefined}
            gcdRemaining={slotGcdRemaining}
            gcdTotal={gcdTotal}
            size={size}
            onClick={() => dispatchSpellIds(effectiveSpellIds)}
            pressed={pressedSpellId === slot.spellId || pressedSpellId === effectiveSpellId}
            usable={usable}
            tooltipText={tooltipId !== undefined ? `${displayName}\nSpell ID: ${tooltipId}` : displayName}
          />
        );
      })}
    </div>
  );
}

export default ActionBar;
