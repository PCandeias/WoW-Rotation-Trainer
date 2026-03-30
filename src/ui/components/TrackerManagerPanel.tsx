import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AbilityIcon } from './AbilityIcon';
import { HudLayoutPreview } from './HudLayoutPreview';
import { SearchableTextInput, type SearchSuggestion } from './SearchableTextInput';
import { FONTS, T } from '@ui/theme/elvui';
import { buildCardStyle, buildControlStyle, buildHudFrameStyle, buildPanelStyle } from '@ui/theme/stylePrimitives';
import type {
  TrackerEntrySettings,
  TrackerGroupSettings,
  TrainerSettings,
  TrainerSettingsUpdater,
} from '@ui/state/trainerSettings';
import {
  BUFF_TRACKERS,
  CONSUMABLE_TRACKERS,
  ESSENTIAL_COOLDOWN_TRACKERS,
  UTILITY_COOLDOWN_TRACKERS,
  type TrackerCatalogEntry,
} from '@ui/state/trackerCatalog';

type ManagerTab = 'cooldowns' | 'buffs' | 'consumables';
type BuffAssignment = 'icons' | 'bars' | 'hidden';
type CooldownAssignment = 'essential' | 'utility';

interface TrackerManagerPanelProps {
  settings: TrainerSettings;
  onChange: (settings: TrainerSettingsUpdater) => void;
  buffBlacklistDraft: string;
  targetDebuffBlacklistDraft: string;
  hudFilterError: string | null;
  hudFilterStatus: string | null;
  supportedBuffBlacklistIds: ReadonlySet<number>;
  supportedTargetDebuffBlacklistIds: ReadonlySet<number>;
  onBuffBlacklistDraftChange: (value: string) => void;
  onTargetDebuffBlacklistDraftChange: (value: string) => void;
  onApplyFilters: () => void;
  onClearMessages: () => void;
  onOpenHudLayoutEditor?: (mode: 'layout' | 'keybind') => void;
}

interface ContextEntryState {
  groupKey: GroupKey;
  entryId: string;
  anchorX: number;
  anchorY: number;
}

interface DragEntryState {
  groupKey: GroupKey;
  entryId: string;
}

type GroupKey =
  | 'cooldowns.essential'
  | 'cooldowns.utility'
  | 'buffs.iconTracker'
  | 'buffs.barTracker'
  | 'consumables';

const MANAGER_TABS: { id: ManagerTab; label: string }[] = [
  { id: 'cooldowns', label: 'Cooldowns' },
  { id: 'buffs', label: 'Buffs' },
  { id: 'consumables', label: 'Consumables' },
];
const TRACKER_CONTEXT_MENU_WIDTH_PX = 360;
const TRACKER_CONTEXT_MENU_HEIGHT_PX = 420;
const TRACKER_CONTEXT_MENU_MARGIN_PX = 12;

/**
 * Blizzard-style tracker manager used from the setup HUD tab.
 */
export function TrackerManagerPanel({
  settings,
  onChange,
  buffBlacklistDraft,
  targetDebuffBlacklistDraft,
  hudFilterError,
  hudFilterStatus,
  supportedBuffBlacklistIds,
  supportedTargetDebuffBlacklistIds,
  onBuffBlacklistDraftChange,
  onTargetDebuffBlacklistDraftChange,
  onApplyFilters,
  onClearMessages,
  onOpenHudLayoutEditor,
}: TrackerManagerPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<ManagerTab>('cooldowns');
  const [contextEntry, setContextEntry] = useState<ContextEntryState | null>(null);
  const [dragEntry, setDragEntry] = useState<DragEntryState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const currentContextConfig = useMemo(() => {
    if (!contextEntry) {
      return null;
    }

    const group = readGroup(settings, contextEntry.groupKey);
    const entry = getCatalogEntry(settings, contextEntry.groupKey, contextEntry.entryId);
    if (!entry) {
      return null;
    }

    return {
      groupKey: contextEntry.groupKey,
      entryId: contextEntry.entryId,
      anchorX: contextEntry.anchorX,
      anchorY: contextEntry.anchorY,
      entry,
      group,
      options: group.entryOptions[contextEntry.entryId] ?? getDefaultEntrySettings(),
      enabled: group.trackedEntryIds.includes(contextEntry.entryId),
      buffAssignment: contextEntry.groupKey.startsWith('buffs.')
        ? getBuffAssignment(settings, contextEntry.entryId)
        : null,
      cooldownAssignment: contextEntry.groupKey.startsWith('cooldowns.')
        ? getCooldownAssignment(settings, contextEntry.entryId)
        : null,
    };
  }, [contextEntry, settings]);

  useEffect(() => {
    if (!currentContextConfig) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) {
        return;
      }

      setContextEntry(null);
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    return (): void => {
      window.removeEventListener('mousedown', handlePointerDown, true);
    };
  }, [currentContextConfig]);

  const root: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 84px',
    gap: 16,
    minHeight: 0,
    height: '100%',
  };

  const managerShell: CSSProperties = {
    ...buildPanelStyle({ elevated: true }),
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    position: 'relative',
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
  };

  const managerContent: CSSProperties = {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'grid',
    gap: 16,
    paddingRight: 4,
  };

  const managerTabRail: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    alignItems: 'stretch',
    minHeight: 0,
    height: '100%',
  };

  const tabButtonStyle = (active: boolean): CSSProperties => ({
    ...buildControlStyle({ tone: 'ghost', active }),
    border: `1px solid ${active ? T.accent : T.border}`,
    borderRadius: 14,
    background: active ? 'rgba(53, 200, 155, 0.12)' : 'rgba(255,255,255,0.03)',
    color: active ? T.accent : T.textDim,
    fontFamily: FONTS.ui,
    fontSize: '0.76rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    padding: '14px 8px',
    writingMode: 'vertical-rl',
    transform: 'rotate(180deg)',
    minHeight: 120,
  });

  const sectionShell: CSSProperties = {
    ...buildPanelStyle({ density: 'compact' }),
    padding: 14,
    background: 'linear-gradient(180deg, rgba(14, 22, 36, 0.9), rgba(7, 12, 22, 0.9))',
    display: 'grid',
    gap: 12,
  };

  const headerRow: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  };

  const toggleButton = (active: boolean): CSSProperties => ({
    ...buildControlStyle({ tone: 'ghost', active }),
    border: `1px solid ${active ? T.accent : T.borderBright}`,
    borderRadius: 10,
    padding: '8px 12px',
    background: active ? 'rgba(53, 200, 155, 0.12)' : 'transparent',
    color: active ? T.accent : T.textBright,
    fontFamily: FONTS.ui,
  });

  const tileGrid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(98px, 1fr))',
    gap: 10,
  };

  const renderTrackerTile = (groupKey: GroupKey, group: TrackerGroupSettings, entry: TrackerCatalogEntry): React.ReactElement => {
    const tracked = group.trackedEntryIds.includes(entry.id);
    const options = group.entryOptions[entry.id] ?? getDefaultEntrySettings();

    return (
      <button
        key={`${groupKey}:${entry.id}`}
        type="button"
        aria-label={entry.displayName}
        aria-pressed={tracked}
        data-testid={`tracker-entry-${groupKey}-${entry.id}`}
        onClick={(): void => {
          onClearMessages();
          toggleTrackedEntry(onChange, groupKey, entry.id);
        }}
        onContextMenu={(event): void => {
          event.preventDefault();
          onClearMessages();
          setContextEntry({ groupKey, entryId: entry.id, anchorX: event.clientX, anchorY: event.clientY });
        }}
        draggable={tracked}
        onDragStart={(): void => {
          if (tracked) {
            setDragEntry({ groupKey, entryId: entry.id });
          }
        }}
        onDragEnd={(): void => setDragEntry(null)}
        onDragOver={(event): void => {
          if (!tracked) {
            return;
          }
          event.preventDefault();
        }}
        onDrop={(event): void => {
          event.preventDefault();
          if (!tracked || dragEntry?.groupKey !== groupKey || dragEntry.entryId === entry.id) {
            return;
          }
          onClearMessages();
          reorderTrackedEntry(onChange, groupKey, dragEntry.entryId, entry.id);
          setDragEntry(null);
        }}
        style={{
          ...buildCardStyle({ active: tracked, accentColor: T.classMonk }),
          border: `1px solid ${tracked ? T.classMonk : T.border}`,
          borderRadius: 14,
          background: tracked
            ? 'linear-gradient(180deg, rgba(18, 39, 34, 0.94), rgba(10, 16, 28, 0.92))'
            : 'linear-gradient(180deg, rgba(15, 21, 34, 0.94), rgba(8, 12, 21, 0.9))',
          color: tracked ? T.textBright : T.textDim,
          padding: '10px 8px',
          display: 'grid',
          justifyItems: 'center',
          gap: 6,
          cursor: 'pointer',
          position: 'relative',
          minHeight: 112,
          boxShadow: tracked ? `0 18px 36px ${T.glow}` : T.shadow,
        }}
      >
        <AbilityIcon iconName={entry.iconName} emoji={entry.emoji} size={38} alt={entry.displayName} />
        <span style={{ fontFamily: FONTS.ui, fontSize: '0.72rem', lineHeight: 1.3 }}>{entry.displayName}</span>
        <span style={{ fontFamily: FONTS.ui, fontSize: '0.66rem', color: tracked ? T.accent : T.textDim }}>
          {tracked ? 'Tracked' : 'Hidden'}
        </span>
        {(options.glowWhenReady || options.disableProcGlow) && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              fontFamily: FONTS.ui,
              fontSize: '0.64rem',
              color: T.gold,
            }}
          >
            ⚙
          </span>
        )}
      </button>
    );
  };

  const renderBuffTrackerTile = (entry: TrackerCatalogEntry): React.ReactElement => {
    const assignment = getBuffAssignment(settings, entry.id);
    const options = getBuffEntryOptions(settings, entry.id);

    return (
      <button
        key={`buff:${entry.id}`}
        type="button"
        aria-label={entry.displayName}
        aria-pressed={assignment !== 'hidden'}
        data-testid={`tracker-entry-buffs-${entry.id}`}
        onClick={(): void => {
          onClearMessages();
          toggleBuffTracked(onChange, entry.id);
        }}
        onContextMenu={(event): void => {
          event.preventDefault();
          onClearMessages();
          setContextEntry({
            groupKey: assignment === 'bars' ? 'buffs.barTracker' : 'buffs.iconTracker',
            entryId: entry.id,
            anchorX: event.clientX,
            anchorY: event.clientY,
          });
        }}
        draggable={assignment !== 'hidden'}
        onDragStart={(): void => {
          if (assignment !== 'hidden') {
            setDragEntry({
              groupKey: assignment === 'bars' ? 'buffs.barTracker' : 'buffs.iconTracker',
              entryId: entry.id,
            });
          }
        }}
        onDragEnd={(): void => setDragEntry(null)}
        onDragOver={(event): void => {
          if (assignment === 'hidden') {
            return;
          }
          event.preventDefault();
        }}
        onDrop={(event): void => {
          event.preventDefault();
          if (!dragEntry || assignment === 'hidden' || dragEntry.entryId === entry.id) {
            return;
          }

          const targetGroupKey = assignment === 'bars' ? 'buffs.barTracker' : 'buffs.iconTracker';
          if (dragEntry.groupKey !== targetGroupKey) {
            return;
          }

          onClearMessages();
          reorderTrackedEntry(onChange, targetGroupKey, dragEntry.entryId, entry.id);
          setDragEntry(null);
        }}
        style={{
          ...buildCardStyle({ active: assignment !== 'hidden', accentColor: T.classMonk }),
          border: `1px solid ${assignment === 'hidden' ? T.border : T.classMonk}`,
          borderRadius: 14,
          background: assignment === 'hidden'
            ? 'linear-gradient(180deg, rgba(15, 21, 34, 0.94), rgba(8, 12, 21, 0.9))'
            : 'linear-gradient(180deg, rgba(18, 39, 34, 0.94), rgba(10, 16, 28, 0.92))',
          color: assignment === 'hidden' ? T.textDim : T.textBright,
          padding: '10px 8px',
          display: 'grid',
          justifyItems: 'center',
          gap: 6,
          cursor: 'pointer',
          position: 'relative',
          minHeight: 112,
          boxShadow: assignment === 'hidden' ? T.shadow : `0 18px 36px ${T.glow}`,
        }}
      >
        <AbilityIcon iconName={entry.iconName} emoji={entry.emoji} size={38} alt={entry.displayName} />
        <span style={{ fontFamily: FONTS.ui, fontSize: '0.72rem', lineHeight: 1.3 }}>{entry.displayName}</span>
        <span
          data-testid={`tracker-entry-mode-${entry.id}`}
          style={{ fontFamily: FONTS.ui, fontSize: '0.66rem', color: assignment === 'hidden' ? T.textDim : T.accent }}
        >
          {formatBuffAssignmentLabel(assignment)}
        </span>
        {(options.glowWhenReady || options.disableProcGlow) && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              fontFamily: FONTS.ui,
              fontSize: '0.64rem',
              color: T.gold,
            }}
          >
            ⚙
          </span>
        )}
      </button>
    );
  };

  const renderCooldownsTab = (): React.ReactNode => (
    <>
      {renderTrackerSection(
        'cooldowns.essential',
        'Essential Cooldowns',
        'Core rotational cooldowns shown in their own HUD group.',
        settings.hud.cooldowns.essential,
        getCatalogForGroup(settings, 'cooldowns.essential'),
        renderTrackerTile,
        onChange,
        onClearMessages,
        headerRow,
        sectionShell,
        tileGrid,
        toggleButton,
      )}
      {renderTrackerSection(
        'cooldowns.utility',
        'Utility Cooldowns',
        'Defensives and optional combat buttons tracked separately from the main rotation.',
        settings.hud.cooldowns.utility,
        getCatalogForGroup(settings, 'cooldowns.utility'),
        renderTrackerTile,
        onChange,
        onClearMessages,
        headerRow,
        sectionShell,
        tileGrid,
        toggleButton,
      )}
    </>
  );

  const renderBuffsTab = (): React.ReactNode => {
    return (
      <>
        <section style={sectionShell}>
          <div style={headerRow}>
            <div>
              <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '1rem' }}>Buff Trackers</div>
              <div style={{ color: T.textDim, fontFamily: FONTS.body, fontSize: '0.82rem', marginTop: 4 }}>
                Track Windwalker-specific buffs here. Icon trackers and buff bars are managed as separate groups, and each buff can move between them independently.
              </div>
            </div>
          </div>

          <div data-testid="buff-mode-status" style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>
            Icons {settings.hud.buffs.iconTracker.enabled ? 'shown' : 'hidden'} • Bars {settings.hud.buffs.barTracker.enabled ? 'shown' : 'hidden'}
          </div>
        </section>

        {renderBuffTrackerSection(
          'buffs.iconTracker',
          'Tracked Buff Icons',
          'These buffs render in the icon tracker frame. Drag to reorder them within the icon group.',
          settings.hud.buffs.iconTracker,
          getBuffEntriesForAssignment(settings, 'icons'),
          renderBuffTrackerTile,
          onChange,
          onClearMessages,
          headerRow,
          sectionShell,
          tileGrid,
          toggleButton,
        )}

        {renderBuffTrackerSection(
          'buffs.barTracker',
          'Tracked Buff Bars',
          'These buffs render in the buff-bar frame. Right-click a buff to move it between the icon and bar groups.',
          settings.hud.buffs.barTracker,
          getBuffEntriesForAssignment(settings, 'bars'),
          renderBuffTrackerTile,
          onChange,
          onClearMessages,
          headerRow,
          sectionShell,
          tileGrid,
          toggleButton,
        )}

        <section data-testid="tracker-section-buffs.hidden" style={sectionShell}>
          <div style={headerRow}>
            <div>
              <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '1rem' }}>Hidden Buffs</div>
              <div style={{ color: T.textDim, fontFamily: FONTS.body, fontSize: '0.82rem', marginTop: 4 }}>
                Left-click any hidden buff to add it back to the icon group, or right-click it to choose which tracker group it should join.
              </div>
            </div>
          </div>

          <div style={tileGrid}>
            {getBuffEntriesForAssignment(settings, 'hidden').map((entry) => renderBuffTrackerTile(entry))}
          </div>
        </section>

        <section style={{ ...sectionShell, display: 'grid', gap: 10 }}>
          <div style={headerRow}>
            <div>
              <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '1rem' }}>Enemy Debuffs</div>
              <div style={{ color: T.textDim, fontFamily: FONTS.body, fontSize: '0.82rem', marginTop: 4 }}>
                Keep target-debuff tracking aligned with the health-bar strip and control blacklist spell IDs here.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={toggleButton(settings.hud.targetDebuffs.enabled)}
                onClick={(): void => {
                  onClearMessages();
                  onChange((current) => ({
                    ...current,
                    hud: {
                      ...current.hud,
                      targetDebuffs: {
                        ...current.hud.targetDebuffs,
                        enabled: true,
                      },
                    },
                  }));
                }}
              >
                Show Target Debuffs
              </button>
              <button
                type="button"
                style={toggleButton(!settings.hud.targetDebuffs.enabled)}
                onClick={(): void => {
                  onClearMessages();
                  onChange((current) => ({
                    ...current,
                    hud: {
                      ...current.hud,
                      targetDebuffs: {
                        ...current.hud.targetDebuffs,
                        enabled: false,
                      },
                    },
                  }));
                }}
              >
                Hide Target Debuffs
              </button>
            </div>
          </div>

          {renderFilterEditor(
            'Buff tracker blacklist spell IDs',
            buffBlacklistDraft,
            onBuffBlacklistDraftChange,
            [...supportedBuffBlacklistIds].join(', '),
            '196741, 1249625',
            BUFF_TRACKERS.flatMap((entry) => entry.spellId ? [{
              id: `buff-filter-${entry.id}`,
              label: `${entry.displayName} (${entry.spellId})`,
              value: `${entry.spellId}`,
              keywords: [entry.id],
            }] : []),
          )}

          {renderFilterEditor(
            'Target debuff blacklist spell IDs',
            targetDebuffBlacklistDraft,
            onTargetDebuffBlacklistDraftChange,
            [...supportedTargetDebuffBlacklistIds].join(', '),
            '113746, 1490, 257284',
            [
              { id: 'target-debuff-mystic-touch', label: 'Mystic Touch (113746)', value: '113746', keywords: ['mystic_touch'] },
              { id: 'target-debuff-chaos-brand', label: 'Chaos Brand (1490)', value: '1490', keywords: ['chaos_brand'] },
              { id: 'target-debuff-hunters-mark', label: "Hunter's Mark (257284)", value: '257284', keywords: ['hunters_mark'] },
            ],
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={toggleButton(false)} onClick={onApplyFilters}>
              Apply Tracker Filters
            </button>
            {hudFilterError && <span style={{ color: T.red, fontFamily: FONTS.ui, fontSize: '0.78rem' }}>{hudFilterError}</span>}
            {!hudFilterError && hudFilterStatus && (
              <span style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.78rem' }}>{hudFilterStatus}</span>
            )}
          </div>
        </section>
      </>
    );
  };

  const renderConsumablesTab = (): React.ReactNode => (
    renderTrackerSection(
      'consumables',
      'Consumables, Trinkets & Racials',
      'These entries map to the separate consumable/trinket/racial HUD group.',
      settings.hud.consumables,
      CONSUMABLE_TRACKERS,
      renderTrackerTile,
      onChange,
      onClearMessages,
      headerRow,
      sectionShell,
      tileGrid,
      toggleButton,
    )
  );

  return (
    <div style={root}>
      <div style={managerShell}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '1.05rem' }}>Tracker Manager</div>
            <div
              style={{
                ...buildHudFrameStyle({ compact: true }),
                padding: '4px 8px',
                color: T.accent,
                fontFamily: FONTS.ui,
                fontSize: '0.62rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              HUD Routing
            </div>
          </div>
          <div style={{ color: T.textDim, fontFamily: FONTS.body, fontSize: '0.84rem', marginTop: 6 }}>
            Left-click icons to toggle them in the current HUD group. Right-click an icon to configure per-entry options like ready glow.
          </div>
        </div>

        <div data-testid="tracker-manager-content" style={managerContent}>
          {activeTab === 'cooldowns' && renderCooldownsTab()}
          {activeTab === 'buffs' && renderBuffsTab()}
          {activeTab === 'consumables' && renderConsumablesTab()}

          <HudLayoutPreview
            layout={settings.hud.layout}
            layoutScale={settings.hud.general.layoutScale ?? 1}
            actionBars={settings.actionBars}
            trackerRows={{
              essentialCooldowns: settings.hud.cooldowns.essential.iconsPerRow ?? 12,
              utilityCooldowns: settings.hud.cooldowns.utility.iconsPerRow ?? 12,
              buffIcons: settings.hud.buffs.iconTracker.iconsPerRow ?? 12,
              consumables: settings.hud.consumables.iconsPerRow ?? 12,
            }}
            visibility={{
              enemyIcon: settings.hud.general.showEnemyIcon,
              essentialCooldowns: settings.hud.cooldowns.essential.enabled,
              utilityCooldowns: settings.hud.cooldowns.utility.enabled,
              buffIcons: settings.hud.buffs.iconTracker.enabled,
              buffBars: settings.hud.buffs.barTracker.enabled,
              consumables: settings.hud.consumables.enabled,
              challengePlayfield: true,
              playerFrame: true,
              resourceFrame: true,
              targetFrame: true,
              castBar: true,
              actionBar1: settings.actionBars.bars.bar1.enabled,
              actionBar2: settings.actionBars.bars.bar2.enabled,
              actionBar3: settings.actionBars.bars.bar3.enabled,
              actionBar4: settings.actionBars.bars.bar4.enabled,
              actionBar5: settings.actionBars.bars.bar5.enabled,
            }}
            cooldownTracking={settings.hud.cooldowns}
            buffTracking={{
              iconTracker: settings.hud.buffs.iconTracker,
              barTracker: settings.hud.buffs.barTracker,
              targetDebuffs: settings.hud.targetDebuffs,
            }}
            consumableTracking={settings.hud.consumables}
            onChange={onChange}
            launchRequest={null}
            onOpenEditor={onOpenHudLayoutEditor}
          />

          {currentContextConfig && (
            <section
              ref={contextMenuRef}
              data-testid="tracker-entry-context-menu"
              style={{
                ...contextMenuStyle,
                ...clampViewportPopoverPosition(
                  currentContextConfig.anchorX,
                  currentContextConfig.anchorY,
                  TRACKER_CONTEXT_MENU_WIDTH_PX,
                  TRACKER_CONTEXT_MENU_HEIGHT_PX,
                ),
              }}
            >
              <div style={headerRow}>
                <div>
                  <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '0.98rem' }}>
                    {currentContextConfig.entry.displayName}
                  </div>
                  <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', marginTop: 4 }}>
                    Right-click options
                  </div>
                </div>
                <button type="button" style={toggleButton(false)} onClick={(): void => setContextEntry(null)}>
                  Close
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  aria-pressed={currentContextConfig.enabled}
                  style={toggleButton(currentContextConfig.enabled)}
                  onClick={(): void => {
                    onClearMessages();
                    if (currentContextConfig.groupKey.startsWith('buffs.')) {
                      toggleBuffTracked(onChange, currentContextConfig.entryId);
                    } else {
                      toggleTrackedEntry(onChange, currentContextConfig.groupKey, currentContextConfig.entryId);
                    }
                  }}
                >
                  {currentContextConfig.groupKey.startsWith('buffs.')
                    ? currentContextConfig.buffAssignment === 'hidden'
                      ? 'Hidden from trackers'
                      : `Tracked as ${currentContextConfig.buffAssignment === 'bars' ? 'bar' : 'icon'}`
                    : currentContextConfig.enabled
                      ? 'Tracked in group'
                      : 'Hidden from group'}
                </button>

                {currentContextConfig.groupKey.startsWith('buffs.') && (
                  <>
                    <button
                      type="button"
                      aria-pressed={currentContextConfig.buffAssignment === 'icons'}
                      style={toggleButton(currentContextConfig.buffAssignment === 'icons')}
                      onClick={(): void => {
                        onClearMessages();
                        setBuffAssignment(onChange, currentContextConfig.entryId, 'icons');
                      }}
                    >
                      Move to Icon Group
                    </button>
                    <button
                      type="button"
                      aria-pressed={currentContextConfig.buffAssignment === 'bars'}
                      style={toggleButton(currentContextConfig.buffAssignment === 'bars')}
                      onClick={(): void => {
                        onClearMessages();
                        setBuffAssignment(onChange, currentContextConfig.entryId, 'bars');
                      }}
                    >
                      Move to Bar Group
                    </button>
                  </>
                )}

                {currentContextConfig.groupKey.startsWith('cooldowns.') && (
                  <>
                    <button
                      type="button"
                      aria-pressed={currentContextConfig.cooldownAssignment === 'essential'}
                      style={toggleButton(currentContextConfig.cooldownAssignment === 'essential')}
                      onClick={(): void => {
                        onClearMessages();
                        setCooldownAssignment(onChange, currentContextConfig.entryId, 'essential');
                      }}
                    >
                      Move to Essential
                    </button>
                    <button
                      type="button"
                      aria-pressed={currentContextConfig.cooldownAssignment === 'utility'}
                      style={toggleButton(currentContextConfig.cooldownAssignment === 'utility')}
                      onClick={(): void => {
                        onClearMessages();
                        setCooldownAssignment(onChange, currentContextConfig.entryId, 'utility');
                      }}
                    >
                      Move to Utility
                    </button>
                  </>
                )}

                <button
                  type="button"
                  aria-pressed={currentContextConfig.options.glowWhenReady}
                  style={toggleButton(currentContextConfig.options.glowWhenReady)}
                  onClick={(): void => {
                    onClearMessages();
                    updateEntryOption(onChange, currentContextConfig.groupKey, currentContextConfig.entryId, 'glowWhenReady');
                  }}
                >
                  Glow When Ready
                </button>

                {currentContextConfig.entry.supportsProcGlow && (
                  <button
                    type="button"
                    aria-pressed={currentContextConfig.options.disableProcGlow}
                    style={toggleButton(currentContextConfig.options.disableProcGlow)}
                    onClick={(): void => {
                      onClearMessages();
                      updateEntryOption(onChange, currentContextConfig.groupKey, currentContextConfig.entryId, 'disableProcGlow');
                    }}
                  >
                    Disable Proc Glow
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <div style={managerTabRail}>
        {MANAGER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-label={`Tracker manager ${tab.label}`}
            data-testid={`tracker-manager-tab-${tab.id}`}
            style={tabButtonStyle(activeTab === tab.id)}
            onClick={(): void => {
              setActiveTab(tab.id);
              setContextEntry(null);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function renderTrackerSection(
  groupKey: GroupKey,
  title: string,
  description: string,
  group: TrackerGroupSettings,
  entries: readonly TrackerCatalogEntry[],
  renderTrackerTile: (groupKey: GroupKey, group: TrackerGroupSettings, entry: TrackerCatalogEntry) => React.ReactElement,
  onChange: (settings: TrainerSettingsUpdater) => void,
  onClearMessages: () => void,
  headerRow: CSSProperties,
  sectionShell: CSSProperties,
  tileGrid: CSSProperties,
  toggleButton: (active: boolean) => CSSProperties,
): React.ReactElement {
  const orderedEntries = orderEntriesByTrackedIds(entries, group.trackedEntryIds);
  return (
    <section data-testid={`tracker-section-${groupKey}`} style={sectionShell}>
      <div style={headerRow}>
        <div>
          <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '1rem' }}>{title}</div>
          <div style={{ color: T.textDim, fontFamily: FONTS.body, fontSize: '0.82rem', marginTop: 4 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {group.displayMode !== 'bars' && (
            <label style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.74rem' }}>
              Icons per row{' '}
              <select
                aria-label={`${title} icons per row`}
                value={group.iconsPerRow ?? 12}
                onChange={(event): void => {
                  onClearMessages();
                  onChange((current) => writeGroup(current, groupKey, {
                    ...readGroup(current, groupKey),
                    iconsPerRow: Number.parseInt(event.target.value, 10),
                  }));
                }}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                  <option key={`${groupKey}-icons-${count}`} value={count}>{count}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            style={toggleButton(group.enabled)}
            onClick={(): void => {
              onClearMessages();
              onChange((current) => setGroupEnabled(current, groupKey, true));
            }}
          >
            Show Group
          </button>
          <button
            type="button"
            style={toggleButton(!group.enabled)}
            onClick={(): void => {
              onClearMessages();
              onChange((current) => setGroupEnabled(current, groupKey, false));
            }}
          >
            Hide Group
          </button>
        </div>
      </div>

      <div style={tileGrid}>
        {orderedEntries.map((entry) => renderTrackerTile(groupKey, group, entry))}
      </div>
    </section>
  );
}

function renderBuffTrackerSection(
  groupKey: 'buffs.iconTracker' | 'buffs.barTracker',
  title: string,
  description: string,
  group: TrackerGroupSettings,
  entries: readonly TrackerCatalogEntry[],
  renderBuffTrackerTile: (entry: TrackerCatalogEntry) => React.ReactElement,
  onChange: (settings: TrainerSettingsUpdater) => void,
  onClearMessages: () => void,
  headerRow: CSSProperties,
  sectionShell: CSSProperties,
  tileGrid: CSSProperties,
  toggleButton: (active: boolean) => CSSProperties,
): React.ReactElement {
  return (
    <section data-testid={`tracker-section-${groupKey}`} style={sectionShell}>
      <div style={headerRow}>
        <div>
          <div style={{ fontFamily: FONTS.display, color: T.textBright, fontSize: '1rem' }}>{title}</div>
          <div style={{ color: T.textDim, fontFamily: FONTS.body, fontSize: '0.82rem', marginTop: 4 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {groupKey === 'buffs.iconTracker' && (
            <label style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.74rem' }}>
              Icons per row{' '}
              <select
                aria-label="Buff icons per row"
                value={group.iconsPerRow ?? 12}
                onChange={(event): void => {
                  onClearMessages();
                  onChange((current) => writeGroup(current, groupKey, {
                    ...readGroup(current, groupKey),
                    iconsPerRow: Number.parseInt(event.target.value, 10),
                  }));
                }}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                  <option key={`${groupKey}-icons-${count}`} value={count}>{count}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            style={toggleButton(group.enabled)}
            onClick={(): void => {
              onClearMessages();
              onChange((current) => setGroupEnabled(current, groupKey, true));
            }}
          >
            Show Group
          </button>
          <button
            type="button"
            style={toggleButton(!group.enabled)}
            onClick={(): void => {
              onClearMessages();
              onChange((current) => setGroupEnabled(current, groupKey, false));
            }}
          >
            Hide Group
          </button>
        </div>
      </div>

      <div style={tileGrid}>
        {entries.map((entry) => renderBuffTrackerTile(entry))}
      </div>
    </section>
  );
}

function renderFilterEditor(
  label: string,
  value: string,
  onChange: (value: string) => void,
  supportedIds: string,
  placeholder: string,
  suggestions: readonly SearchSuggestion[],
): React.ReactElement {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>
        {label}
      </span>
      <SearchableTextInput
        ariaLabel={label}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        suggestions={suggestions}
        queryExtractor={extractCommaSeparatedSearchQuery}
        onSuggestionApply={applyCommaSeparatedSuggestion}
        inputStyle={{
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.24)',
          color: T.textBright,
          padding: '8px 10px',
          fontFamily: FONTS.ui,
        }}
      />
      <span style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem' }}>
        Supported IDs: {supportedIds}
      </span>
    </label>
  );
}

function extractCommaSeparatedSearchQuery(value: string): string {
  const tokens = value.split(',');
  return tokens[tokens.length - 1]?.trim() ?? '';
}

function applyCommaSeparatedSuggestion(currentValue: string, suggestion: SearchSuggestion): string {
  const tokens = currentValue.split(',');
  tokens[tokens.length - 1] = ` ${suggestion.value}`;
  return tokens.join(',').trimStart();
}

function getBuffAssignment(settings: TrainerSettings, entryId: string): BuffAssignment {
  if (settings.hud.buffs.iconTracker.trackedEntryIds.includes(entryId)) {
    return 'icons';
  }

  if (settings.hud.buffs.barTracker.trackedEntryIds.includes(entryId)) {
    return 'bars';
  }

  return 'hidden';
}

function formatBuffAssignmentLabel(assignment: BuffAssignment): string {
  switch (assignment) {
    case 'icons':
      return 'Icon';
    case 'bars':
      return 'Bar';
    case 'hidden':
      return 'Hidden';
  }
}

function getBuffEntryOptions(settings: TrainerSettings, entryId: string): TrackerEntrySettings {
  return settings.hud.buffs.iconTracker.entryOptions[entryId]
    ?? settings.hud.buffs.barTracker.entryOptions[entryId]
    ?? getDefaultEntrySettings();
}

function toggleBuffTracked(onChange: (settings: TrainerSettingsUpdater) => void, entryId: string): void {
  onChange((current) => {
    const assignment = getBuffAssignment(current, entryId);
    return setBuffAssignmentForSettings(current, entryId, assignment === 'hidden' ? 'icons' : 'hidden');
  });
}

function setBuffAssignment(
  onChange: (settings: TrainerSettingsUpdater) => void,
  entryId: string,
  assignment: BuffAssignment,
): void {
  onChange((current) => setBuffAssignmentForSettings(current, entryId, assignment));
}

function setBuffAssignmentForSettings(
  settings: TrainerSettings,
  entryId: string,
  assignment: BuffAssignment,
): TrainerSettings {
  const sharedOptions = {
    ...settings.hud.buffs.iconTracker.entryOptions[entryId],
    ...settings.hud.buffs.barTracker.entryOptions[entryId],
  };

  const iconTrackedEntryIds = settings.hud.buffs.iconTracker.trackedEntryIds.filter((candidate) => candidate !== entryId);
  const barTrackedEntryIds = settings.hud.buffs.barTracker.trackedEntryIds.filter((candidate) => candidate !== entryId);

  return {
    ...settings,
    hud: {
      ...settings.hud,
      buffs: {
        iconTracker: {
          ...settings.hud.buffs.iconTracker,
          trackedEntryIds: assignment === 'icons' ? [...iconTrackedEntryIds, entryId] : iconTrackedEntryIds,
          entryOptions: {
            ...settings.hud.buffs.iconTracker.entryOptions,
            [entryId]: sharedOptions,
          },
        },
        barTracker: {
          ...settings.hud.buffs.barTracker,
          trackedEntryIds: assignment === 'bars' ? [...barTrackedEntryIds, entryId] : barTrackedEntryIds,
          entryOptions: {
            ...settings.hud.buffs.barTracker.entryOptions,
            [entryId]: sharedOptions,
          },
        },
      },
    },
  };
}

function readGroup(settings: TrainerSettings, groupKey: GroupKey): TrackerGroupSettings {
  switch (groupKey) {
    case 'cooldowns.essential':
      return settings.hud.cooldowns.essential;
    case 'cooldowns.utility':
      return settings.hud.cooldowns.utility;
    case 'buffs.iconTracker':
      return settings.hud.buffs.iconTracker;
    case 'buffs.barTracker':
      return settings.hud.buffs.barTracker;
    case 'consumables':
      return settings.hud.consumables;
  }
}

function writeGroup(settings: TrainerSettings, groupKey: GroupKey, nextGroup: TrackerGroupSettings): TrainerSettings {
  switch (groupKey) {
    case 'cooldowns.essential':
      return {
        ...settings,
        hud: {
          ...settings.hud,
          cooldowns: {
            ...settings.hud.cooldowns,
            essential: nextGroup,
          },
        },
      };
    case 'cooldowns.utility':
      return {
        ...settings,
        hud: {
          ...settings.hud,
          cooldowns: {
            ...settings.hud.cooldowns,
            utility: nextGroup,
          },
        },
      };
    case 'buffs.iconTracker':
      return {
        ...settings,
        hud: {
          ...settings.hud,
          buffs: {
            ...settings.hud.buffs,
            iconTracker: nextGroup,
          },
        },
      };
    case 'buffs.barTracker':
      return {
        ...settings,
        hud: {
          ...settings.hud,
          buffs: {
            ...settings.hud.buffs,
            barTracker: nextGroup,
          },
        },
      };
    case 'consumables':
      return {
        ...settings,
        hud: {
          ...settings.hud,
          consumables: nextGroup,
        },
      };
  }
}

function clampPopoverCoordinate(value: number, size: number, viewportSize: number): number {
  const max = Math.max(TRACKER_CONTEXT_MENU_MARGIN_PX, viewportSize - size - TRACKER_CONTEXT_MENU_MARGIN_PX);
  return Math.min(max, Math.max(TRACKER_CONTEXT_MENU_MARGIN_PX, value));
}

function clampViewportPopoverPosition(anchorX: number, anchorY: number, width: number, height: number): { left: number; top: number } {
  return {
    left: clampPopoverCoordinate(anchorX, width, window.innerWidth),
    top: clampPopoverCoordinate(anchorY, height, window.innerHeight),
  };
}

const contextMenuStyle: CSSProperties = {
  ...buildPanelStyle({ elevated: true, density: 'compact' }),
  position: 'fixed',
  width: TRACKER_CONTEXT_MENU_WIDTH_PX,
  maxHeight: 'calc(100dvh - 24px)',
  overflowY: 'auto',
  borderRadius: 16,
  padding: 14,
  background: 'linear-gradient(180deg, rgba(10, 15, 26, 0.98), rgba(5, 10, 18, 0.96))',
  border: `1px solid ${T.borderBright}`,
  display: 'grid',
  gap: 10,
  zIndex: 30,
  boxShadow: '0 22px 44px rgba(0,0,0,0.42)',
};

function setGroupEnabled(settings: TrainerSettings, groupKey: GroupKey, enabled: boolean): TrainerSettings {
  const group = readGroup(settings, groupKey);
  return writeGroup(settings, groupKey, {
    ...group,
    enabled,
  });
}

function reorderTrackedEntry(
  onChange: (settings: TrainerSettingsUpdater) => void,
  groupKey: GroupKey,
  sourceEntryId: string,
  targetEntryId: string,
): void {
  onChange((current) => {
    const group = readGroup(current, groupKey);
    return writeGroup(current, groupKey, {
      ...group,
      trackedEntryIds: moveEntryBefore(group.trackedEntryIds, sourceEntryId, targetEntryId),
    });
  });
}

function toggleTrackedEntry(
  onChange: (settings: TrainerSettingsUpdater) => void,
  groupKey: GroupKey,
  entryId: string,
): void {
  onChange((current) => {
    const group = readGroup(current, groupKey);
    const trackedEntryIds = group.trackedEntryIds.includes(entryId)
      ? group.trackedEntryIds.filter((candidate) => candidate !== entryId)
      : [...group.trackedEntryIds, entryId];

    return writeGroup(current, groupKey, {
      ...group,
      trackedEntryIds,
    });
  });
}

function updateEntryOption(
  onChange: (settings: TrainerSettingsUpdater) => void,
  groupKey: GroupKey,
  entryId: string,
  optionKey: keyof TrackerEntrySettings,
): void {
  onChange((current) => {
    const group = readGroup(current, groupKey);
    const currentOptions = group.entryOptions[entryId] ?? getDefaultEntrySettings();

    return writeGroup(current, groupKey, {
      ...group,
      entryOptions: {
        ...group.entryOptions,
        [entryId]: {
          ...currentOptions,
          [optionKey]: !currentOptions[optionKey],
        },
      },
    });
  });
}

function getCatalogForGroup(settings: TrainerSettings, groupKey: GroupKey): readonly TrackerCatalogEntry[] {
  switch (groupKey) {
    case 'cooldowns.essential':
      return getCooldownEntriesForGroup(settings, 'essential');
    case 'cooldowns.utility':
      return getCooldownEntriesForGroup(settings, 'utility');
    case 'buffs.iconTracker':
    case 'buffs.barTracker':
      return BUFF_TRACKERS;
    case 'consumables':
      return CONSUMABLE_TRACKERS;
  }
}

function getCatalogEntry(
  settings: TrainerSettings,
  groupKey: GroupKey,
  entryId: string,
): TrackerCatalogEntry | undefined {
  return getCatalogForGroup(settings, groupKey).find((candidate) => candidate.id === entryId)
    ?? [...ESSENTIAL_COOLDOWN_TRACKERS, ...UTILITY_COOLDOWN_TRACKERS, ...BUFF_TRACKERS, ...CONSUMABLE_TRACKERS]
      .find((candidate) => candidate.id === entryId);
}

function orderEntriesByTrackedIds(
  entries: readonly TrackerCatalogEntry[],
  trackedEntryIds: readonly string[],
): TrackerCatalogEntry[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const orderedTrackedEntries = trackedEntryIds.flatMap((entryId) => entryById.get(entryId) ?? []);
  const trackedEntryIdSet = new Set(trackedEntryIds);
  const remainingEntries = entries.filter((entry) => !trackedEntryIdSet.has(entry.id));
  return [...orderedTrackedEntries, ...remainingEntries];
}

function getBuffEntriesForAssignment(settings: TrainerSettings, assignment: BuffAssignment): TrackerCatalogEntry[] {
  switch (assignment) {
    case 'icons':
      return orderEntriesByTrackedIds(BUFF_TRACKERS, settings.hud.buffs.iconTracker.trackedEntryIds)
        .filter((entry) => settings.hud.buffs.iconTracker.trackedEntryIds.includes(entry.id));
    case 'bars':
      return orderEntriesByTrackedIds(BUFF_TRACKERS, settings.hud.buffs.barTracker.trackedEntryIds)
        .filter((entry) => settings.hud.buffs.barTracker.trackedEntryIds.includes(entry.id));
    case 'hidden': {
      const visibleIds = new Set([
        ...settings.hud.buffs.iconTracker.trackedEntryIds,
        ...settings.hud.buffs.barTracker.trackedEntryIds,
      ]);
      return BUFF_TRACKERS.filter((entry) => !visibleIds.has(entry.id));
    }
  }
}

function getCooldownEntriesForGroup(
  settings: TrainerSettings,
  group: CooldownAssignment,
): readonly TrackerCatalogEntry[] {
  return [...ESSENTIAL_COOLDOWN_TRACKERS, ...UTILITY_COOLDOWN_TRACKERS].filter(
    (entry) => getCooldownAssignment(settings, entry.id) === group,
  );
}

function getDefaultCooldownAssignment(entryId: string): CooldownAssignment {
  return UTILITY_COOLDOWN_TRACKERS.some((entry) => entry.id === entryId) ? 'utility' : 'essential';
}

function getCooldownAssignment(settings: TrainerSettings, entryId: string): CooldownAssignment {
  return settings.hud.cooldowns.essential.entryOptions[entryId]?.cooldownGroup
    ?? settings.hud.cooldowns.utility.entryOptions[entryId]?.cooldownGroup
    ?? getDefaultCooldownAssignment(entryId);
}

function setCooldownAssignment(
  onChange: (settings: TrainerSettingsUpdater) => void,
  entryId: string,
  assignment: CooldownAssignment,
): void {
  onChange((current) => setCooldownAssignmentForSettings(current, entryId, assignment));
}

function setCooldownAssignmentForSettings(
  settings: TrainerSettings,
  entryId: string,
  assignment: CooldownAssignment,
): TrainerSettings {
  const sharedOptions = {
    ...settings.hud.cooldowns.essential.entryOptions[entryId],
    ...settings.hud.cooldowns.utility.entryOptions[entryId],
    cooldownGroup: assignment,
  };
  const isTracked = settings.hud.cooldowns.essential.trackedEntryIds.includes(entryId)
    || settings.hud.cooldowns.utility.trackedEntryIds.includes(entryId);
  const essentialTrackedEntryIds = settings.hud.cooldowns.essential.trackedEntryIds.filter((candidate) => candidate !== entryId);
  const utilityTrackedEntryIds = settings.hud.cooldowns.utility.trackedEntryIds.filter((candidate) => candidate !== entryId);

  return {
    ...settings,
    hud: {
      ...settings.hud,
      cooldowns: {
        essential: {
          ...settings.hud.cooldowns.essential,
          trackedEntryIds: assignment === 'essential' && isTracked
            ? [...essentialTrackedEntryIds, entryId]
            : essentialTrackedEntryIds,
          entryOptions: {
            ...settings.hud.cooldowns.essential.entryOptions,
            [entryId]: sharedOptions,
          },
        },
        utility: {
          ...settings.hud.cooldowns.utility,
          trackedEntryIds: assignment === 'utility' && isTracked
            ? [...utilityTrackedEntryIds, entryId]
            : utilityTrackedEntryIds,
          entryOptions: {
            ...settings.hud.cooldowns.utility.entryOptions,
            [entryId]: sharedOptions,
          },
        },
      },
    },
  };
}

function getDefaultEntrySettings(): TrackerEntrySettings {
  return {
    glowWhenReady: false,
    disableProcGlow: false,
  };
}

function moveEntryBefore(
  entryIds: readonly string[],
  sourceEntryId: string,
  targetEntryId: string,
): string[] {
  if (sourceEntryId === targetEntryId) {
    return [...entryIds];
  }

  const filtered = entryIds.filter((entryId) => entryId !== sourceEntryId);
  const targetIndex = filtered.indexOf(targetEntryId);
  if (targetIndex === -1) {
    return [...entryIds];
  }

  return [
    ...filtered.slice(0, targetIndex),
    sourceEntryId,
    ...filtered.slice(targetIndex),
  ];
}

export default TrackerManagerPanel;
