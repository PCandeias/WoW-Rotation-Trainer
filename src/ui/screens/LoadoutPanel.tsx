import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { T, FONTS, SIZES } from '@ui/theme/elvui';
import {
  cloneLoadout,
  GEAR_SLOTS,
  parseTemporaryEnchants,
  stringifyGearItemValue,
  stringifyTemporaryEnchants,
  upsertGearItem,
  type CharacterLoadout,
  type LoadoutExternalBuffs,
} from '@core/data/loadout';
import { getDefaultMonkWindwalkerProfile } from '@core/data/defaultProfile';
import { SearchableTextInput, type SearchSuggestion } from '@ui/components/SearchableTextInput';
import { TalentTreeView } from '../components/TalentTreeView';
import { buildControlStyle, buildHudFrameStyle, buildPanelStyle } from '@ui/theme/stylePrimitives';
import {
  decodeTalentLoadoutState,
  getTalentCatalog,
  MONK_WINDWALKER_TALENT_LOADOUT,
  type TalentLoadoutDefinition,
} from '@core/data/talentStringDecoder';

const DEFAULT_PROFILE = getDefaultMonkWindwalkerProfile();

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LoadoutPanelProps {
  /** Loadout definition that drives the talent tree UI and import decoding. */
  definition?: TalentLoadoutDefinition;
  /** Current non-talent profile loadout settings. */
  loadout?: CharacterLoadout;
  /** Active selected talents for the current profile. */
  talents?: ReadonlySet<string>;
  /** Active selected talent ranks for the current profile. */
  talentRanks?: ReadonlyMap<string, number>;
  /** Updates the active talent selection for the current profile. */
  onTalentChange?: (talents: ReadonlySet<string>, talentRanks: ReadonlyMap<string, number>) => void;
  onLoadoutChange?: (loadout: CharacterLoadout) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadoutPanel({
  definition = MONK_WINDWALKER_TALENT_LOADOUT,
  loadout,
  talents,
  talentRanks,
  onTalentChange,
  onLoadoutChange,
  onClose,
}: LoadoutPanelProps): React.ReactElement {
  const [importString, setImportString] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [talentStatus, setTalentStatus] = useState<string | null>(null);
  const [highlightedTalentIds, setHighlightedTalentIds] = useState<Set<string>>(new Set());
  const [loadoutStatus, setLoadoutStatus] = useState<string | null>(null);
  const [loadoutError, setLoadoutError] = useState<string | null>(null);
  const [consumableDrafts, setConsumableDrafts] = useState(() => buildConsumableDrafts(loadout));
  const [temporaryEnchantDraft, setTemporaryEnchantDraft] = useState(() => buildTemporaryEnchantDraft(loadout));
  const [gearDrafts, setGearDrafts] = useState(() => buildGearDrafts(loadout));
  const preserveDraftsOnNextLoadoutSync = useRef(false);
  const loadoutSuggestions = useMemo(() => buildLoadoutSuggestions(loadout), [loadout]);

  useEffect(() => {
    if (preserveDraftsOnNextLoadoutSync.current) {
      preserveDraftsOnNextLoadoutSync.current = false;
      setLoadoutStatus(null);
      setLoadoutError(null);
      return;
    }

    setConsumableDrafts(buildConsumableDrafts(loadout));
    setTemporaryEnchantDraft(buildTemporaryEnchantDraft(loadout));
    setGearDrafts(buildGearDrafts(loadout));
    setLoadoutStatus(null);
    setLoadoutError(null);
  }, [loadout]);

  const handleResetAll = useCallback(() => {
    if (onLoadoutChange) {
      onLoadoutChange(cloneLoadout(DEFAULT_PROFILE.loadout));
    }

    if (!onTalentChange || definition.id !== MONK_WINDWALKER_TALENT_LOADOUT.id) {
      setTalentStatus('Default loadout restored.');
      setHighlightedTalentIds(new Set());
      return;
    }

    const changedTalentIds = getChangedTalentIds(talents, DEFAULT_PROFILE.talents);
    onTalentChange(DEFAULT_PROFILE.talents, DEFAULT_PROFILE.talentRanks);
    setImportError(null);
    setImportString('');
    setHighlightedTalentIds(changedTalentIds);
    setTalentStatus(
      changedTalentIds.size === 0
        ? 'Current build already matches the default profile build.'
        : `Restored the default profile build. Changed: ${formatTalentChanges(definition, changedTalentIds)}`,
    );
  }, [definition, onLoadoutChange, onTalentChange, talents]);

  const handleTalentImport = useCallback(() => {
    if (!onTalentChange) {
      return;
    }

    const decoded = decodeTalentLoadoutState(definition, importString.trim());
    if (!decoded) {
      setImportError('Invalid loadout string for this talent definition.');
      setTalentStatus(null);
      return;
    }

    const changedTalentIds = getChangedTalentIds(talents, decoded.talents);

    onTalentChange(decoded.talents, decoded.talentRanks);
    setImportError(null);
    setHighlightedTalentIds(changedTalentIds);
    setTalentStatus(
      changedTalentIds.size === 0
        ? 'Imported build matches the current talent state.'
        : `Imported build applied. Changed: ${formatTalentChanges(definition, changedTalentIds)}`,
    );
  }, [definition, importString, onTalentChange, talents]);

  const handleApplyLoadoutChanges = useCallback(() => {
    if (!loadout || !onLoadoutChange) {
      return;
    }

    try {
      const next = cloneLoadout(loadout);
      next.consumables.potion = normalizeOptionalField(consumableDrafts.potion);
      next.consumables.flask = normalizeOptionalField(consumableDrafts.flask);
      next.consumables.food = normalizeOptionalField(consumableDrafts.food);
      next.consumables.augmentation = normalizeOptionalField(consumableDrafts.augmentation);
      next.consumables.temporaryEnchants = parseTemporaryEnchants(temporaryEnchantDraft.trim());

      for (const slot of GEAR_SLOTS) {
        upsertGearItem(next, slot, gearDrafts[slot].trim(), `${slot}=${gearDrafts[slot].trim()}`);
      }

      onLoadoutChange(next);
      setLoadoutError(null);
      setLoadoutStatus('Loadout changes applied.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update the loadout.';
      setLoadoutStatus(null);
      setLoadoutError(message);
    }
  }, [consumableDrafts, gearDrafts, loadout, onLoadoutChange, temporaryEnchantDraft]);

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const backdrop: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'radial-gradient(circle at top, rgba(96, 122, 168, 0.18), transparent 28%), rgba(2, 5, 12, 0.82)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const panel: CSSProperties = {
    ...buildPanelStyle({ elevated: true }),
    background: 'linear-gradient(180deg, rgba(15, 19, 31, 0.98), rgba(7, 11, 20, 0.98))',
    border: `1px solid ${T.borderBright}`,
    borderRadius: 16,
    padding: '20px 24px 18px',
    width: 'min(1460px, calc(100vw - 24px))',
    height: 'calc(100vh - 24px)',
    maxHeight: 'calc(100vh - 24px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    fontFamily: FONTS.ui,
    boxShadow: '0 20px 70px rgba(0,0,0,0.45)',
    overflow: 'hidden',
  };

  const header: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    borderBottom: `1px solid ${T.borderSubtle}`,
    paddingBottom: 16,
  };

  const headerCopy: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  };

  const title: CSSProperties = {
    margin: 0,
    fontFamily: FONTS.display,
    fontSize: '1.45rem',
    color: T.textBright,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  };

  const subtitle: CSSProperties = {
    color: T.textDim,
    fontFamily: FONTS.body,
    fontSize: '0.84rem',
    letterSpacing: '0.08em',
  };

  const titleMetaRow: CSSProperties = {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 6,
  };

  const metaChip: CSSProperties = {
    ...buildHudFrameStyle({ compact: true }),
    padding: '5px 9px',
    color: T.textDim,
    fontFamily: FONTS.ui,
    fontSize: '0.64rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  };

  const body: CSSProperties = {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    overflowY: 'auto',
    paddingRight: 4,
  };

  const talentsSection: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '4px 0 8px',
  };

  const importSection: CSSProperties = {
    ...buildPanelStyle({ density: 'compact' }),
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '14px 16px 12px',
    background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(9, 14, 25, 0.9))',
    borderRadius: 12,
  };

  const loadoutSection: CSSProperties = {
    ...buildPanelStyle({ density: 'compact' }),
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '14px 16px 12px',
    background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(9, 14, 25, 0.9))',
    borderRadius: 12,
  };

  const sectionTitle: CSSProperties = {
    color: T.textBright,
    fontFamily: FONTS.ui,
    fontSize: '0.82rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  };

  const toggleGrid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 10,
  };

  const toggleRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
  };

  const compactList: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 8,
  };

  const compactItem: CSSProperties = {
    color: T.text,
    fontFamily: FONTS.body,
    fontSize: '0.78rem',
    padding: '10px 12px',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 12,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
  };

  const sectionText: CSSProperties = {
    color: T.textDim,
    fontFamily: FONTS.body,
    fontSize: '0.8rem',
    lineHeight: 1.5,
    maxWidth: 840,
  };

  const importRow: CSSProperties = {
    display: 'flex',
    gap: 10,
    alignItems: 'stretch',
  };

  const importInput: CSSProperties = {
    flex: 1,
    minHeight: 76,
    resize: 'vertical',
    background: 'linear-gradient(180deg, rgba(8, 13, 24, 0.98), rgba(5, 10, 18, 0.96))',
    border: `1px solid ${T.borderBright}`,
    borderRadius: 12,
    color: T.textBright,
    fontFamily: FONTS.ui,
    fontSize: '0.75rem',
    lineHeight: 1.4,
    padding: '10px 12px',
  };

  const importButton: CSSProperties = {
    ...buildControlStyle({ tone: 'secondary' }),
    alignSelf: 'stretch',
    minWidth: 108,
    fontFamily: FONTS.ui,
    fontSize: '0.76rem',
    cursor: onTalentChange ? 'pointer' : 'not-allowed',
    opacity: onTalentChange ? 1 : 0.5,
    padding: '0 14px',
  };

  const importErrorText: CSSProperties = {
    color: '#ff9a9a',
    fontFamily: FONTS.ui,
    fontSize: '0.72rem',
  };

  const editorGrid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 10,
  };

  const inputGroup: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };

  const fieldLabel: CSSProperties = {
    color: T.textDim,
    fontFamily: FONTS.ui,
    fontSize: '0.72rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  const textInput: CSSProperties = {
    width: '100%',
    background: 'linear-gradient(180deg, rgba(8, 13, 24, 0.98), rgba(5, 10, 18, 0.96))',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 12,
    color: T.textBright,
    fontFamily: FONTS.ui,
    fontSize: '0.74rem',
    padding: '10px 12px',
  };

  const applyLoadoutBtn: CSSProperties = {
    ...buildControlStyle({ tone: 'primary' }),
    alignSelf: 'flex-start',
    fontFamily: FONTS.ui,
    fontSize: '0.76rem',
    padding: '10px 16px',
  };

  const footer: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    borderTop: `1px solid ${T.border}`,
    paddingTop: 12,
  };

  const resetBtn: CSSProperties = {
    ...buildControlStyle({ tone: 'ghost' }),
    borderRadius: SIZES.borderRadius,
    color: T.textDim,
    fontFamily: FONTS.ui,
    fontSize: '0.75rem',
    padding: '8px 12px',
  };

  const closeBtn: CSSProperties = {
    ...buildControlStyle({ tone: 'ghost' }),
    borderRadius: 10,
    color: T.textDim,
    fontFamily: FONTS.ui,
    fontSize: '0.75rem',
    padding: '8px 12px',
  };

  const footerHint: CSSProperties = {
    color: T.textDim,
    fontFamily: FONTS.body,
    fontSize: '0.78rem',
  };
  const externalBuffLabels: Record<keyof LoadoutExternalBuffs, string> = {
    bloodlust: 'Bloodlust',
    battleShout: 'Battle Shout',
    arcaneIntellect: 'Arcane Intellect',
    markOfTheWild: 'Mark of the Wild',
    powerWordFortitude: 'Power Word: Fortitude',
    skyfury: 'Skyfury',
    mysticTouch: 'Mystic Touch',
    chaosBrand: 'Chaos Brand',
    huntersMark: "Hunter's Mark",
  };
  return (
    <div style={backdrop} onClick={onClose}>
      <div style={panel} onClick={(e): void => e.stopPropagation()}>
        <div style={header}>
          <div style={headerCopy}>
            <h2 style={title}>Loadout</h2>
            <span style={subtitle}>Talents and loadout</span>
            <div style={titleMetaRow}>
              <span style={metaChip}>Live Profile</span>
              <span style={metaChip}>Talents</span>
              <span style={metaChip}>SimC Values</span>
            </div>
          </div>
          <button style={closeBtn} onClick={onClose}>
            × Close
          </button>
        </div>

        <div style={body}>
          <section style={talentsSection}>
            <span style={sectionTitle}>Talent Tree</span>
            <span style={sectionText}>
              Selected nodes update the live simulation profile. Each point pool is tracked separately,
              hero trees stay mutually exclusive, and detached nodes still spend from their owning tree.
            </span>
            <TalentTreeView
              definition={definition}
              talents={talents}
              talentRanks={talentRanks}
              highlightedTalentIds={highlightedTalentIds}
              onChange={onTalentChange}
            />
          </section>

          <section style={importSection}>
            <span style={sectionTitle}>Talent Import</span>
            <span style={sectionText}>
              Paste a talent loadout string to replace the current talent state with a decoded build.
            </span>
            <div style={importRow}>
              <textarea
                aria-label="Talent import string"
                placeholder="Paste talent import string"
                spellCheck={false}
                value={importString}
                onChange={(event): void => {
                  setImportString(event.target.value);
                  if (importError) {
                    setImportError(null);
                  }
                  if (talentStatus) {
                    setTalentStatus(null);
                  }
                  if (highlightedTalentIds.size > 0) {
                    setHighlightedTalentIds(new Set());
                  }
                }}
                style={importInput}
              />
              <button
                type="button"
                style={importButton}
                onClick={handleTalentImport}
                disabled={!onTalentChange}
              >
                Apply Import
              </button>
            </div>
            {importError && <span style={importErrorText}>{importError}</span>}
            {!importError && talentStatus && <span style={sectionText}>{talentStatus}</span>}
          </section>

          {loadout && onLoadoutChange && (
            <section style={loadoutSection}>
              <span style={sectionTitle}>SimC Loadout</span>
              <span style={sectionText}>
                External buffs default to the SimC `optimal_raid=1` setup. Consumables, temporary enchants, and equipped items can be
                edited directly using the same raw value rules as the profile parser.
              </span>
              <div style={toggleGrid}>
                {(Object.entries(loadout.externalBuffs) as [keyof LoadoutExternalBuffs, boolean][]).map(([buffId, enabled]) => (
                  <label key={buffId} style={toggleRow}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event): void => {
                        const next = cloneLoadout(loadout);
                        next.externalBuffs[buffId] = event.target.checked;
                        preserveDraftsOnNextLoadoutSync.current = true;
                        onLoadoutChange(next);
                      }}
                    />
                    <span>{externalBuffLabels[buffId] ?? buffId}</span>
                  </label>
                ))}
              </div>
              <div style={editorGrid}>
                <label style={inputGroup}>
                  <span style={fieldLabel}>Potion</span>
                  <SearchableTextInput
                    ariaLabel="Potion value"
                    inputStyle={textInput}
                    value={consumableDrafts.potion}
                    suggestions={loadoutSuggestions.potion}
                    onChange={(nextValue): void => {
                      setConsumableDrafts((current) => ({ ...current, potion: nextValue }));
                      setLoadoutError(null);
                      setLoadoutStatus(null);
                    }}
                  />
                </label>
                <label style={inputGroup}>
                  <span style={fieldLabel}>Flask</span>
                  <SearchableTextInput
                    ariaLabel="Flask value"
                    inputStyle={textInput}
                    value={consumableDrafts.flask}
                    suggestions={loadoutSuggestions.flask}
                    onChange={(nextValue): void => {
                      setConsumableDrafts((current) => ({ ...current, flask: nextValue }));
                      setLoadoutError(null);
                      setLoadoutStatus(null);
                    }}
                  />
                </label>
                <label style={inputGroup}>
                  <span style={fieldLabel}>Food</span>
                  <SearchableTextInput
                    ariaLabel="Food value"
                    inputStyle={textInput}
                    value={consumableDrafts.food}
                    suggestions={loadoutSuggestions.food}
                    onChange={(nextValue): void => {
                      setConsumableDrafts((current) => ({ ...current, food: nextValue }));
                      setLoadoutError(null);
                      setLoadoutStatus(null);
                    }}
                  />
                </label>
                <label style={inputGroup}>
                  <span style={fieldLabel}>Augmentation</span>
                  <SearchableTextInput
                    ariaLabel="Augmentation value"
                    inputStyle={textInput}
                    value={consumableDrafts.augmentation}
                    suggestions={loadoutSuggestions.augmentation}
                    onChange={(nextValue): void => {
                      setConsumableDrafts((current) => ({ ...current, augmentation: nextValue }));
                      setLoadoutError(null);
                      setLoadoutStatus(null);
                    }}
                  />
                </label>
              </div>
              <label style={inputGroup}>
                <span style={fieldLabel}>Temporary enchants</span>
                <SearchableTextInput
                  ariaLabel="Temporary enchants value"
                  inputStyle={textInput}
                  value={temporaryEnchantDraft}
                  suggestions={loadoutSuggestions.temporaryEnchants}
                  onChange={(nextValue): void => {
                    setTemporaryEnchantDraft(nextValue);
                    setLoadoutError(null);
                    setLoadoutStatus(null);
                  }}
                />
                <span style={sectionText}>Format: `main_hand:enchant/off_hand:enchant`</span>
              </label>
              <div style={editorGrid}>
                {GEAR_SLOTS.map((slot) => (
                  <label key={slot} style={inputGroup}>
                    <span style={fieldLabel}>{formatGearSlotLabel(slot)}</span>
                    <SearchableTextInput
                      ariaLabel={`${formatGearSlotLabel(slot)} gear value`}
                      inputStyle={textInput}
                      value={gearDrafts[slot]}
                      suggestions={loadoutSuggestions.gear[slot]}
                      onChange={(nextValue): void => {
                        setGearDrafts((current) => ({ ...current, [slot]: nextValue }));
                        setLoadoutError(null);
                        setLoadoutStatus(null);
                      }}
                    />
                  </label>
                ))}
              </div>
              <span style={sectionText}>
                Gear format: `item_name,id=123,enchant_id=456,gem_id=1/2,bonus_id=3/4,crafted_stats=5/6`.
                Leave a slot blank to remove it.
              </span>
              <button type="button" style={applyLoadoutBtn} onClick={handleApplyLoadoutChanges}>
                Apply loadout changes
              </button>
              {loadoutError && <span style={importErrorText}>{loadoutError}</span>}
              {!loadoutError && loadoutStatus && <span style={sectionText}>{loadoutStatus}</span>}
              <div style={compactList}>
                {loadout.gear.map((item) => (
                  <div key={item.slot} style={compactItem}>
                    {formatGearSlotLabel(item.slot)}: {item.itemName}
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>

        <div style={footer}>
          <button style={resetBtn} onClick={handleResetAll}>
            Reset all
          </button>
          <span style={footerHint}>Action bar shortcuts are now configured from the Action Bars and HUD layout editors.</span>
        </div>
      </div>
    </div>
  );
}

function formatGearSlotLabel(slot: string): string {
  return slot.replace(/_/g, ' ').replace(/\b\w/g, (part: string) => part.toUpperCase());
}

function buildConsumableDrafts(loadout: CharacterLoadout | undefined): Record<'potion' | 'flask' | 'food' | 'augmentation', string> {
  return {
    potion: loadout?.consumables.potion ?? '',
    flask: loadout?.consumables.flask ?? '',
    food: loadout?.consumables.food ?? '',
    augmentation: loadout?.consumables.augmentation ?? '',
  };
}

function buildTemporaryEnchantDraft(loadout: CharacterLoadout | undefined): string {
  return stringifyTemporaryEnchants(loadout?.consumables.temporaryEnchants ?? []);
}

function buildGearDrafts(loadout: CharacterLoadout | undefined): Record<(typeof GEAR_SLOTS)[number], string> {
  const bySlot = new Map((loadout?.gear ?? []).map((item) => [item.slot, stringifyGearItemValue(item)]));
  return Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, bySlot.get(slot) ?? ''])) as Record<(typeof GEAR_SLOTS)[number], string>;
}

function buildLoadoutSuggestions(loadout: CharacterLoadout | undefined): {
  potion: SearchSuggestion[];
  flask: SearchSuggestion[];
  food: SearchSuggestion[];
  augmentation: SearchSuggestion[];
  temporaryEnchants: SearchSuggestion[];
  gear: Record<(typeof GEAR_SLOTS)[number], SearchSuggestion[]>;
} {
  const gearDrafts = buildGearDrafts(loadout);
  const gearValues = Object.values(gearDrafts);

  return {
    potion: createValueSuggestions('potion', [
      loadout?.consumables.potion,
      DEFAULT_PROFILE.loadout?.consumables.potion,
      'tempered_potion_3',
      'disabled',
    ]),
    flask: createValueSuggestions('flask', [
      loadout?.consumables.flask,
      DEFAULT_PROFILE.loadout?.consumables.flask,
      'flask_of_alchemical_chaos_3',
      'disabled',
    ]),
    food: createValueSuggestions('food', [
      loadout?.consumables.food,
      DEFAULT_PROFILE.loadout?.consumables.food,
      'feast_of_the_divine_day',
      'sizzling_seafood_medley',
      'disabled',
    ]),
    augmentation: createValueSuggestions('augmentation', [
      loadout?.consumables.augmentation,
      DEFAULT_PROFILE.loadout?.consumables.augmentation,
      'crystallized',
      'disabled',
    ]),
    temporaryEnchants: createValueSuggestions('temporary-enchants', [
      stringifyTemporaryEnchants(loadout?.consumables.temporaryEnchants ?? []),
      stringifyTemporaryEnchants(DEFAULT_PROFILE.loadout?.consumables.temporaryEnchants ?? []),
      'main_hand:authority_of_the_depths/off_hand:authority_of_the_depths',
      'main_hand:authority_of_the_depths',
    ]),
    gear: Object.fromEntries(
      GEAR_SLOTS.map((slot) => [
        slot,
        createValueSuggestions(`gear-${slot}`, [gearDrafts[slot], ...gearValues]),
      ]),
    ) as Record<(typeof GEAR_SLOTS)[number], SearchSuggestion[]>,
  };
}

function createValueSuggestions(prefix: string, values: (string | null | undefined)[]): SearchSuggestion[] {
  const uniqueValues = [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  return uniqueValues.map((value, index) => ({
    id: `${prefix}-${index}`,
    value,
    label: formatSuggestionLabel(value),
    keywords: extractSuggestionKeywords(value),
  }));
}

function formatSuggestionLabel(value: string): string {
  if (value.includes(',id=')) {
    const [name, idPart] = value.split(',id=');
    return `${formatGearSlotLabel(name)} (ID ${idPart})`;
  }

  return formatGearSlotLabel(value);
}

function extractSuggestionKeywords(value: string): string[] {
  return value
    .split(/[,_:=/]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeOptionalField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default LoadoutPanel;

function getChangedTalentIds(
  currentTalents: ReadonlySet<string> | undefined,
  nextTalents: ReadonlySet<string>,
): Set<string> {
  const currentTalentIds = new Set(currentTalents ?? []);
  const changedTalentIds = new Set<string>();

  for (const internalId of nextTalents) {
    if (!currentTalentIds.has(internalId)) {
      changedTalentIds.add(internalId);
    }
  }

  for (const internalId of currentTalentIds) {
    if (!nextTalents.has(internalId)) {
      changedTalentIds.add(internalId);
    }
  }

  return changedTalentIds;
}

function formatTalentChanges(
  definition: TalentLoadoutDefinition,
  changedTalentIds: ReadonlySet<string>,
): string {
  const nameByInternalId = new Map<string, string>();

  for (const node of getTalentCatalog(definition)) {
    node.internalIds.forEach((internalId, index) => {
      nameByInternalId.set(internalId, node.names[index] ?? internalId);
    });
  }

  const changedNames = [...changedTalentIds]
    .map((internalId) => nameByInternalId.get(internalId) ?? internalId)
    .sort((left, right) => left.localeCompare(right));

  if (changedNames.length <= 4) {
    return changedNames.join(', ');
  }

  return `${changedNames.slice(0, 4).join(', ')} +${changedNames.length - 4} more`;
}
