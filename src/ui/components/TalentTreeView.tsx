import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
  getTalentCatalog,
  MONK_WINDWALKER_TALENT_LOADOUT,
  type TalentLoadoutDefinition,
  type TalentTreeDefinition,
  type DecodedTalentTree,
  type MonkWindwalkerTalentNodeDefinition,
} from '@core/data/talentStringDecoder';
import { FONTS, T } from '@ui/theme/elvui';
import { buildHudFrameStyle, buildPanelStyle } from '@ui/theme/stylePrimitives';
import { clampTooltipLeft } from './BuffTracker';
import { AbilityIcon } from './AbilityIcon';

export interface TalentTreeViewProps {
  definition?: TalentLoadoutDefinition;
  talents?: ReadonlySet<string>;
  talentRanks?: ReadonlyMap<string, number>;
  highlightedTalentIds?: ReadonlySet<string>;
  onChange?: (talents: ReadonlySet<string>, talentRanks: ReadonlyMap<string, number>) => void;
}

type HeroTreeId = string;

interface TreeConfig {
  title: string;
  subtitle: string;
  columns: number;
  palette: {
    selectedFill: string;
    selectedGlow: string;
    accent: string;
  };
  rowPattern: readonly number[][];
}

interface PositionedNode {
  key: string;
  definition: MonkWindwalkerTalentNodeDefinition;
  tree: DecodedTalentTree;
  row: number;
  col: number;
  name: string;
  internalId: string;
  selectedId: string | null;
  selected: boolean;
  rank: number;
  available: boolean;
  parents: readonly string[];
  detached: boolean;
}

interface Connector {
  from: PositionedNode;
  to: PositionedNode;
  active: boolean;
}

interface HoveredTalent {
  name: string;
  internalId: string;
  centerX: number;
  top: number;
}

interface TalentVisual {
  iconName?: string;
  emoji: string;
}

interface HeroSelectorOption {
  id: HeroTreeId;
  label: string;
  internalId: string;
  treeId: string;
  visual: TalentVisual;
}

const NODE_SIZE = 48;
const SELECTED_NODE_SIZE = 58;
const COL_GAP = 76;
const ROW_GAP = 74;
const PANEL_PADDING_X = 28;
const PANEL_PADDING_Y = 28;
const HERO_SELECTOR_KEY = 'hero-selector';

const TREE_PALETTES: Record<DecodedTalentTree, TreeConfig['palette']> = {
  class: {
    selectedFill: 'radial-gradient(circle at 32% 28%, rgba(126,255,202,0.95), rgba(0,180,119,0.94) 58%, rgba(6,42,28,0.96))',
    selectedGlow: 'rgba(0, 204, 122, 0.35)',
    accent: '#72f5c0',
  },
  hero: {
    selectedFill: 'radial-gradient(circle at 32% 28%, rgba(255,240,182,0.96), rgba(206,152,39,0.95) 58%, rgba(61,32,10,0.98))',
    selectedGlow: 'rgba(255, 209, 0, 0.28)',
    accent: '#ffd36d',
  },
  specialization: {
    selectedFill: 'radial-gradient(circle at 32% 28%, rgba(147,209,255,0.97), rgba(48,116,212,0.95) 58%, rgba(15,35,76,0.98))',
    selectedGlow: 'rgba(72, 136, 255, 0.28)',
    accent: '#9fd0ff',
  },
};

const TREE_DEFAULT_VISUALS: Record<DecodedTalentTree, TalentVisual> = {
  class: { iconName: 'classicon_monk', emoji: '☯️' },
  specialization: { iconName: 'monk_stance_whitetiger', emoji: '🐅' },
  hero: { iconName: 'inv_ability_shadopanmonk_flurrystrikes', emoji: '🟡' },
};


const TALENT_VISUAL_OVERRIDES: Record<string, TalentVisual> = {
  ferociousness: { iconName: 'ability_mount_whitetiger', emoji: '🐆' },
  sharp_reflexes: { iconName: 'ability_rogue_quickrecovery', emoji: '⚔️' },
  ascension: { iconName: 'ability_monk_ascension', emoji: '⬆️' },
  glory_of_the_dawn: { iconName: 'ability_monk_mightyoxkick', emoji: '🌅' },
  communion_with_wind: { iconName: 'spell_nature_cyclone', emoji: '🌬️' },
  hurricanes_vault: { iconName: 'ability_druid_galewinds', emoji: '🌀' },
  airborne_rhythm: { iconName: 'inv_tradeskillitem_sorcererswind_tong', emoji: '🌀' },
  path_of_jade: { iconName: 'spell_animaardenweald_beam', emoji: '🐉' },
  singularly_focused_jade: { iconName: 'ability_monk_fortuneturned', emoji: '🐉' },
  jadefire_stomp: { iconName: 'inv_ability_monk_jadefirestomp', emoji: '🔥' },
  momentum_boost: { iconName: 'inv_belt_leather_raidmonk_n_01', emoji: '⚡' },
  jade_ignition: { iconName: 'ability_monk_chiexplosion', emoji: '🔥' },
  obsidian_spiral: { iconName: 'ability_monk_spherediscord', emoji: '🪨' },
  drinking_horn_cover: { iconName: 'ability_warrior_unrelentingassault', emoji: '📯' },
  spiritual_focus: { iconName: 'spell_nature_giftofthewild', emoji: '🧠' },
  zenith: { iconName: 'inv_ability_monk_weaponsoforder', emoji: '✨' },
  teachings_of_the_monastery: { iconName: 'passive_monk_teachingsofmonastery', emoji: '📖' },
  dual_threat: { iconName: 'ability_monk_standingkick', emoji: '⚔️' },
  energy_burst: { iconName: 'spell_arcane_blast', emoji: '💥' },
  cyclones_drift: { iconName: 'ability_monk_cranekick_new', emoji: '🌪️' },
  crashing_fists: { iconName: 'monk_ability_fistoffury', emoji: '👊' },
  sequenced_strikes: { iconName: 'ability_monk_sparring', emoji: '🥋' },
  dance_of_chi_ji: { iconName: 'ability_monk_cranekick_new', emoji: '🕊️' },
  ring_of_peace: { iconName: 'spell_holy_circleofrenewal', emoji: '⭕' },
  improved_touch_of_death: { iconName: 'ability_monk_touchofdeath', emoji: '💀' },
  paralysis: { iconName: 'ability_monk_paralysis', emoji: '🫳' },
  grace_of_the_crane: { iconName: 'ability_monk_cranekick_new', emoji: '🕊️' },
  tigers_lust: { iconName: 'ability_monk_tigerslust', emoji: '🐯' },
  disable: { iconName: 'ability_shockwave', emoji: '🦶' },
  detox: { iconName: 'ability_rogue_imrovedrecuperate', emoji: '🧪' },
  tiger_fang: { iconName: 'ability_monk_tigerpalm', emoji: '🐯' },
  jade_walk: { iconName: 'ability_monk_flyingdragonkick', emoji: '🐲' },
  zenith_stomp: { iconName: 'inv_ability_monk_weaponsoforder', emoji: '✨' },
  yulons_grace: { iconName: 'ability_monk_dragonkick', emoji: '🐉' },
  ferocity_of_xuen: { iconName: 'ability_monk_summontigerstatue', emoji: '🐅' },
  transcendence: { iconName: 'monk_ability_transcendence', emoji: '🧘' },
  lighter_than_air: { iconName: 'spell_nature_invisibilitytotem', emoji: '☁️' },
  chi_proficiency: { iconName: 'ability_monk_chiwave', emoji: '💠' },
  flow_of_chi: { iconName: 'ability_monk_chiwave', emoji: '💠' },
  fortifying_brew: { iconName: 'ability_monk_fortifyingale_new', emoji: '🍺' },
  ironshell_brew: { iconName: 'ability_monk_fortifyingale_new', emoji: '🛡️' },
  windwalking: { iconName: 'monk_stance_whitetiger', emoji: '💨' },
  fatal_touch: { iconName: 'ability_monk_touchofdeath', emoji: '☠️' },
  martial_instincts: { iconName: 'ability_monk_palmstrike', emoji: '🥋' },
  tiger_tail_sweep: { iconName: 'ability_monk_legsweep', emoji: '🦵' },
  celerity: { iconName: 'ability_rogue_sprint', emoji: '🏃' },
  chi_torpedo: { iconName: 'ability_monk_quitornado', emoji: '💨' },
  ancient_arts: { iconName: 'trade_archaeology', emoji: '🏺' },
  fast_feet: { iconName: 'ability_rogue_sprint', emoji: '👣' },
  rising_sun_kick: { iconName: 'ability_monk_risingsunkick', emoji: '☀️' },
  echo_technique: { iconName: 'ability_monk_cranekick', emoji: '🔁' },
  revolving_whirl: { iconName: 'ability_monk_hurricanestrike', emoji: '🌀' },
  flurry_of_xuen: { iconName: 'inv_ability_shadopanmonk_flurrystrikes', emoji: '💨' },
  rising_star: { iconName: 'ability_monk_risingsunkick', emoji: '⭐' },
  weapon_of_wind: { iconName: 'inv_tradeskillitem_sorcererswind_tong', emoji: '🌬️' },
  strike_of_the_windlord: { iconName: 'inv_hand_1h_artifactskywall_d_01', emoji: '⚡' },
  whirling_dragon_punch: { iconName: 'ability_monk_hurricanestrike', emoji: '🐉' },
  martial_agility: { iconName: 'ability_monk_dpsstance', emoji: '🏃' },
  memory_of_the_monastery: { iconName: 'ability_mount_goatmountwhite', emoji: '📜' },
  inner_peace: { iconName: 'ability_monk_jasmineforcetea', emoji: '☮️' },
  meridian_strikes: { iconName: 'ability_monk_touchofdeath', emoji: '⚔️' },
  thunderfist: { iconName: 'inv_hand_1h_artifactskywall_d_01', emoji: '⚡' },
  universal_energy: { iconName: 'ability_monk_chiswirl', emoji: '🌀' },
  celestial_determination: { iconName: 'ability_monk_essencefont', emoji: '✨' },
  xuens_battlegear: { iconName: 'monk_stance_whitetiger', emoji: '🐅' },
  crane_vortex: { iconName: 'ability_monk_cranekick_new', emoji: '🕊️' },
  knowledge_of_the_broken_temple: { iconName: 'inv_glove_leather_pvpmonk_f_01', emoji: '🏯' },
  sunfire_spiral: { iconName: 'inv_helm_suncrown_d_01', emoji: '☀️' },
  combo_breaker: { iconName: 'pandarenracial_bouncy', emoji: '🔓' },
  hit_combo: { iconName: 'ability_monk_palmstrike', emoji: '🔗' },
  combat_wisdom: { iconName: 'ability_monk_expelharm', emoji: '🧠' },
  fists_of_fury: { iconName: 'monk_ability_fistoffury', emoji: '👊' },
  invoke_xuen_the_white_tiger: { iconName: 'ability_monk_summontigerstatue', emoji: '🐅' },
  path_of_the_falling_star: { iconName: 'ability_monk_chiswirl', emoji: '🌠' },
  temple_training: { iconName: 'ability_monk_provoke', emoji: '🏯' },
  xuens_guidance: { iconName: 'ability_monk_dpsstance', emoji: '🐅' },
  chijis_swiftness: { iconName: 'inv_shoulder_leather_raidmonkemerald_d_01', emoji: '🕊️' },
  niuzaos_protection: { iconName: 'ability_monk_chargingoxwave', emoji: '🐂' },
  jade_sanctuary: { iconName: 'ability_monk_jadeserpentbreath', emoji: '💚' },
  unity_within: { iconName: 'ability_monk_prideofthetiger', emoji: '☯️' },
  courage_of_the_white_tiger: { iconName: 'ability_monk_summontigerstatue', emoji: '🐅' },
  vigilant_watch: { iconName: 'ability_rogue_masterofsubtlety', emoji: '👁️' },
  whirling_steel: { iconName: 'ability_whirlwind', emoji: '⚔️' },
  predictive_training: { iconName: 'ability_monk_domeofmist', emoji: '🔮' },
  martial_precision: { iconName: 'ability_monk_jab', emoji: '🎯' },
  pride_of_pandaria: { iconName: 'inv_staff_2h_pandarenmonk_c_01', emoji: '🐼' },
  high_impact: { iconName: 'spell_fire_burnout', emoji: '💥' },
  flurry_strikes: { iconName: 'inv_ability_shadopanmonk_flurrystrikes', emoji: '💨' },
  veterans_eye: { iconName: 'ability_eyeoftheowl', emoji: '👁️' },
  one_versus_many: { iconName: 'ability_monk_chargingoxwave', emoji: '⚔️' },
  efficient_training: { iconName: 'inv_fistofthewhitetiger', emoji: '📘' },
  wisdom_of_the_wall: { iconName: 'inv_legendary_sigilofwisdom', emoji: '🧱' },
  against_all_odds: { iconName: 'achievement_boss_lichking', emoji: '🎲' },
  combat_stance: { iconName: 'ability_monk_roll', emoji: '⚔️' },
  initiators_edge: { iconName: 'ability_ironmaidens_whirlofblood', emoji: '🗡️' },
  slicing_winds: { iconName: 'ability_monk_flyingdragonkick', emoji: '💨' },
  skyfire_heel: { iconName: 'ability_monk_flyingdragonkick', emoji: '🦶' },
  harmonic_combo: { iconName: 'ability_monk_serenity', emoji: '🎼' },
  diffuse_magic: { iconName: 'spell_holy_dispelmagic', emoji: '🔵' },
  rushing_wind_kick: { iconName: 'inv12_ability_monk_rushingwindkick', emoji: '🌪️' },
  shado_over_the_battlefield: { iconName: 'inv_elemental_primal_shadow', emoji: '🌑' },
  stand_ready: { iconName: 'ability_monk_sparring', emoji: '🐯' },
  weapons_of_the_wall: { iconName: 'misc_legionfall_monk', emoji: '🗡️' },
  strength_of_spirit: { iconName: 'spell_holy_holyprotection', emoji: '🛡️' },
  vivacious_vivification: { iconName: 'ability_monk_vivify', emoji: '💚' },
  stillstep_coil: { iconName: 'ability_monk_transcendence', emoji: '🌀' },
  spear_hand_strike: { iconName: 'ability_monk_spearhand', emoji: '✋' },
  tigereye_brew: { iconName: 'inv12_apextalent_monk_tigereyebrew', emoji: '🍺' },
  strength_of_the_black_ox: { iconName: 'ability_monk_guard', emoji: '🐂' },
  yulons_avatar: { iconName: 'inv_celestialserpentmount_jade', emoji: '🐉' },
  celestial_conduit: { iconName: 'inv_ability_conduitofthecelestialsmonk_celestialconduit', emoji: '✨' },
  heart_of_the_jade_serpent: { iconName: 'ability_monk_dragonkick', emoji: '🐉' },
  inner_compass: { iconName: 'inv_10_dungeonjewelry_explorer_trinket_1compass_color2', emoji: '🧭' },
  restore_balance: { iconName: 'ability_monk_chiexplosion', emoji: '⚖️' },
  xuens_bond: { iconName: 'ability_demonhunter_netherbond', emoji: '🐅' },
};

/**
 * TalentTreeView renders an editable Monk class, hero, and Windwalker spec tree.
 * Selection rules are enforced from the rendered graph so users can only take
 * reachable talents, pick a single hero tree, and keep Tigereye Brew detached.
 */
export function TalentTreeView({
  definition = MONK_WINDWALKER_TALENT_LOADOUT,
  talents,
  talentRanks,
  highlightedTalentIds,
  onChange,
}: TalentTreeViewProps): React.ReactElement {
  const selectedTalents = useMemo(() => talents ?? new Set<string>(), [talents]);
  const selectedRanks = useMemo(() => talentRanks ?? new Map<string, number>(), [talentRanks]);
  const heroTreeOptions = getHeroTreeOptions(definition);
  const pointBudgets = getPointBudgets(definition);
  const [hover, setHover] = useState<HoveredTalent | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const [openChoiceKey, setOpenChoiceKey] = useState<string | null>(null);
  const [treeScale, setTreeScale] = useState(1);
  const lastTalentSignatureRef = useRef<string>('');
  const inferredHeroTree = deriveSelectedHeroTree(definition, selectedTalents);
  const [selectedHeroTree, setSelectedHeroTree] = useState<HeroTreeId>(inferredHeroTree);
  const talentSignature = buildTalentStateSignature(selectedTalents, selectedRanks);

  useEffect(() => {
    if (lastTalentSignatureRef.current === talentSignature) {
      return;
    }

    lastTalentSignatureRef.current = talentSignature;
    setOpenChoiceKey(null);

    if (countSelectedHeroTalents(definition, selectedTalents) > 0) {
      setSelectedHeroTree(inferredHeroTree);
    }
  }, [definition, inferredHeroTree, selectedTalents, talentSignature]);

  useLayoutEffect(() => {
    if (!hover || !tooltipRef.current) {
      setTooltipPos(null);
      return;
    }

    const tip = tooltipRef.current.getBoundingClientRect();
    const left = clampTooltipLeft(hover.centerX - tip.width / 2, tip.width, window.innerWidth);
    const top = Math.max(10, hover.top - tip.height - 10);
    setTooltipPos({ left, top });
  }, [hover]);

  const wrapper: CSSProperties = {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 1fr) minmax(260px, 320px) minmax(320px, 1fr)',
    gap: 18,
    alignItems: 'start',
    width: '100%',
  };

  const tooltipStyle: CSSProperties = {
    position: 'fixed',
    left: tooltipPos?.left ?? hover?.centerX ?? 0,
    top: tooltipPos?.top ?? (hover ? hover.top - 64 : 0),
    visibility: tooltipPos ? 'visible' : 'hidden',
    background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.99), rgba(7, 11, 20, 0.98))',
    border: `1px solid ${T.gold}`,
    borderRadius: 12,
    padding: '10px 12px',
    minWidth: 140,
    boxShadow: '0 18px 36px rgba(0,0,0,0.38)',
    whiteSpace: 'nowrap',
    zIndex: 1100,
    pointerEvents: 'none',
  };

  const tooltipNameStyle: CSSProperties = {
    color: T.textBright,
    fontFamily: FONTS.ui,
    fontSize: '0.82rem',
    fontWeight: 700,
    marginBottom: 2,
  };

  const tooltipIdStyle: CSSProperties = {
    color: T.textDim,
    fontFamily: FONTS.ui,
    fontSize: '0.7rem',
  };

  const treeLayouts = {
    class: buildTreeLayout(definition, 'class', selectedTalents, selectedRanks, selectedHeroTree),
    hero: buildTreeLayout(definition, 'hero', selectedTalents, selectedRanks, selectedHeroTree),
    specialization: buildTreeLayout(definition, 'specialization', selectedTalents, selectedRanks, selectedHeroTree),
  };

  const treeMetrics = {
    class: getTreeMetrics('class', getTreeConfig(definition, 'class', selectedHeroTree), treeLayouts.class.nodes),
    hero: getTreeMetrics('hero', getTreeConfig(definition, 'hero', selectedHeroTree), treeLayouts.hero.nodes),
    specialization: getTreeMetrics('specialization', getTreeConfig(definition, 'specialization', selectedHeroTree), treeLayouts.specialization.nodes),
  };

  const naturalWidth = treeMetrics.class.outerWidth + treeMetrics.hero.outerWidth + treeMetrics.specialization.outerWidth + 36;
  const naturalHeight = Math.max(
    treeMetrics.class.outerHeight,
    treeMetrics.hero.outerHeight + treeMetrics.hero.marginTop,
    treeMetrics.specialization.outerHeight,
  );

  useLayoutEffect(() => {
    const updateScale = (): void => {
      const availableWidth = viewportRef.current?.clientWidth ?? 0;
      if (availableWidth <= 0 || naturalWidth <= 0) {
        setTreeScale(1);
        return;
      }

      setTreeScale(Math.min(1, availableWidth / naturalWidth));
    };

    updateScale();

    if (typeof ResizeObserver !== 'undefined' && viewportRef.current) {
      const observer = new ResizeObserver(() => updateScale());
      observer.observe(viewportRef.current);
      window.addEventListener('resize', updateScale);
      return (): void => {
        observer.disconnect();
        window.removeEventListener('resize', updateScale);
      };
    }

    window.addEventListener('resize', updateScale);
    return (): void => {
      window.removeEventListener('resize', updateScale);
    };
  }, [naturalWidth]);

  const scaledViewport: CSSProperties = {
    width: '100%',
    overflow: 'hidden',
    ...buildPanelStyle({ elevated: true }),
    padding: '18px',
    borderRadius: 18,
  };

  const scaledCanvas: CSSProperties = {
    position: 'relative',
    width: naturalWidth * treeScale,
    height: naturalHeight * treeScale,
    margin: '0 auto',
  };

  const scaledWrapper: CSSProperties = {
    ...wrapper,
    width: naturalWidth,
    gridTemplateColumns: `${treeMetrics.class.outerWidth}px ${treeMetrics.hero.outerWidth}px ${treeMetrics.specialization.outerWidth}px`,
    transform: `scale(${treeScale})`,
    transformOrigin: 'top left',
  };

  return (
    <div ref={viewportRef} style={scaledViewport}>
      <div style={scaledCanvas}>
        <div style={scaledWrapper}>
      {hover && (
        <div
          ref={tooltipRef}
          data-testid={`talent-tooltip-${hover.internalId}`}
          style={tooltipStyle}
        >
          <div style={tooltipNameStyle}>{hover.name}</div>
          <div style={tooltipIdStyle}>{hover.internalId}</div>
        </div>
      )}

          {(['class', 'hero', 'specialization'] as const).map((tree) => {
            const layout = treeLayouts[tree];

            return (
              <TalentTreeColumn
                key={tree}
                tree={tree}
                config={getTreeConfig(definition, tree, selectedHeroTree)}
                nodes={layout.nodes}
                connectors={layout.connectors}
                spentPoints={countSpentPoints(layout.nodes)}
                maxPoints={pointBudgets[tree]}
                heroTree={selectedHeroTree}
                heroTreeOptions={heroTreeOptions}
                onHoverChange={setHover}
                openChoiceKey={openChoiceKey}
                onChoiceToggle={(choiceKey) => {
                  setOpenChoiceKey((current) => (current === choiceKey ? null : choiceKey));
                }}
                onHeroTreeChange={(nextHeroTree) => {
                  if (!onChange) {
                    return;
                  }

                  setSelectedHeroTree(nextHeroTree);
                  const nextState = switchHeroTree(definition, selectedTalents, selectedRanks, nextHeroTree);
                  onChange(nextState.talents, nextState.talentRanks);
                }}
                onNodePress={(node) => {
                  if (!onChange) {
                    return;
                  }

                  const nextState = cycleNodeRank(
                    definition,
                    selectedTalents,
                    selectedRanks,
                    selectedHeroTree,
                    node,
                    pointBudgets,
                  );
                  onChange(nextState.talents, nextState.talentRanks);
                }}
                onChoiceSelect={(node, internalId) => {
                  if (!onChange) {
                    return;
                  }

                  const nextState = selectChoiceNode(
                    definition,
                    selectedTalents,
                    selectedRanks,
                    selectedHeroTree,
                    node,
                    internalId,
                    pointBudgets,
                  );
                  onChange(nextState.talents, nextState.talentRanks);
                  setOpenChoiceKey(null);
                }}
                highlightedTalentIds={highlightedTalentIds}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TalentTreeColumnProps {
  tree: DecodedTalentTree;
  config: TreeConfig;
  nodes: PositionedNode[];
  connectors: Connector[];
  spentPoints: number;
  maxPoints: number;
  heroTree: HeroTreeId;
  heroTreeOptions: readonly HeroSelectorOption[];
  onHoverChange: (hover: HoveredTalent | null) => void;
  openChoiceKey: string | null;
  onChoiceToggle: (choiceKey: string) => void;
  onHeroTreeChange: (heroTree: HeroTreeId) => void;
  onNodePress: (node: PositionedNode) => void;
  onChoiceSelect: (node: PositionedNode, internalId: string) => void;
  highlightedTalentIds?: ReadonlySet<string>;
}

function TalentTreeColumn({
  tree,
  config,
  nodes,
  connectors,
  spentPoints,
  maxPoints,
  heroTree,
  heroTreeOptions,
  onHoverChange,
  openChoiceKey,
  onChoiceToggle,
  onHeroTreeChange,
  onNodePress,
  onChoiceSelect,
  highlightedTalentIds,
}: TalentTreeColumnProps): React.ReactElement {
  const rows = nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.row)) + 1;
  const width = PANEL_PADDING_X * 2 + Math.max(0, config.columns - 1) * COL_GAP + SELECTED_NODE_SIZE;
  const boardRows = tree === 'hero' ? rows + 1 : rows;
  const height = PANEL_PADDING_Y * 2 + Math.max(0, boardRows - 1) * ROW_GAP + SELECTED_NODE_SIZE;

  const shell: CSSProperties = {
    ...buildPanelStyle({ elevated: true, density: 'compact' }),
    position: 'relative',
    width,
    minHeight: height + 30,
    justifySelf: tree === 'class' ? 'end' : tree === 'specialization' ? 'start' : 'center',
    alignSelf: tree === 'hero' ? 'center' : 'start',
    marginTop: tree === 'hero' ? 28 : 0,
    padding: '18px 18px 14px',
    background: tree === 'hero'
      ? 'radial-gradient(circle at 50% 0%, rgba(255,213,95,0.12), transparent 42%), linear-gradient(180deg, rgba(28,22,12,0.96), rgba(13,10,8,0.98))'
      : 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05), transparent 42%), linear-gradient(180deg, rgba(15,15,27,0.94), rgba(8,8,16,0.96))',
    border: `1px solid ${T.borderBright}`,
    borderRadius: 14,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 48px rgba(0,0,0,0.28)',
    overflow: 'hidden',
  };

  const frameGlow: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: tree === 'hero'
      ? 'radial-gradient(circle at 50% 8%, rgba(255, 209, 0, 0.12), transparent 36%)'
      : 'radial-gradient(circle at 50% 8%, rgba(255, 255, 255, 0.06), transparent 36%)',
    pointerEvents: 'none',
  };

  const titleRow: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  };

  const titleBlock: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  };

  const title: CSSProperties = {
    margin: 0,
    color: T.textBright,
    fontFamily: FONTS.display,
    fontSize: tree === 'hero' ? '1.2rem' : '1.3rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  const subtitle: CSSProperties = {
    color: T.textDim,
    fontFamily: FONTS.ui,
    fontSize: '0.68rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  };

  const badge: CSSProperties = {
    ...buildHudFrameStyle({ compact: true }),
    border: `1px solid ${config.palette.accent}`,
    color: config.palette.accent,
    backgroundColor: 'rgba(0,0,0,0.26)',
    borderRadius: 999,
    padding: '4px 10px',
    fontFamily: FONTS.ui,
    fontSize: '0.72rem',
    minWidth: 56,
    textAlign: 'center',
  };

  const board: CSSProperties = {
    position: 'relative',
    width,
    height,
    background:
      'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.035), transparent 48%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))',
    borderRadius: 12,
    border: `1px solid ${T.borderSubtle}`,
  };

  const dynamicTitle = tree === 'hero'
    ? heroTreeOptions.find((option) => option.treeId === heroTree)?.label ?? config.title
    : config.title;

  return (
    <section style={shell} aria-label={`${dynamicTitle} talent tree`}>
      <div style={frameGlow} />
      <div style={titleRow}>
        <div style={titleBlock}>
          <h3 style={title}>{dynamicTitle}</h3>
          <span style={subtitle}>{config.subtitle}</span>
        </div>
        <span style={badge}>{`${spentPoints}/${maxPoints}`}</span>
      </div>

      <div style={board}>
        {tree === 'hero' && (
          <HeroTreeSelector
            heroTree={heroTree}
            heroTreeOptions={heroTreeOptions}
            isOpen={openChoiceKey === HERO_SELECTOR_KEY}
            onHoverChange={onHoverChange}
            onToggle={() => onChoiceToggle(HERO_SELECTOR_KEY)}
            onSelect={(nextHeroTree) => {
              onHeroTreeChange(nextHeroTree);
              onChoiceToggle(HERO_SELECTOR_KEY);
            }}
          />
        )}

        {connectors.map((connector, index) => {
          const line = connectorStyle(connector.from, connector.to, config.palette.accent, connector.active);
          return (
            <div
              key={`${connector.from.key}-${connector.to.key}-${index}`}
              data-testid={`talent-connector-${connector.from.internalId}-${connector.to.internalId}`}
              style={line}
            />
          );
        })}

        {nodes.map((node) => (
          <TalentNode
            key={node.key}
            node={node}
            config={config}
            isHighlighted={Boolean(highlightedTalentIds && node.definition.internalIds.some((internalId) => highlightedTalentIds.has(internalId)))}
            onHoverChange={onHoverChange}
            isChoiceOpen={openChoiceKey === node.key}
            onChoiceToggle={onChoiceToggle}
            onNodePress={onNodePress}
            onChoiceSelect={onChoiceSelect}
          />
        ))}
      </div>
    </section>
  );
}

function HeroTreeSelector({
  heroTree,
  heroTreeOptions,
  isOpen,
  onHoverChange,
  onToggle,
  onSelect,
}: {
  heroTree: HeroTreeId;
  heroTreeOptions: readonly HeroSelectorOption[];
  isOpen: boolean;
  onHoverChange: (hover: HoveredTalent | null) => void;
  onToggle: () => void;
  onSelect: (heroTree: HeroTreeId) => void;
}): React.ReactElement {
  const selectedOption = heroTreeOptions.find((option) => option.treeId === heroTree) ?? heroTreeOptions[0];
  const centerX = PANEL_PADDING_X + COL_GAP;
  const centerY = PANEL_PADDING_Y;
  const size = SELECTED_NODE_SIZE;

  const base: CSSProperties = {
    position: 'absolute',
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderRadius: 14,
    border: '2px solid rgba(255, 223, 129, 0.92)',
    background: 'radial-gradient(circle at 32% 28%, rgba(255,240,182,0.96), rgba(206,152,39,0.95) 58%, rgba(61,32,10,0.98))',
    boxShadow: '0 0 0 2px rgba(255, 209, 0, 0.14), 0 0 22px rgba(255, 209, 0, 0.28)',
    userSelect: 'none',
    zIndex: 3,
  };

  const innerCore: CSSProperties = {
    width: Math.round(size * 0.58),
    height: Math.round(size * 0.58),
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), rgba(255,255,255,0.08) 64%, rgba(0,0,0,0.1))',
    border: '1px solid rgba(255,255,255,0.4)',
    overflow: 'hidden',
  };

  const choiceBadge: CSSProperties = {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#14120d',
    border: `1px solid ${T.borderBright}`,
    color: T.textBright,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.58rem',
  };

  const label: CSSProperties = {
    ...buildHudFrameStyle({ compact: true }),
    position: 'absolute',
    top: size + 8,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 156,
    textAlign: 'center',
    color: T.textBright,
    fontFamily: FONTS.body,
    fontSize: '0.64rem',
    lineHeight: 1.2,
    pointerEvents: 'none',
    padding: '4px 8px',
  };

  const dropdown: CSSProperties = {
    position: 'absolute',
    top: size + 12,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 184,
    padding: '8px',
    borderRadius: 14,
    background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.99), rgba(7, 11, 20, 0.98))',
    border: `1px solid ${T.borderBright}`,
    boxShadow: '0 18px 36px rgba(0,0,0,0.42)',
    zIndex: 20,
  };

  const dropdownRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${T.borderSubtle}`,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
    color: T.textBright,
    padding: '7px 9px',
    cursor: 'pointer',
    textAlign: 'left',
  };

  const dropdownLabel: CSSProperties = {
    fontFamily: FONTS.ui,
    fontSize: '0.72rem',
    color: T.textBright,
  };

  return (
    <div
      style={base}
      data-testid="hero-tree-selector-node"
      aria-label={`${selectedOption.label} hero tree selector`}
      onClick={onToggle}
      onMouseEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onHoverChange({
          name: selectedOption.label,
          internalId: selectedOption.internalId,
          centerX: rect.left + rect.width / 2,
          top: rect.top,
        });
      }}
      onMouseLeave={() => onHoverChange(null)}
    >
      <div style={innerCore}>
        <AbilityIcon
          iconName={selectedOption.visual.iconName}
          emoji={selectedOption.visual.emoji}
          size={Math.round(size * 0.58)}
          alt={selectedOption.label}
          style={{ borderRadius: 10 }}
        />
      </div>
      <span style={choiceBadge}>+</span>
      <span style={label}>Hero Tree</span>
      {isOpen && (
        <div style={dropdown} data-testid="hero-tree-selector-dropdown" onClick={(event) => event.stopPropagation()}>
          {heroTreeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              style={dropdownRow}
              data-testid={`hero-tree-option-${option.id}`}
              onClick={() => onSelect(option.treeId)}
              onMouseEnter={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onHoverChange({
                  name: option.label,
                  internalId: option.internalId,
                  centerX: rect.left + rect.width / 2,
                  top: rect.top,
                });
              }}
              onMouseLeave={() => onHoverChange(null)}
            >
              <AbilityIcon
                iconName={option.visual.iconName}
                emoji={option.visual.emoji}
                size={26}
                alt={option.label}
                style={{ borderRadius: 6 }}
              />
              <span style={dropdownLabel}>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TalentNode({
  node,
  config,
  isHighlighted,
  onHoverChange,
  isChoiceOpen,
  onChoiceToggle,
  onNodePress,
  onChoiceSelect,
}: {
  node: PositionedNode;
  config: TreeConfig;
  isHighlighted: boolean;
  onHoverChange: (hover: HoveredTalent | null) => void;
  isChoiceOpen: boolean;
  onChoiceToggle: (choiceKey: string) => void;
  onNodePress: (node: PositionedNode) => void;
  onChoiceSelect: (node: PositionedNode, internalId: string) => void;
}): React.ReactElement {
  const size = node.selected ? SELECTED_NODE_SIZE : NODE_SIZE;
  const centerX = PANEL_PADDING_X + node.col * COL_GAP;
  const centerY = PANEL_PADDING_Y + node.row * ROW_GAP;
  const isChoiceNode = node.definition.nodeType === 2;
  const nodeShape = node.definition.visualType;
  const currentVisual = getTalentVisual(node.definition.tree, node.selectedId ?? node.internalId);
  const unavailable = !node.available && !node.selected;
  const interactionLocked = (node.definition.granted ?? false) || unavailable;

  const base: CSSProperties = {
    position: 'absolute',
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: interactionLocked ? 'not-allowed' : 'pointer',
    borderRadius: getNodeBorderRadius(nodeShape),
    border: node.selected ? '2px solid rgba(255, 223, 129, 0.92)' : `1px solid ${unavailable ? 'rgba(114,120,140,0.35)' : T.borderBright}`,
    background: node.selected
      ? config.palette.selectedFill
      : unavailable
        ? 'radial-gradient(circle at 30% 28%, rgba(58,60,72,0.22), rgba(14,16,24,0.94) 68%)'
        : 'radial-gradient(circle at 30% 28%, rgba(120,124,136,0.26), rgba(22,24,34,0.96) 68%)',
    color: node.selected ? '#0b0b10' : 'rgba(227,231,244,0.62)',
    boxShadow: node.selected
      ? `0 0 0 2px rgba(255, 209, 0, 0.14), 0 0 22px ${config.palette.selectedGlow}`
      : unavailable
        ? 'inset 0 0 16px rgba(0,0,0,0.4)'
        : 'inset 0 0 16px rgba(0,0,0,0.28)',
    fontFamily: FONTS.ui,
    fontSize: node.selected ? '0.8rem' : '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    userSelect: 'none',
    opacity: unavailable ? 0.62 : 1,
    outline: isHighlighted ? `3px solid ${config.palette.accent}` : 'none',
    outlineOffset: isHighlighted ? 3 : 0,
  };

  const innerCore: CSSProperties = {
    width: Math.round(size * 0.58),
    height: Math.round(size * 0.58),
    borderRadius: getNodeInnerBorderRadius(nodeShape),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: node.selected
      ? 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), rgba(255,255,255,0.08) 64%, rgba(0,0,0,0.1))'
      : 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 64%, rgba(0,0,0,0.1))',
    border: node.selected ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.12)',
    overflow: 'hidden',
    textShadow: isHighlighted ? `0 0 12px ${config.palette.accent}` : 'none',
  };

  const changedBadge: CSSProperties = {
    ...buildHudFrameStyle({ compact: true }),
    position: 'absolute',
    left: '50%',
    bottom: size + 24,
    transform: 'translateX(-50%)',
    minWidth: 52,
    height: 18,
    padding: '0 6px',
    borderRadius: 999,
    backgroundColor: '#14120d',
    border: `1px solid ${config.palette.accent}`,
    color: config.palette.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.55rem',
    fontFamily: FONTS.ui,
    lineHeight: 1,
    pointerEvents: 'none',
  };

  const choiceBadge: CSSProperties = {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#14120d',
    border: `1px solid ${T.borderBright}`,
    color: T.textBright,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.82rem',
    fontWeight: 800,
    lineHeight: 1,
  };

  const rankBadge: CSSProperties = {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 20,
    height: 20,
    padding: '0 4px',
    borderRadius: 999,
    backgroundColor: '#14120d',
    border: '1px solid rgba(255, 209, 0, 0.78)',
    color: '#ffd36d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.62rem',
    fontFamily: FONTS.ui,
    lineHeight: 1,
  };

  const label: CSSProperties = {
    ...buildHudFrameStyle({ compact: true }),
    position: 'absolute',
    top: size + 8,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 96,
    textAlign: 'center',
    color: node.selected ? T.textBright : T.textDim,
    fontFamily: FONTS.body,
    fontSize: '0.62rem',
    lineHeight: 1.2,
    opacity: node.selected ? 0.92 : unavailable ? 0.26 : 0.42,
    pointerEvents: 'none',
    padding: '3px 6px',
  };

  const dropdown: CSSProperties = {
    position: 'absolute',
    top: size + 12,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 158,
    padding: '8px',
    borderRadius: 14,
    background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.99), rgba(7, 11, 20, 0.98))',
    border: `1px solid ${T.borderBright}`,
    boxShadow: '0 18px 36px rgba(0,0,0,0.42)',
    zIndex: 20,
  };

  const dropdownRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${T.borderSubtle}`,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
    color: T.textBright,
    padding: '7px 9px',
    cursor: 'pointer',
    textAlign: 'left',
  };

  const dropdownLabel: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  };

  const dropdownName: CSSProperties = {
    fontFamily: FONTS.ui,
    fontSize: '0.72rem',
    color: T.textBright,
  };

  const dropdownId: CSSProperties = {
    fontFamily: FONTS.ui,
    fontSize: '0.62rem',
    color: T.textDim,
  };

  return (
    <div
      style={base}
      data-testid={`talent-node-${node.internalId}`}
      data-node-shape={nodeShape}
      aria-label={`${node.name} ${node.selected ? 'selected' : 'unselected'}`}
      aria-disabled={interactionLocked}
      data-available={node.available ? 'true' : 'false'}
      onClick={() => {
        if (interactionLocked) {
          return;
        }

        if (isChoiceNode) {
          onChoiceToggle(node.key);
          return;
        }

        onNodePress(node);
      }}
      onMouseEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onHoverChange({
          name: node.name,
          internalId: node.internalId,
          centerX: rect.left + rect.width / 2,
          top: rect.top,
        });
      }}
      onMouseLeave={() => onHoverChange(null)}
    >
      <div style={innerCore}>
        <AbilityIcon
          iconName={currentVisual.iconName}
          emoji={currentVisual.emoji}
          size={Math.round(size * 0.58)}
          alt={node.name}
          style={{ borderRadius: getNodeInnerBorderRadius(nodeShape) }}
        />
      </div>
      {isHighlighted && <span style={changedBadge}>Changed</span>}
      {isChoiceNode && <span style={choiceBadge}>+</span>}
      {node.selected && <span style={rankBadge}>{node.rank}</span>}
      <span style={label}>{node.name}</span>
      {isChoiceNode && isChoiceOpen && (
        <div style={dropdown} data-testid={`talent-choice-dropdown-${node.definition.order}`} onClick={(event) => event.stopPropagation()}>
          {node.definition.internalIds.map((optionId, index) => {
            const optionName = node.definition.names[index] ?? optionId;
            const optionVisual = getTalentVisual(node.definition.tree, optionId);
            return (
              <button
                key={optionId}
                type="button"
                style={dropdownRow}
                data-testid={`talent-choice-option-${optionId}`}
                onClick={() => onChoiceSelect(node, optionId)}
                onMouseEnter={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onHoverChange({
                    name: optionName,
                    internalId: optionId,
                    centerX: rect.left + rect.width / 2,
                    top: rect.top,
                  });
                }}
                onMouseLeave={() => onHoverChange(null)}
              >
                <AbilityIcon
                  iconName={optionVisual.iconName}
                  emoji={optionVisual.emoji}
                  size={26}
                  alt={optionName}
                  style={{ borderRadius: isChoiceNode ? '6px' : getNodeInnerBorderRadius(nodeShape) }}
                />
                <span style={dropdownLabel}>
                  <span style={dropdownName}>{optionName}</span>
                  <span style={dropdownId}>{optionId}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function buildTreeLayout(
  definition: TalentLoadoutDefinition,
  tree: DecodedTalentTree,
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
  heroTree: HeroTreeId,
): { nodes: PositionedNode[]; connectors: Connector[] } {
  const definitions = getTalentCatalog(definition).filter((node) => {
    if (node.tree !== tree) {
      return false;
    }

    if (tree !== 'hero') {
      return true;
    }

    return node.treeId === heroTree;
  });

  const positioned = positionTreeNodes(definition, definitions, tree, talents, talentRanks, heroTree);
  const parentMap = buildParentMap(positioned);
  const selectedKeys = new Set(positioned.filter((node) => node.selected).map((node) => node.key));

  const nodes = positioned.map((node) => {
    const parents = parentMap.get(node.key) ?? [];
    const available = node.detached || parents.length === 0 || parents.some((parentKey) => selectedKeys.has(parentKey));
    return {
      ...node,
      parents,
      available,
    };
  });

  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const connectors: Connector[] = [];
  for (const node of nodes) {
    for (const parentKey of node.parents) {
      const parentNode = nodeByKey.get(parentKey);
      if (!parentNode) {
        continue;
      }

      connectors.push({
        from: parentNode,
        to: node,
        active: parentNode.selected && (node.selected || node.available),
      });
    }
  }

  return { nodes, connectors };
}

function positionTreeNodes(
  definition: TalentLoadoutDefinition,
  definitions: MonkWindwalkerTalentNodeDefinition[],
  tree: DecodedTalentTree,
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
  heroTree: HeroTreeId,
): Omit<PositionedNode, 'available' | 'parents'>[] {
  const config = getTreeConfig(definition, tree, heroTree);
  const nodes: Omit<PositionedNode, 'available' | 'parents'>[] = [];
  const layoutRows = getRequiredTreeDefinition(definition, tree, heroTree).layoutRows;

  const remaining = [...definitions];
  const startingRow = tree === 'hero' ? 1 : 0;

  const explicitlyPositioned = remaining
    .filter((candidate) => candidate.layoutPosition)
    .sort((left, right) => {
      const leftPosition = left.layoutPosition;
      const rightPosition = right.layoutPosition;

      if (!leftPosition || !rightPosition) {
        return left.order - right.order;
      }

      return leftPosition.row - rightPosition.row || leftPosition.col - rightPosition.col || left.order - right.order;
    });

  for (const nodeDefinition of explicitlyPositioned) {
    const position = nodeDefinition.layoutPosition;
    if (!position) {
      continue;
    }

    const row = tree === 'hero' ? position.row : position.row - 1;
    const col = position.col - 1;
    const node = createPositionedNode(nodeDefinition, tree, row, col, talents, talentRanks);

    if (nodeDefinition.detached) {
      node.row = 0;
      node.col = config.columns - 1;
      node.detached = true;
    }

    nodes.push(node);

    const remainingIndex = remaining.findIndex((candidate) => candidate.order === nodeDefinition.order);
    if (remainingIndex >= 0) {
      remaining.splice(remainingIndex, 1);
    }
  }

  if (layoutRows && layoutRows.length > 0) {
    layoutRows.forEach((rowIds: readonly string[], rowOffset: number) => {
      const row = startingRow + rowOffset;
      const rowDefinitions = remaining.filter((candidate) => candidate.internalIds.some((internalId) => rowIds.includes(internalId)));
      const columns = getExplicitRowColumns(rowIds.length, config.columns);

      rowDefinitions
        .sort(
          (left, right) =>
            getRowOrderIndex(rowIds, left) - getRowOrderIndex(rowIds, right),
        )
        .forEach((nodeDefinition, columnIndex) => {
          const rowOrderIndex = getRowOrderIndex(rowIds, nodeDefinition);
          const col = columns[rowOrderIndex] ?? columns[columnIndex] ?? Math.floor(config.columns / 2);
          nodes.push(createPositionedNode(nodeDefinition, tree, row, col, talents, talentRanks));
          const remainingIndex = remaining.findIndex((candidate) => candidate.order === nodeDefinition.order);
          if (remainingIndex >= 0) {
            remaining.splice(remainingIndex, 1);
          }
        });
    });
  }

  if (remaining.length > 0) {
    const unresolvedNodes = remaining.map((nodeDefinition) => `${nodeDefinition.treeId}:${nodeDefinition.internalIds[0]}`).join(', ');
    throw new Error(
      `Talent tree layout is incomplete for ${tree} (${heroTree}). Missing explicit position or authored row: ${unresolvedNodes}`,
    );
  }

  return nodes;
}

function buildParentMap(nodes: Omit<PositionedNode, 'available' | 'parents'>[]): Map<string, string[]> {
  const byRow = new Map<number, Omit<PositionedNode, 'available' | 'parents'>[]>();
  const keyByInternalId = new Map<string, string>();

  for (const node of nodes) {
    for (const internalId of node.definition.internalIds) {
      keyByInternalId.set(internalId, node.key);
    }

    if (node.detached) {
      continue;
    }

    const rowNodes = byRow.get(node.row) ?? [];
    rowNodes.push(node);
    byRow.set(node.row, rowNodes);
  }

  const rows = [...byRow.keys()].sort((left, right) => left - right);
  const firstRow = rows[0] ?? 0;
  const parentMap = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.definition.parentInternalIds !== undefined) {
      parentMap.set(
        node.key,
        [...new Set(node.definition.parentInternalIds
          .map((parentInternalId) => keyByInternalId.get(parentInternalId))
          .filter((parentKey): parentKey is string => parentKey !== undefined))],
      );
      continue;
    }

    if (node.detached || node.row === firstRow) {
      parentMap.set(node.key, []);
      continue;
    }

    const previousRow = [...rows].reverse().find((row) => row < node.row);
    if (previousRow === undefined) {
      parentMap.set(node.key, []);
      continue;
    }

    const candidates = byRow.get(previousRow) ?? [];
    const rankedCandidates = candidates
      .slice()
      .sort((left, right) => Math.abs(left.col - node.col) - Math.abs(right.col - node.col));
    const nearestDistance = rankedCandidates.length > 0 ? Math.abs(rankedCandidates[0].col - node.col) : Infinity;
    const parents = rankedCandidates
      .filter((candidate, index) => index < 2 && Math.abs(candidate.col - node.col) <= Math.max(1, nearestDistance))
      .map((candidate) => candidate.key);

    parentMap.set(node.key, parents);
  }

  return parentMap;
}

function createPositionedNode(
  definition: MonkWindwalkerTalentNodeDefinition,
  tree: DecodedTalentTree,
  row: number,
  col: number,
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
): Omit<PositionedNode, 'available' | 'parents'> {
  const selectedId = definition.internalIds.find((internalId) => talents.has(internalId)) ?? null;
  const selected = selectedId !== null;
  const name = selected
    ? definition.names[definition.internalIds.indexOf(selectedId)] ?? definition.names[0]
    : definition.names[0];

  return {
    key: buildNodeKey(definition),
    definition,
    tree,
    row,
    col,
    name,
    internalId: selectedId ?? definition.internalIds[0] ?? name.toLowerCase(),
    selectedId,
    selected,
    rank: selected && selectedId ? talentRanks.get(selectedId) ?? 1 : 0,
    detached: false,
  };
}

function getExplicitRowColumns(count: number, totalColumns: number): number[] {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [Math.floor(totalColumns / 2)];
  }

  return Array.from({ length: count }, (_value, index) =>
    Math.round((index * (totalColumns - 1)) / (count - 1)),
  );
}

function getTreeMetrics(
  tree: DecodedTalentTree,
  config: TreeConfig,
  nodes: PositionedNode[],
): { outerWidth: number; outerHeight: number; marginTop: number } {
  const rows = nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.row)) + 1;
  const boardWidth = PANEL_PADDING_X * 2 + Math.max(0, config.columns - 1) * COL_GAP + SELECTED_NODE_SIZE;
  const boardRows = tree === 'hero' ? rows + 1 : rows;
  const boardHeight = PANEL_PADDING_Y * 2 + Math.max(0, boardRows - 1) * ROW_GAP + SELECTED_NODE_SIZE;

  return {
    outerWidth: boardWidth + 36,
    outerHeight: boardHeight + 62,
    marginTop: tree === 'hero' ? 28 : 0,
  };
}

function getRowOrderIndex(
  rowIds: readonly string[],
  definition: MonkWindwalkerTalentNodeDefinition,
): number {
  const indexes = definition.internalIds
    .map((internalId) => rowIds.indexOf(internalId))
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : Number.MAX_SAFE_INTEGER;
}

function cycleNodeRank(
  definition: TalentLoadoutDefinition,
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
  heroTree: HeroTreeId,
  node: PositionedNode,
  pointBudgets: Record<'class' | 'specialization' | 'hero', number>,
): { talents: Set<string>; talentRanks: Map<string, number> } {
  const spentPoints = countSpentPointsInTree(definition, node.definition.pointPool, talentRanks);
  const nextTalents = new Set(talents);
  const nextRanks = new Map(talentRanks);
  const selectedId = node.selectedId ?? node.internalId;
  const currentRank = node.rank;

  if (currentRank < node.definition.maxRank && spentPoints >= pointBudgets[node.tree]) {
    return { talents: nextTalents, talentRanks: nextRanks };
  }

  const nextRank = currentRank >= node.definition.maxRank ? 0 : currentRank + 1;

  for (const internalId of node.definition.internalIds) {
    nextTalents.delete(internalId);
    nextRanks.delete(internalId);
  }

  if (nextRank > 0) {
    nextTalents.add(selectedId);
    nextRanks.set(selectedId, nextRank);
  }

  return pruneTalentSelection(definition, nextTalents, nextRanks, heroTree, node.key);
}

function selectChoiceNode(
  definition: TalentLoadoutDefinition,
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
  heroTree: HeroTreeId,
  node: PositionedNode,
  internalId: string,
  pointBudgets: Record<'class' | 'specialization' | 'hero', number>,
): { talents: Set<string>; talentRanks: Map<string, number> } {
  const spentPoints = countSpentPointsInTree(definition, node.definition.pointPool, talentRanks);
  const nextTalents = new Set(talents);
  const nextRanks = new Map(talentRanks);
  const isUnselectingCurrent = node.selectedId === internalId;

  if (!node.selected && spentPoints >= pointBudgets[node.tree]) {
    return { talents: nextTalents, talentRanks: nextRanks };
  }

  for (const optionId of node.definition.internalIds) {
    nextTalents.delete(optionId);
    nextRanks.delete(optionId);
  }

  if (!isUnselectingCurrent) {
    nextTalents.add(internalId);
    nextRanks.set(internalId, 1);
  }

  return pruneTalentSelection(definition, nextTalents, nextRanks, heroTree, node.key);
}

function switchHeroTree(
  definition: TalentLoadoutDefinition,
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
  nextHeroTree: HeroTreeId,
): { talents: Set<string>; talentRanks: Map<string, number> } {
  const nextTalents = new Set(talents);
  const nextRanks = new Map(talentRanks);

  for (const node of getTalentCatalog(definition)) {
    if (node.tree !== 'hero') {
      continue;
    }

    for (const internalId of node.internalIds) {
      nextTalents.delete(internalId);
      nextRanks.delete(internalId);
    }
  }

  return pruneTalentSelection(definition, nextTalents, nextRanks, nextHeroTree);
}

function pruneTalentSelection(
  definition: TalentLoadoutDefinition,
  talents: Set<string>,
  talentRanks: Map<string, number>,
  heroTree: HeroTreeId,
  preservedNodeKey?: string,
): { talents: Set<string>; talentRanks: Map<string, number> } {
  for (const [internalId] of [...talentRanks.entries()]) {
    if (!talents.has(internalId)) {
      talentRanks.delete(internalId);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const tree of ['class', 'hero', 'specialization'] as const) {
      const layout = buildTreeLayout(definition, tree, talents, talentRanks, heroTree);
      for (const node of layout.nodes) {
        if (!node.selected) {
          continue;
        }

        if (node.key === preservedNodeKey) {
          continue;
        }

        if (node.detached || node.parents.length === 0 || node.available) {
          continue;
        }

        for (const internalId of node.definition.internalIds) {
          talents.delete(internalId);
          talentRanks.delete(internalId);
        }
        changed = true;
      }
    }
  }

  return { talents, talentRanks };
}

function buildNodeKey(definition: MonkWindwalkerTalentNodeDefinition): string {
  return `${definition.treeId}:${definition.order}`;
}

function connectorStyle(from: PositionedNode, to: PositionedNode, accent: string, active: boolean): CSSProperties {
  const fromX = PANEL_PADDING_X + from.col * COL_GAP;
  const fromY = PANEL_PADDING_Y + from.row * ROW_GAP;
  const toX = PANEL_PADDING_X + to.col * COL_GAP;
  const toY = PANEL_PADDING_Y + to.row * ROW_GAP;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return {
    position: 'absolute',
    left: fromX,
    top: fromY,
    width: length,
    height: active ? 3 : 2,
    transformOrigin: '0 50%',
    transform: `rotate(${angle}deg)`,
    background: active
      ? `linear-gradient(90deg, rgba(255,255,255,0.08), ${accent}, rgba(255,255,255,0.06))`
      : 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(120,124,136,0.25), rgba(255,255,255,0.02))',
    opacity: active ? 0.9 : 0.28,
    boxShadow: active ? `0 0 8px ${accent}` : 'none',
    pointerEvents: 'none',
  };
}

function deriveSelectedHeroTree(
  definition: TalentLoadoutDefinition,
  talents: ReadonlySet<string>,
): HeroTreeId {
  const heroTreeOptions = getHeroTreeOptions(definition);
  const selectedCounts = new Map(heroTreeOptions.map((option) => [option.treeId, 0]));

  for (const internalId of talents) {
    const talentNode = getTalentCatalog(definition).find((node) => node.internalIds.includes(internalId) && node.tree === 'hero');
    if (!talentNode) {
      continue;
    }

    selectedCounts.set(talentNode.treeId, (selectedCounts.get(talentNode.treeId) ?? 0) + 1);
  }

  const selectedTree = [...selectedCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return selectedTree ?? findDefaultHeroTree(definition);
}

function countSelectedHeroTalents(
  definition: TalentLoadoutDefinition,
  talents: ReadonlySet<string>,
): number {
  let count = 0;
  for (const internalId of talents) {
    const node = getTalentCatalog(definition).find((candidate) => candidate.tree === 'hero' && candidate.internalIds.includes(internalId));
    if (node) {
      count += 1;
    }
  }

  return count;
}

function getTalentVisual(tree: DecodedTalentTree, internalId: string): TalentVisual {
  return TALENT_VISUAL_OVERRIDES[internalId] ?? TREE_DEFAULT_VISUALS[tree];
}

function getNodeBorderRadius(shape: MonkWindwalkerTalentNodeDefinition['visualType']): CSSProperties['borderRadius'] {
  if (shape === 'passive') {
    return '50%';
  }

  return 14;
}

function getNodeInnerBorderRadius(shape: MonkWindwalkerTalentNodeDefinition['visualType']): CSSProperties['borderRadius'] {
  if (shape === 'passive') {
    return '50%';
  }

  return shape === 'choice' ? 10 : 8;
}

function countSpentPoints(nodes: PositionedNode[]): number {
  return nodes.reduce((total, node) => total + (node.definition.granted ? 0 : node.rank), 0);
}

function countSpentPointsInTree(
  definition: TalentLoadoutDefinition,
  pointPool: DecodedTalentTree,
  talentRanks: ReadonlyMap<string, number>,
): number {
  let total = 0;

  for (const [internalId, rank] of talentRanks.entries()) {
    if (isGrantedTalent(definition, internalId)) {
      continue;
    }

    if (getPointPoolForTalent(definition, internalId) === pointPool) {
      total += rank;
    }
  }

  return total;
}

function getTreeConfig(
  definition: TalentLoadoutDefinition,
  tree: DecodedTalentTree,
  heroTree: HeroTreeId,
): TreeConfig {
  const treeDefinition = getRequiredTreeDefinition(definition, tree, heroTree);

  return {
    title: treeDefinition.title,
    subtitle: treeDefinition.subtitle,
    columns: treeDefinition.columns,
    rowPattern: treeDefinition.rowPattern,
    palette: TREE_PALETTES[tree],
  };
}

function getHeroTreeOptions(definition: TalentLoadoutDefinition): HeroSelectorOption[] {
  return definition.heroTreeChoices.map((choice) => ({
    ...choice,
    visual: getTalentVisual('hero', choice.internalId),
  }));
}

function getPointBudgets(definition: TalentLoadoutDefinition): Record<'class' | 'specialization' | 'hero', number> {
  const classTree = getRequiredTreeDefinition(definition, 'class');
  const specializationTree = getRequiredTreeDefinition(definition, 'specialization');
  const heroTree = definition.trees.find((tree) => tree.tree === 'hero');

  if (!heroTree) {
    throw new Error(`Missing tree definition for hero`);
  }

  return {
    class: classTree.pointBudget,
    specialization: specializationTree.pointBudget,
    hero: heroTree.pointBudget,
  };
}

function findDefaultHeroTree(definition: TalentLoadoutDefinition): HeroTreeId {
  const defaultHeroTree = definition.heroTreeChoices[0]?.treeId;
  if (!defaultHeroTree) {
    throw new Error(`Missing default hero tree for ${definition.id}`);
  }

  return defaultHeroTree;
}

function getPointPoolForTalent(
  definition: TalentLoadoutDefinition,
  internalId: string,
): DecodedTalentTree | null {
  const talentDefinition = definition.nodes.find((node) => node.internalIds.includes(internalId));
  return talentDefinition?.pointPool ?? null;
}

function isGrantedTalent(
  definition: TalentLoadoutDefinition,
  internalId: string,
): boolean {
  const talentDefinition = definition.nodes.find((node) => node.internalIds.includes(internalId));
  return talentDefinition?.granted ?? false;
}

function getRequiredTreeDefinition(
  definition: TalentLoadoutDefinition,
  tree: DecodedTalentTree,
  heroTree?: HeroTreeId,
): TalentTreeDefinition {
  const treeDefinition = definition.trees.find((candidate) => {
    if (candidate.tree !== tree) {
      return false;
    }

    if (tree !== 'hero') {
      return true;
    }

    return candidate.id === heroTree;
  });

  if (!treeDefinition) {
    throw new Error(
      tree === 'hero'
        ? `Missing tree definition for ${tree}:${heroTree ?? 'unknown'}`
        : `Missing tree definition for ${tree}`,
    );
  }

  return treeDefinition;
}

function buildTalentStateSignature(
  talents: ReadonlySet<string>,
  talentRanks: ReadonlyMap<string, number>,
): string {
  const talentPart = [...talents].sort().join('|');
  const rankPart = [...talentRanks.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([internalId, rank]) => `${internalId}:${rank}`)
    .join('|');

  return `${talentPart}::${rankPart}`;
}
