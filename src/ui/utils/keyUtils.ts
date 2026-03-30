/**
 * Shared keyboard utilities for chord-key normalization.
 * Used by ActionBar (key dispatch) and LoadoutPanel (key capture).
 */

/** Keys that should never be captured as keybinds */
export const SYSTEM_KEYS = new Set([
  'escape', 'tab',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6',
  'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
]);

/**
 * Normalize a keyboard event into a chord string.
 * Examples: "1", "ctrl+1", "shift+f", "alt+q", "ctrl+shift+a"
 */
export function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

/**
 * Normalize a mouse button event into a chord string.
 * Only M4 (button 3) and M5 (button 4) are bindable.
 * Returns null for all other buttons (M1/M2/M3).
 *
 * Modifier order matches normalizeKey: ctrl → shift → alt → button.
 * Example: ctrl+m4, shift+m5, ctrl+shift+alt+m4
 *
 * Note: alt+m4/m5 chords may conflict with OS-level Alt key events on
 * Windows/Linux. e.preventDefault() suppresses browser navigation but
 * cannot prevent OS-level window-menu or focus events.
 */
export function normalizeMouseButton(e: MouseEvent): string | null {
  const buttonName = e.button === 3 ? 'm4' : e.button === 4 ? 'm5' : null;
  if (buttonName === null) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(buttonName);
  return parts.join('+');
}
