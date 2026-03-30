import { WW_ACTION_BAR } from '@ui/components/ActionBar';
import type { ActionBarButtonSettings, ActionBarId, ActionBarSettings } from '@ui/state/trainerSettings';
import type { Keybinds } from './useKeybinds';

const ACTION_BAR_SPELL_IDS = new Set(WW_ACTION_BAR.map((slot) => slot.spellId));
const DEFAULT_KEY_BY_SPELL_ID = new Map(WW_ACTION_BAR.map((slot) => [slot.spellId, slot.defaultKey]));

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
  const next: Keybinds = Object.fromEntries(
    Object.entries(previousKeybinds).filter(([spellId]) => !ACTION_BAR_SPELL_IDS.has(spellId)),
  );

  for (const barId of Object.keys(actionBars.bars) as ActionBarId[]) {
    const bar = actionBars.bars[barId];
    for (const button of bar.buttons.slice(0, bar.buttonCount)) {
      if (!button.keybind) {
        continue;
      }

      button.spellIds.forEach((spellId, order) => {
        if (!ACTION_BAR_SPELL_IDS.has(spellId)) {
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
