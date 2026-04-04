import { WW_ACTION_BAR } from '@ui/specs/monk/actionBar';
import { ENHANCEMENT_ACTION_BAR } from '@ui/specs/shaman/actionBar';
import type { ActionBarButtonSettings, ActionBarId, ActionBarSettings } from '@ui/state/trainerSettings';
import type { Keybinds } from './useKeybinds';

const DEFAULT_ACTION_BAR_SLOTS = [...WW_ACTION_BAR, ...ENHANCEMENT_ACTION_BAR];
const DEFAULT_KEY_BY_SPELL_ID = new Map(DEFAULT_ACTION_BAR_SLOTS.map((slot) => [slot.spellId, slot.defaultKey]));

function getConfiguredSpellIds(actionBars: ActionBarSettings): Set<string> {
  return new Set(
    Object.values(actionBars.bars)
      .flatMap((bar) => bar.buttons)
      .flatMap((button) => button.spellIds)
      .filter((spellId) => spellId.length > 0),
  );
}

function getDefaultKeybind(button: ActionBarButtonSettings): string {
  const defaultSpellId = button.spellIds.find((spellId) => DEFAULT_KEY_BY_SPELL_ID.has(spellId));
  return defaultSpellId ? DEFAULT_KEY_BY_SPELL_ID.get(defaultSpellId) ?? '' : button.keybind;
}

function getChordForButton(button: ActionBarButtonSettings, keybinds: Keybinds): string {
  for (const spellId of button.spellIds) {
    const chord = keybinds[spellId]?.chord;
    if (typeof chord === 'string' && chord.length > 0) {
      return chord;
    }
  }

  return button.keybind || getDefaultKeybind(button);
}

export function syncActionBarsWithKeybinds(actionBars: ActionBarSettings, keybinds: Keybinds): ActionBarSettings {
  const bars = Object.fromEntries(
    (Object.keys(actionBars.bars) as ActionBarId[]).map((barId) => [
      barId,
      {
        ...actionBars.bars[barId],
        buttons: actionBars.bars[barId].buttons.map((button) => ({
          ...button,
          keybind: getChordForButton(button, keybinds),
        })),
      },
    ]),
  ) as Record<ActionBarId, ActionBarSettings['bars'][ActionBarId]>;

  return { bars };
}

export function syncKeybindsFromActionBars(actionBars: ActionBarSettings, previousKeybinds: Keybinds): Keybinds {
  const configuredSpellIds = getConfiguredSpellIds(actionBars);
  const next: Keybinds = Object.fromEntries(
    Object.entries(previousKeybinds).filter(([spellId]) => !configuredSpellIds.has(spellId)),
  );

  for (const barId of Object.keys(actionBars.bars) as ActionBarId[]) {
    const bar = actionBars.bars[barId];
    for (const button of bar.buttons.slice(0, bar.buttonCount)) {
      if (!button.keybind) {
        continue;
      }

      button.spellIds.forEach((spellId, order) => {
        if (spellId.length === 0) {
          return;
        }

        next[spellId] = {
          chord: button.keybind,
          order,
        };
      });
    }
  }

  return next;
}
