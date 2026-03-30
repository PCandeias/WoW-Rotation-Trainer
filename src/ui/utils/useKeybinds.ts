import { useState, useCallback } from 'react';

const STORAGE_KEY = 'wow_trainer_keybinds';

export interface SpellKeybind {
  chord: string;
  order: number;
}

export type Keybinds = Partial<Record<string, SpellKeybind>>;

export interface KeybindSlotLike {
  spellId: string;
  defaultKey: string;
}

export interface ResolvedKeybind extends SpellKeybind {
  spellId: string;
  defaultKey: string;
  slotIndex: number;
}

function isSpellKeybind(value: unknown): value is SpellKeybind {
  return typeof value === 'object'
    && value !== null
    && typeof (value as SpellKeybind).chord === 'string'
    && typeof (value as SpellKeybind).order === 'number'
    && Number.isFinite((value as SpellKeybind).order);
}

function readFromStorage(): Keybinds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }

    const next: Keybinds = {};
    let legacyOrder = 0;
    for (const [spellId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') {
        next[spellId] = { chord: value, order: legacyOrder };
        legacyOrder += 1;
        continue;
      }

      if (isSpellKeybind(value)) {
        next[spellId] = value;
      }
    }

    return next;
  } catch {
    return {};
  }
}

export function getResolvedKeybinds(
  slots: readonly KeybindSlotLike[],
  keybinds: Keybinds,
): ResolvedKeybind[] {
  return slots
    .map((slot, slotIndex) => ({
      spellId: slot.spellId,
      defaultKey: slot.defaultKey,
      slotIndex,
      chord: keybinds[slot.spellId]?.chord ?? slot.defaultKey,
      order: keybinds[slot.spellId]?.order ?? slotIndex,
    }))
    .sort((left, right) =>
      left.chord.localeCompare(right.chord)
      || left.order - right.order
      || left.slotIndex - right.slotIndex
      || left.spellId.localeCompare(right.spellId),
    );
}

export function assignSpellKeybind(
  slots: readonly KeybindSlotLike[],
  keybinds: Keybinds,
  spellId: string,
  chord: string,
): Keybinds {
  const resolved = getResolvedKeybinds(slots, keybinds);
  const existingGroup = resolved.filter((binding) => binding.chord === chord && binding.spellId !== spellId);
  const current = resolved.find((binding) => binding.spellId === spellId);
  const nextOrder = current?.chord === chord
    ? current.order
    : existingGroup.length > 0
      ? Math.max(...existingGroup.map((binding) => binding.order)) + 1
      : current?.slotIndex ?? 0;

  return {
    ...keybinds,
    [spellId]: {
      chord,
      order: nextOrder,
    },
  };
}

export function moveSpellKeybindOrder(
  slots: readonly KeybindSlotLike[],
  keybinds: Keybinds,
  spellId: string,
  direction: -1 | 1,
): Keybinds {
  const resolved = getResolvedKeybinds(slots, keybinds);
  const target = resolved.find((binding) => binding.spellId === spellId);
  if (!target) {
    return keybinds;
  }

  const group = resolved.filter((binding) => binding.chord === target.chord);
  const index = group.findIndex((binding) => binding.spellId === spellId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= group.length) {
    return keybinds;
  }

  const reordered = group.slice();
  const [binding] = reordered.splice(index, 1);
  reordered.splice(nextIndex, 0, binding);

  const next = { ...keybinds };
  reordered.forEach((entry, order) => {
    next[entry.spellId] = {
      chord: target.chord,
      order,
    };
  });

  return next;
}

/**
 * Persists keybind overrides (spellId → chord string) to localStorage.
 * Degrades gracefully to in-memory-only state when storage is unavailable.
 *
 * Returns [keybinds, setKeybinds] where setKeybinds accepts a direct value
 * only — NOT a functional updater. This ensures the same object is written
 * to both React state and localStorage.
 *
 * Storage key: 'wow_trainer_keybinds'
 */
export function useKeybinds(): [Keybinds, (next: Keybinds) => void] {
  const [keybinds, setKeybindsState] = useState<Keybinds>(readFromStorage);

  const setKeybinds = useCallback((next: Keybinds): void => {
    setKeybindsState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable — in-memory state remains authoritative
    }
  }, []);

  return [keybinds, setKeybinds];
}
