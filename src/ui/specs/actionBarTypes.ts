/**
 * Shared action-bar slot and button type definitions.
 *
 * Lives here (outside ActionBar.tsx) so that spec-specific action-bar data
 * modules (e.g. monk/actionBar.ts) can import from this file without creating
 * a circular dependency through the rendering component.
 */

export interface ActionBarSlotDef {
  spellId: string;
  defaultKey: string;
  cdTotal: number;
  cooldownQuerySpellId?: string;
  defaultMaxCharges?: number;
  activeBuffId?: string;
  talentRequired?: string;
  talentExcluded?: string;
  replacesSpellId?: string;
  procOverride?: { buffId: string; spellId: string; cooldownQuerySpellId?: string; defaultMaxCharges?: number };
  procGlow?: { buffId: string };
  isOffGcd?: boolean;
}

export interface ActionBarButtonAssignment {
  spellIds: string[];
  keybind: string;
}
