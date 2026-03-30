/**
 * Shared keyboard utilities for chord-key normalization.
 * Used by ActionBar (key dispatch) and LoadoutPanel (key capture).
 */

/** Keys that should never be captured as keybinds */
export const SYSTEM_KEYS = new Set([
  'escape',
]);

/** Pure modifier keys should not become standalone binds. */
export const MODIFIER_ONLY_KEYS = new Set([
  'shift',
  'control',
  'alt',
  'meta',
  'os',
  'altgraph',
  'fn',
]);

const NAMED_KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  Spacebar: 'space',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  PageUp: 'pgup',
  PageDown: 'pgdn',
  Insert: 'ins',
  Delete: 'del',
};

const CODE_KEY_ALIASES: Record<string, string> = {
  Space: 'space',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
  IntlBackslash: 'intl-\\',
  IntlRo: 'intl-ro',
  IntlYen: 'intl-yen',
  Numpad0: 'num0',
  Numpad1: 'num1',
  Numpad2: 'num2',
  Numpad3: 'num3',
  Numpad4: 'num4',
  Numpad5: 'num5',
  Numpad6: 'num6',
  Numpad7: 'num7',
  Numpad8: 'num8',
  Numpad9: 'num9',
  NumpadAdd: 'num+',
  NumpadSubtract: 'num-',
  NumpadMultiply: 'num*',
  NumpadDivide: 'num/',
  NumpadDecimal: 'num.',
  NumpadEnter: 'numenter',
};

function buildModifierParts(event: Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>): string[] {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  if (event.metaKey) parts.push('cmd');
  return parts;
}

function resolveKeyboardBaseKey(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const codeAlias = CODE_KEY_ALIASES[event.code];
  if (codeAlias !== undefined) {
    return codeAlias;
  }

  const namedAlias = NAMED_KEY_ALIASES[event.key];
  if (namedAlias !== undefined) {
    return namedAlias;
  }

  if (event.key.length === 1 && event.key !== ' ') {
    return event.key.toLowerCase();
  }

  const loweredKey = event.key.toLowerCase();
  if (loweredKey === 'dead' || loweredKey === 'unidentified' || loweredKey === 'process') {
    return CODE_KEY_ALIASES[event.code] ?? loweredKey;
  }

  return loweredKey;
}

/**
 * Normalize a keyboard event into a chord string.
 * Examples: "1", "ctrl+1", "shift+f", "alt+q", "ctrl+shift+a"
 */
export function normalizeKey(e: KeyboardEvent): string {
  const parts = buildModifierParts(e);
  parts.push(resolveKeyboardBaseKey(e));
  return parts.join('+');
}

/**
 * Normalize a mouse button event into a chord string.
 * Modifier order matches normalizeKey: ctrl → shift → alt → cmd → button.
 * Example: ctrl+m4, shift+m5, ctrl+shift+alt+cmd+m12
 *
 * Note: alt+m4/m5 chords may conflict with OS-level Alt key events on
 * Windows/Linux. e.preventDefault() suppresses browser navigation but
 * cannot prevent OS-level window-menu or focus events.
 */
export function normalizeMouseButton(e: MouseEvent): string | null {
  if (!Number.isInteger(e.button) || e.button < 0) {
    return null;
  }

  const parts = buildModifierParts(e);
  parts.push(`m${e.button + 1}`);
  return parts.join('+');
}

/**
 * Normalize a mouse wheel event into a chord string.
 * Examples: mwheelup, shift+mwheeldown, ctrl+alt+cmd+mwheelup
 */
export function normalizeMouseWheel(e: WheelEvent): string | null {
  if (e.deltaY === 0) {
    return null;
  }

  const parts = buildModifierParts(e);
  parts.push(e.deltaY < 0 ? 'mwheelup' : 'mwheeldown');
  return parts.join('+');
}
