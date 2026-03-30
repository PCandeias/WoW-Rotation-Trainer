import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { LoadoutPanel } from '@ui/screens/LoadoutPanel';
import { AbilityIcon } from '@ui/components/AbilityIcon';
import { HudLayoutPreview } from '@ui/components/HudLayoutPreview';
import { TrackerManagerPanel } from '@ui/components/TrackerManagerPanel';
import { TARGET_DEBUFF_SPELL_IDS, TRACKED_BUFF_SPELL_IDS } from '@ui/components/trackerSpellIds';
import { FONTS, T } from '@ui/theme/elvui';
import { buildCardStyle, buildControlStyle, buildPanelStyle } from '@ui/theme/stylePrimitives';
import { MONK_WINDWALKER_TALENT_LOADOUT } from '@core/data/talentStringDecoder';
import {
  ACTION_BAR_IDS,
  ENCOUNTER_PRESET_OPTIONS,
  type ActionBarId,
  type TrainerMode,
  type TrainerSettings,
  type TrainerSettingsUpdater,
} from '@ui/state/trainerSettings';
import { resolveEncounterDuration } from '@ui/state/trainerSettings';
import { cloneLoadout } from '@core/data/loadout';

type SetupTab = 'mode' | 'general' | 'loadout' | 'buffs' | 'consumables' | 'gear' | 'hud' | 'action-bars';
const ACTION_BAR_BUTTON_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

function formatSpellIdList(ids: readonly number[]): string {
  return ids.join(', ');
}

function formatChallengeKeyList(keys: readonly string[]): string {
  return keys.join(', ');
}

function parseChallengeKeyList(value: string): string[] {
  return [...new Set(
    value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => /^[a-z0-9]$/.test(entry)),
  )];
}

function getActionBarLabel(actionBarId: ActionBarId): string {
  return `Bar ${Number.parseInt(actionBarId.replace('bar', ''), 10)}`;
}

function getEncounterPresetLabel(encounterPreset: TrainerSettings['encounterPreset']): string {
  return ENCOUNTER_PRESET_OPTIONS.find((option) => option.value === encounterPreset)?.label ?? '1 min 30';
}

function parseSpellIdListInput(value: string, label: string, allowedSpellIds?: ReadonlySet<number>): number[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }

  return trimmed.split(',').map((segment) => {
    const token = segment.trim();
    if (!/^\d+$/.test(token)) {
      throw new Error(`Invalid ${label} entry '${token}'. Use comma-separated numeric spell IDs.`);
    }

    const spellId = Number.parseInt(token, 10);
    if (allowedSpellIds && !allowedSpellIds.has(spellId)) {
      throw new Error(`Unsupported ${label} ID '${token}'. Use one of: ${[...allowedSpellIds].join(', ')}.`);
    }

    return spellId;
  });
}

export interface SetupScreenProps {
  settings: TrainerSettings;
  onBack: () => void;
  onChange: (settings: TrainerSettingsUpdater) => void;
  onStart: () => void;
}

interface ModeCardProps {
  mode: TrainerMode;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  active: boolean;
  onSelect: (mode: TrainerMode) => void;
}

function ModeCard({ mode, title, subtitle, description, accentColor, active, onSelect }: ModeCardProps): React.ReactElement {
  const cardStyle: CSSProperties = {
    ...buildCardStyle({ active, accentColor }),
    padding: '18px 20px',
    cursor: 'pointer',
    textAlign: 'left',
  };

  return (
    <button type="button" style={cardStyle} onClick={(): void => onSelect(mode)} aria-pressed={active}>
      <div style={{ fontSize: '1.05rem', fontFamily: FONTS.display, color: accentColor, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: '0.75rem', fontFamily: FONTS.ui, color: T.textDim, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {subtitle}
      </div>
      <div style={{ fontSize: '0.82rem', fontFamily: FONTS.body, color: T.text, lineHeight: 1.5 }}>{description}</div>
    </button>
  );
}

/**
 * Trainer setup hub that sits between spec selection and the live encounter.
 */
export function SetupScreen({
  settings,
  onBack,
  onChange,
  onStart,
}: SetupScreenProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<SetupTab>('mode');
  const [modeOptionsExpanded, setModeOptionsExpanded] = useState(false);
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [layoutLaunchRequest, setLayoutLaunchRequest] = useState<{ mode: 'layout' | 'keybind'; nonce: number } | null>(null);
  const layoutLaunchNonceRef = useRef(0);
  const [buffBlacklistDraft, setBuffBlacklistDraft] = useState(() => formatSpellIdList(settings.hud.buffs.iconTracker.blacklistSpellIds));
  const [targetDebuffBlacklistDraft, setTargetDebuffBlacklistDraft] = useState(() => formatSpellIdList(settings.hud.targetDebuffs.blacklistSpellIds));
  const [hudFilterError, setHudFilterError] = useState<string | null>(null);
  const [hudFilterStatus, setHudFilterStatus] = useState<string | null>(null);
  const supportedBuffBlacklistIds = useMemo(() => new Set(Object.values(TRACKED_BUFF_SPELL_IDS)), []);
  const supportedTargetDebuffBlacklistIds = useMemo(() => new Set(Object.values(TARGET_DEBUFF_SPELL_IDS)), []);

  const encounterDuration = resolveEncounterDuration(settings);
  const enabledExternalBuffs = useMemo(
    () => Object.entries(settings.loadout.externalBuffs).filter(([, enabled]) => enabled).map(([id]) => id),
    [settings.loadout.externalBuffs],
  );
  const appliedBuffBlacklist = useMemo(
    () => formatSpellIdList(settings.hud.buffs.iconTracker.blacklistSpellIds),
    [settings.hud.buffs.iconTracker.blacklistSpellIds],
  );
  const appliedTargetDebuffBlacklist = useMemo(
    () => formatSpellIdList(settings.hud.targetDebuffs.blacklistSpellIds),
    [settings.hud.targetDebuffs.blacklistSpellIds],
  );
  const hudLayoutTrackerRows = useMemo(() => ({
    essentialCooldowns: settings.hud.cooldowns.essential.iconsPerRow ?? 12,
    utilityCooldowns: settings.hud.cooldowns.utility.iconsPerRow ?? 12,
    buffIcons: settings.hud.buffs.iconTracker.iconsPerRow ?? 12,
    consumables: settings.hud.consumables.iconsPerRow ?? 12,
  }), [settings.hud]);
  const hudLayoutVisibility = useMemo(() => ({
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
  }), [settings.actionBars.bars, settings.hud]);

  useEffect(() => {
    setBuffBlacklistDraft(appliedBuffBlacklist);
  }, [appliedBuffBlacklist]);

  useEffect(() => {
    setTargetDebuffBlacklistDraft(appliedTargetDebuffBlacklist);
  }, [appliedTargetDebuffBlacklist]);

  useEffect(() => {
    setModeOptionsExpanded(false);
  }, [settings.mode]);

  const clearHudMessages = (): void => {
    setHudFilterError(null);
    setHudFilterStatus(null);
  };

  const launchHudEditor = (mode: 'layout' | 'keybind'): void => {
    layoutLaunchNonceRef.current += 1;
    setLayoutLaunchRequest({ mode, nonce: layoutLaunchNonceRef.current });
  };

  const closeHudEditor = (): void => {
    setLayoutLaunchRequest(null);
  };

  const handleApplyHudFilters = (): void => {
    try {
      const buffBlacklistSpellIds = parseSpellIdListInput(buffBlacklistDraft, 'buff blacklist', supportedBuffBlacklistIds);
      const targetDebuffBlacklistSpellIds = parseSpellIdListInput(
        targetDebuffBlacklistDraft,
        'target debuff blacklist',
        supportedTargetDebuffBlacklistIds,
      );

      onChange((current) => ({
        ...current,
        hud: {
          ...current.hud,
          buffs: {
            ...current.hud.buffs,
            iconTracker: {
              ...current.hud.buffs.iconTracker,
              blacklistSpellIds: buffBlacklistSpellIds,
            },
            barTracker: {
              ...current.hud.buffs.barTracker,
              blacklistSpellIds: buffBlacklistSpellIds,
            },
          },
          targetDebuffs: {
            ...current.hud.targetDebuffs,
            blacklistSpellIds: targetDebuffBlacklistSpellIds,
          },
        },
      }));

      setHudFilterError(null);
      setHudFilterStatus('Tracker blacklist filters applied.');
    } catch (error) {
      setHudFilterStatus(null);
      setHudFilterError(error instanceof Error ? error.message : 'Failed to apply tracker blacklist filters.');
    }
  };

  const tabs: { id: SetupTab; label: string }[] = [
    { id: 'mode', label: 'Mode' },
    { id: 'general', label: 'General' },
    { id: 'loadout', label: 'Loadout' },
    { id: 'buffs', label: 'Buffs & Debuffs' },
    { id: 'consumables', label: 'Consumables' },
    { id: 'gear', label: 'Gear' },
    { id: 'hud', label: 'HUD' },
    { id: 'action-bars', label: 'Action Bars' },
  ];

  const root: CSSProperties = {
    height: '100dvh',
    background: `radial-gradient(circle at top, rgba(96, 122, 168, 0.16), transparent 30%), ${T.bg}`,
    color: T.text,
    fontFamily: FONTS.body,
    padding: '24px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
  };

  const shell: CSSProperties = {
    flex: 1,
    maxWidth: 1380,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '260px minmax(0, 1fr)',
    gap: 24,
    width: '100%',
    minHeight: 0,
    overflow: 'hidden',
  };

  const sidebar: CSSProperties = {
    ...buildPanelStyle({ elevated: true, density: 'compact' }),
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 0,
    height: '100%',
    boxSizing: 'border-box',
    overflowY: 'auto',
  };

  const panel: CSSProperties = {
    ...buildPanelStyle({ elevated: true }),
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    minHeight: 0,
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  };

  const panelContent: CSSProperties = {
    flex: 1,
    display: 'grid',
    gap: 18,
    minHeight: 0,
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingRight: 4,
  };

  const headerRow: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderBottom: `1px solid ${T.borderSubtle}`,
    paddingBottom: 20,
  };

  const summaryGrid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  };

  const summaryCard: CSSProperties = {
    ...buildPanelStyle({ density: 'compact' }),
    borderRadius: 16,
    padding: '12px 14px',
    background: 'linear-gradient(180deg, rgba(16, 24, 40, 0.92), rgba(9, 14, 25, 0.9))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  };

  const buttonStyle: CSSProperties = buildControlStyle();

  if (layoutLaunchRequest) {
    return (
      <div style={root}>
        <HudLayoutPreview
          layout={settings.hud.layout}
          actionBars={settings.actionBars}
          trackerRows={hudLayoutTrackerRows}
          visibility={hudLayoutVisibility}
          cooldownTracking={settings.hud.cooldowns}
          buffTracking={{
            iconTracker: settings.hud.buffs.iconTracker,
            barTracker: settings.hud.buffs.barTracker,
            targetDebuffs: settings.hud.targetDebuffs,
          }}
          consumableTracking={settings.hud.consumables}
          onChange={onChange}
          showLauncher={false}
          launchRequest={layoutLaunchRequest}
          onEditorClose={closeHudEditor}
        />
      </div>
    );
  }

  const renderTabContent = (): React.ReactNode => {
    switch (activeTab) {
      case 'mode':
        return (
          <>
            <div style={summaryGrid}>
              <ModeCard
                mode="tutorial"
                title="Tutorial"
                subtitle="Learn the rotation"
                description="Step-by-step guidance with a slower paced environment."
                accentColor={T.accent}
                active={settings.mode === 'tutorial'}
                onSelect={(mode): void => onChange((current) => ({ ...current, mode }))}
              />
              <ModeCard
                mode="practice"
                title="Practice"
                subtitle="Guided play"
                description="Hints enabled with the current practice pacing."
                accentColor={T.classMonk}
                active={settings.mode === 'practice'}
                onSelect={(mode): void => onChange((current) => ({ ...current, mode }))}
              />
              <ModeCard
                mode="test"
                title="Test"
                subtitle="No hints"
                description="Live speed, no hand-holding, and a graded finish."
                accentColor={T.gold}
                active={settings.mode === 'test'}
                onSelect={(mode): void => onChange((current) => ({ ...current, mode }))}
              />
              <ModeCard
                mode="challenge"
                title="Challenge"
                subtitle="Test plus rhythm"
                description="Keep the test-mode combat score while surviving layered rhythm mechanics."
                accentColor={T.red}
                active={settings.mode === 'challenge'}
                onSelect={(mode): void => onChange((current) => ({ ...current, mode }))}
              />
            </div>
            <section
              style={{
                display: 'grid',
                gap: 14,
                border: `1px solid ${T.border}`,
                borderRadius: 14,
                padding: '14px 16px',
                backgroundColor: 'rgba(255,255,255,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ color: T.textBright, fontFamily: FONTS.ui, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Mode Options
                  </div>
                  <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.78rem', maxWidth: 720 }}>
                    Keep the main setup tidy. Expand this section when you want to tune encounter pacing or the extra challenge controls.
                  </div>
                </div>
                <button
                  type="button"
                  aria-expanded={modeOptionsExpanded}
                  aria-controls="mode-advanced-options"
                  style={{
                    ...buttonStyle,
                    borderColor: modeOptionsExpanded ? T.accent : T.borderBright,
                    color: modeOptionsExpanded ? T.accent : T.textBright,
                  }}
                  onClick={(): void => setModeOptionsExpanded((current) => !current)}
                >
                  {modeOptionsExpanded ? 'Hide advanced mode options' : 'Show advanced mode options'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ ...summaryCard, padding: '8px 12px' }}>
                  Encounter: {getEncounterPresetLabel(settings.encounterPreset)}
                </div>
                {settings.mode === 'practice' && (
                  <div style={{ ...summaryCard, padding: '8px 12px' }}>
                    Practice Speed x{settings.practiceSpeedMultiplier}
                  </div>
                )}
                {settings.mode === 'challenge' && (
                  <div style={{ ...summaryCard, padding: '8px 12px' }}>
                    Element Speed x{settings.challenge.disappearSpeedMultiplier}
                  </div>
                )}
              </div>

              {settings.mode === 'challenge' && (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.78rem' }}>
                    Challenge difficulty keeps the same damage-based score as Test, but adds survival mechanics. Missed notes deal damage and the run fails at 0 health.
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={{
                        ...buttonStyle,
                        borderColor: settings.challenge.difficulty === 'easy' ? T.accent : T.borderBright,
                        color: settings.challenge.difficulty === 'easy' ? T.accent : T.textBright,
                      }}
                      onClick={(): void => onChange((current) => ({
                        ...current,
                        challenge: {
                          ...current.challenge,
                          difficulty: 'easy',
                        },
                      }))}
                    >
                      Easy - Click circles before they explode
                    </button>
                    <button
                      type="button"
                      style={{
                        ...buttonStyle,
                        borderColor: settings.challenge.difficulty === 'hard' ? T.red : T.borderBright,
                        color: settings.challenge.difficulty === 'hard' ? T.red : T.textBright,
                      }}
                      onClick={(): void => onChange((current) => ({
                        ...current,
                        challenge: {
                          ...current.challenge,
                          difficulty: 'hard',
                        },
                      }))}
                    >
                      Hard - Chains, sliders, holds, repeats, and hover keys
                    </button>
                  </div>
                </div>
              )}

              {modeOptionsExpanded && (
                <div id="mode-advanced-options" style={{ display: 'grid', gap: 14 }}>
                  {settings.mode === 'practice' && (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.78rem' }}>
                        Practice mode can slow the simulation down while keeping the same encounter rules and hints.
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {[0.25, 0.5, 0.75, 1].map((multiplier) => (
                          <button
                            key={multiplier}
                            type="button"
                            style={{
                              ...buttonStyle,
                              borderColor: settings.practiceSpeedMultiplier === multiplier ? T.classMonk : T.borderBright,
                              color: settings.practiceSpeedMultiplier === multiplier ? T.classMonk : T.textBright,
                            }}
                            onClick={(): void => onChange((current) => ({ ...current, practiceSpeedMultiplier: multiplier as 0.25 | 0.5 | 0.75 | 1 }))}
                          >
                            Practice Speed x{multiplier}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {settings.mode === 'challenge' && (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <label style={{ display: 'grid', gap: 6, maxWidth: 380 }}>
                        <span style={{ color: T.textBright, fontFamily: FONTS.ui, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Valid challenge keys
                        </span>
                        <input
                          aria-label="Challenge valid keys"
                          value={formatChallengeKeyList(settings.challenge.validKeys)}
                          onChange={(event): void => {
                            const nextKeys = parseChallengeKeyList(event.target.value);
                            onChange((current) => ({
                              ...current,
                              challenge: {
                                ...current.challenge,
                                validKeys: nextKeys.length > 0 ? nextKeys : current.challenge.validKeys,
                              },
                            }));
                          }}
                          style={{
                            border: `1px solid ${T.borderBright}`,
                            borderRadius: 10,
                            padding: '8px 10px',
                            backgroundColor: T.bgPanel,
                            color: T.textBright,
                            fontFamily: FONTS.ui,
                          }}
                        />
                        <span style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem' }}>
                          Use comma-separated single keys. Challenge prompts only use this pool. Default: `w, a, s, d`.
                        </span>
                      </label>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <span style={{ color: T.textBright, fontFamily: FONTS.ui, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Element disappear speed
                        </span>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {[0.5, 1, 2, 3].map((multiplier) => (
                            <button
                              key={multiplier}
                              type="button"
                              style={{
                                ...buttonStyle,
                                borderColor: settings.challenge.disappearSpeedMultiplier === multiplier ? T.red : T.borderBright,
                                color: settings.challenge.disappearSpeedMultiplier === multiplier ? T.red : T.textBright,
                              }}
                              onClick={(): void => onChange((current) => ({
                                ...current,
                                challenge: {
                                  ...current.challenge,
                                  disappearSpeedMultiplier: multiplier as 0.5 | 1 | 2 | 3,
                                },
                              }))}
                            >
                              {multiplier}x
                            </button>
                          ))}
                        </div>
                        <span style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem' }}>
                          This only changes how long Challenge notes stay on screen. Combat simulation remains at x1 speed.
                        </span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: T.textBright, fontFamily: FONTS.ui, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Encounter length
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {ENCOUNTER_PRESET_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          style={{
                            ...buttonStyle,
                            borderColor: settings.encounterPreset === option.value ? T.accent : T.borderBright,
                            color: settings.encounterPreset === option.value ? T.accent : T.textBright,
                          }}
                          onClick={(): void => onChange((current) => ({ ...current, encounterPreset: option.value }))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        );
      case 'loadout':
        return (
          <>
            <p style={{ color: T.textDim, margin: 0 }}>
              Open the current loadout to edit talents and shared buffs. Action bar shortcuts now live entirely in the Action Bars and HUD layout editors.
            </p>
            <div style={summaryGrid}>
              <div style={summaryCard}>
                <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>Talents</div>
                <div style={{ color: T.textBright, marginTop: 8 }}>{settings.talents.length} selected nodes</div>
              </div>
              <div style={summaryCard}>
                <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>Loadout</div>
                <div style={{ color: T.textBright, marginTop: 8 }}>{settings.loadout.gear.length} equipped items parsed</div>
              </div>
            </div>
            <button type="button" style={buttonStyle} onClick={(): void => setLoadoutOpen(true)}>
              Open Loadout Editor
            </button>
          </>
        );
      case 'general':
        return (
          <>
            <p style={{ color: T.textDim, margin: 0 }}>
              These options control shared presentation elements for the live encounter HUD. You can also move the enemy icon in the HUD layout editor.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={buttonStyle}
                onClick={(): void => launchHudEditor('layout')}
              >
                Edit HUD Layout
              </button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <section style={summaryCard}>
                <div style={{ color: T.textBright, fontFamily: FONTS.ui, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Enemy dummy
                </div>
                <label style={{ color: T.text, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={settings.hud.general.showEnemyIcon}
                    onChange={(event): void => onChange((current) => ({
                      ...current,
                      hud: {
                        ...current.hud,
                        general: {
                          ...current.hud.general,
                          showEnemyIcon: event.target.checked,
                        },
                      },
                    }))}
                  />
                  Show enemy icon
                </label>
                <div style={{ color: T.textDim, fontSize: '0.78rem', marginTop: 8 }}>
                  Controls the doll emoji target marker in the middle of the encounter area.
                </div>
              </section>
              <section style={summaryCard}>
                <div style={{ color: T.textBright, fontFamily: FONTS.ui, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Damage text
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ color: T.text, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={settings.hud.general.showDamageText}
                      onChange={(event): void => onChange((current) => ({
                        ...current,
                        hud: {
                          ...current.hud,
                          general: {
                            ...current.hud.general,
                            showDamageText: event.target.checked,
                          },
                        },
                      }))}
                    />
                    Show damage text
                  </label>
                  <label style={{ color: settings.hud.general.showDamageText ? T.text : T.textDim, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={settings.hud.general.showMeleeSwingDamage}
                      disabled={!settings.hud.general.showDamageText}
                      onChange={(event): void => onChange((current) => ({
                        ...current,
                        hud: {
                          ...current.hud,
                          general: {
                            ...current.hud.general,
                            showMeleeSwingDamage: event.target.checked,
                          },
                        },
                      }))}
                    />
                    Show melee swing damage
                  </label>
                </div>
              </section>
            </div>
            <HudLayoutPreview
              layout={settings.hud.layout}
              actionBars={settings.actionBars}
              trackerRows={hudLayoutTrackerRows}
              visibility={hudLayoutVisibility}
              cooldownTracking={settings.hud.cooldowns}
              buffTracking={{
                iconTracker: settings.hud.buffs.iconTracker,
                barTracker: settings.hud.buffs.barTracker,
                targetDebuffs: settings.hud.targetDebuffs,
              }}
              consumableTracking={settings.hud.consumables}
              onChange={onChange}
              showLauncher={false}
              launchRequest={layoutLaunchRequest}
            />
          </>
        );
      case 'buffs':
        return (
          <>
            <p style={{ color: T.textDim, margin: 0 }}>
              Shared raid buffs and target debuffs default to the shipped SimC profile. Use the loadout editor to toggle the currently modeled effects.
            </p>
            <div style={summaryGrid}>
              {enabledExternalBuffs.map((buffId) => (
                <div key={buffId} style={summaryCard}>{buffId}</div>
              ))}
            </div>
            <button type="button" style={buttonStyle} onClick={(): void => setLoadoutOpen(true)}>
              Edit Buffs & Debuffs
            </button>
          </>
        );
      case 'consumables':
        return (
          <>
            <div style={summaryGrid}>
              <div style={summaryCard}>Potion: {settings.loadout.consumables.potion ?? 'None'}</div>
              <div style={summaryCard}>Flask: {settings.loadout.consumables.flask ?? 'None'}</div>
              <div style={summaryCard}>Food: {settings.loadout.consumables.food ?? 'None'}</div>
              <div style={summaryCard}>Augmentation: {settings.loadout.consumables.augmentation ?? 'None'}</div>
            </div>
            <button type="button" style={buttonStyle} onClick={(): void => setLoadoutOpen(true)}>
              Edit Consumables
            </button>
          </>
        );
      case 'gear':
        return (
          <>
            <p style={{ color: T.textDim, margin: 0 }}>
              The current setup is parsed from the shipped profile. The next implementation slice will expose direct per-slot editing here.
            </p>
            <div style={summaryGrid}>
              {settings.loadout.gear.slice(0, 8).map((item) => (
                <div key={item.slot} style={summaryCard}>{item.slot}: {item.itemName}</div>
              ))}
            </div>
            <button type="button" style={buttonStyle} onClick={(): void => setLoadoutOpen(true)}>
              Review Current Gear
            </button>
          </>
        );
      case 'hud':
        return (
          <>
            <TrackerManagerPanel
              settings={settings}
              onChange={onChange}
              buffBlacklistDraft={buffBlacklistDraft}
              targetDebuffBlacklistDraft={targetDebuffBlacklistDraft}
              hudFilterError={hudFilterError}
              hudFilterStatus={hudFilterStatus}
              supportedBuffBlacklistIds={supportedBuffBlacklistIds}
              supportedTargetDebuffBlacklistIds={supportedTargetDebuffBlacklistIds}
              onBuffBlacklistDraftChange={(value): void => {
                setBuffBlacklistDraft(value);
                clearHudMessages();
              }}
              onTargetDebuffBlacklistDraftChange={(value): void => {
                setTargetDebuffBlacklistDraft(value);
                clearHudMessages();
              }}
              onApplyFilters={handleApplyHudFilters}
              onClearMessages={clearHudMessages}
              onOpenHudLayoutEditor={launchHudEditor}
            />
          </>
        );
      case 'action-bars':
        return (
          <>
            <p style={{ color: T.textDim, margin: 0 }}>
              Configure each action bar separately. Enabled bars render as their own movable HUD groups, and the HUD edit mode exposes the same settings on right-click.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={buttonStyle}
                onClick={(): void => launchHudEditor('layout')}
              >
                Edit Layout
              </button>
              <button
                type="button"
                style={buttonStyle}
                onClick={(): void => launchHudEditor('keybind')}
              >
                Keybind Mode
              </button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {ACTION_BAR_IDS.map((actionBarId) => {
                const config = settings.actionBars.bars[actionBarId];
                return (
                  <section key={actionBarId} style={summaryCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                          {getActionBarLabel(actionBarId)}
                        </div>
                        <div style={{ color: T.textBright, marginTop: 8 }}>
                          {config.enabled ? `${config.buttonCount} buttons / ${config.buttonsPerRow} per row` : 'Disabled'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.76rem' }}>
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(event): void => onChange((current) => ({
                              ...current,
                              actionBars: {
                                ...current.actionBars,
                                bars: {
                                  ...current.actionBars.bars,
                                  [actionBarId]: {
                                    ...current.actionBars.bars[actionBarId],
                                    enabled: event.target.checked,
                                  },
                                },
                              },
                            }))}
                          />{' '}
                          Enabled
                        </label>
                        <label style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.76rem' }}>
                          Buttons{' '}
                          <select
                            aria-label={`${getActionBarLabel(actionBarId)} button count`}
                            value={config.buttonCount}
                            onChange={(event): void => onChange((current) => ({
                              ...current,
                              actionBars: {
                                ...current.actionBars,
                                bars: {
                                  ...current.actionBars.bars,
                                  [actionBarId]: {
                                    ...current.actionBars.bars[actionBarId],
                                    buttonCount: Number.parseInt(event.target.value, 10),
                                  },
                                },
                              },
                            }))}
                          >
                            {ACTION_BAR_BUTTON_OPTIONS.map((count) => (
                              <option key={`count-${actionBarId}-${count}`} value={count}>{count}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.76rem' }}>
                          Per row{' '}
                          <select
                            aria-label={`${getActionBarLabel(actionBarId)} buttons per row`}
                            value={config.buttonsPerRow}
                            onChange={(event): void => onChange((current) => ({
                              ...current,
                              actionBars: {
                                ...current.actionBars,
                                bars: {
                                  ...current.actionBars.bars,
                                  [actionBarId]: {
                                    ...current.actionBars.bars[actionBarId],
                                    buttonsPerRow: Number.parseInt(event.target.value, 10),
                                  },
                                },
                              },
                            }))}
                          >
                            {ACTION_BAR_BUTTON_OPTIONS.map((count) => (
                              <option key={`per-row-${actionBarId}-${count}`} value={count}>{count}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            <HudLayoutPreview
              layout={settings.hud.layout}
              actionBars={settings.actionBars}
              trackerRows={hudLayoutTrackerRows}
              visibility={hudLayoutVisibility}
              cooldownTracking={settings.hud.cooldowns}
              buffTracking={{
                iconTracker: settings.hud.buffs.iconTracker,
                barTracker: settings.hud.buffs.barTracker,
                targetDebuffs: settings.hud.targetDebuffs,
              }}
              consumableTracking={settings.hud.consumables}
              onChange={onChange}
              showLauncher={false}
              launchRequest={layoutLaunchRequest}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={root}>
      <div style={shell}>
        <aside style={sidebar}>
          <button type="button" style={{ ...buildControlStyle({ tone: 'ghost' }), marginBottom: 8 }} onClick={onBack}>
            ← Back to Specs
          </button>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              style={{
                ...buttonStyle,
                textAlign: 'left',
                borderColor: activeTab === tab.id ? T.accent : T.borderSubtle,
                color: activeTab === tab.id ? T.textBright : T.text,
                background: activeTab === tab.id ? `linear-gradient(180deg, ${T.accentSoft}, rgba(14, 22, 36, 0.96))` : buttonStyle.background,
              }}
              onClick={(): void => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <main style={panel}>
          <div style={headerRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${T.classMonk}`, boxShadow: `0 16px 30px ${T.glow}` }}>
                <AbilityIcon iconName="spell_monk_windwalker_spec" emoji="🐉" size={64} alt="Windwalker" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontFamily: FONTS.display, color: T.textBright, fontSize: '2.1rem' }}>Windwalker Setup</h1>
                <div style={{ color: T.textDim, fontFamily: FONTS.body, fontSize: '0.96rem' }}>
                  Configure your encounter, HUD, and loadout before the pull.
                </div>
              </div>
            </div>
            <button
              type="button"
              style={buildControlStyle({ tone: 'primary' })}
              onClick={onStart}
            >
              Start Encounter
            </button>
          </div>

          <div data-testid="setup-panel-content" style={panelContent}>
            <div style={summaryGrid}>
              <div style={summaryCard}>
                <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>Mode</div>
                <div style={{ color: T.textBright, marginTop: 8 }}>{settings.mode}</div>
              </div>
              <div style={summaryCard}>
                <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>Fight Type</div>
                <div style={{ color: T.textBright, marginTop: 8 }}>{getEncounterPresetLabel(settings.encounterPreset)}</div>
              </div>
              <div style={summaryCard}>
                <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>Duration</div>
                <div style={{ color: T.textBright, marginTop: 8 }}>{encounterDuration}s</div>
              </div>
              <div style={summaryCard}>
                <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>Raid Effects</div>
                <div style={{ color: T.textBright, marginTop: 8 }}>{enabledExternalBuffs.length} enabled</div>
              </div>
              {settings.mode === 'practice' && (
                <div style={summaryCard}>
                  <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>Practice Speed</div>
                  <div style={{ color: T.textBright, marginTop: 8 }}>x{settings.practiceSpeedMultiplier}</div>
                </div>
              )}
              {settings.mode === 'challenge' && (
                <div style={summaryCard}>
                  <div style={{ color: T.textDim, fontFamily: FONTS.ui, fontSize: '0.72rem', textTransform: 'uppercase' }}>Element Speed</div>
                  <div style={{ color: T.textBright, marginTop: 8 }}>x{settings.challenge.disappearSpeedMultiplier}</div>
                </div>
              )}
            </div>

            {renderTabContent()}
          </div>
        </main>
      </div>

      {loadoutOpen && (
        <LoadoutPanel
          definition={MONK_WINDWALKER_TALENT_LOADOUT}
          talents={new Set(settings.talents)}
          talentRanks={new Map(Object.entries(settings.talentRanks))}
          loadout={settings.loadout}
          onTalentChange={(talents, talentRanks): void => {
            onChange((current) => ({
              ...current,
              talents: [...talents].sort(),
              talentRanks: Object.fromEntries([...talentRanks.entries()].sort(([left], [right]) => left.localeCompare(right))),
            }));
          }}
          onLoadoutChange={(loadout): void => onChange((current) => ({ ...current, loadout: cloneLoadout(loadout) }))}
          onClose={(): void => setLoadoutOpen(false)}
        />
      )}
    </div>
  );
}
