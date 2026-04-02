import { SHAMAN_BUFF_REGISTRY } from '@core/class_modules/shaman/shaman_buff_registry';
import type {
  AnalysisDecisionState,
  AnalysisFinding,
  AplRuleExplanation,
  DowntimeContext,
  RawRunTrace,
  SpecAnalysisProfile,
} from './types';

const IMPORTANT_COOLDOWNS = [
  'doom_winds',
  'feral_spirit',
  'surging_totem',
  'ascendance',
  'sundering',
] as const;

const IMPORTANT_ABILITIES = [
  'stormstrike',
  'lava_lash',
  'crash_lightning',
  'lightning_bolt',
  'tempest',
  'primordial_storm',
  'voltaic_blaze',
] as const;

const EXACT_MISTAKE_SPELLS = [
  'stormstrike',
  'lava_lash',
  'crash_lightning',
  'lightning_bolt',
  'tempest',
  'primordial_storm',
  'voltaic_blaze',
  'sundering',
  'feral_spirit',
  'doom_winds',
  'surging_totem',
  'windstrike',
  'flame_shock',
  'chain_lightning',
  'ice_strike',
  'frost_shock',
  'fire_nova',
] as const;

function titleCaseSpellId(spellId: string): string {
  return spellId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function describeBuff(buffId: string): string {
  if (Object.prototype.hasOwnProperty.call(SHAMAN_BUFF_REGISTRY, buffId)) {
    return SHAMAN_BUFF_REGISTRY[buffId as keyof typeof SHAMAN_BUFF_REGISTRY].displayName;
  }
  return titleCaseSpellId(buffId);
}

function hasBuff(state: AnalysisDecisionState, buffId: string): boolean {
  return state.activeBuffs.some((buff) => buff.buffId === buffId && buff.stacks > 0);
}

function explainRecommendedSpell(spellId: string): AplRuleExplanation | null {
  switch (spellId) {
    case 'stormstrike':
      return {
        title: 'Spend your strike window on time',
        summary: '`Stormstrike` was your highest-priority melee spender here and drifting it usually means losing reset tempo.',
        fix: 'Hold lower-value filler when a strike window is about to come up or has just been reset.',
      };
    case 'voltaic_blaze':
      return {
        title: 'Spend Voltaic Blaze before it backs up',
        summary: '`Voltaic Blaze` is a hidden-proc window, so delaying it can desync your Flame Shock upkeep and Nature-spell flow.',
        fix: 'Use `Voltaic Blaze` promptly when it becomes the recommended button instead of pushing it behind filler.',
      };
    case 'lightning_bolt':
      return {
        title: 'Cash out Maelstrom Weapon efficiently',
        summary: '`Lightning Bolt` rose to the top because your current Maelstrom Weapon state favored spending instead of more filler.',
        fix: 'Watch Maelstrom stacks and spenders so you do not drift the next Nature cast behind weaker globals.',
      };
    case 'lava_lash':
      return {
        title: 'Use Lava Lash in its proc window',
        summary: '`Lava Lash` was the better button here, usually because of `Hot Hand`, Flame Shock maintenance, or talent-driven follow-up value.',
        fix: 'Spend `Lava Lash` on time when its proc or debuff upkeep window is active.',
      };
    default:
      return null;
  }
}

function explainExactDecision(
  expectedSpellId: string,
  _actualSpellId: string,
  playerState: AnalysisDecisionState,
): AplRuleExplanation | null {
  if (expectedSpellId === 'stormstrike' && hasBuff(playerState, 'stormsurge')) {
    return {
      title: 'Spend Stormsurge before it drifts',
      summary: `You had \`${describeBuff('stormsurge')}\`, so \`Stormstrike\`/ \`Windstrike\` was the expected follow-up instead of the button you pressed.`,
      fix: 'Use the strike reset promptly before the proc chain loses value.',
    };
  }

  return explainRecommendedSpell(expectedSpellId);
}

export function buildShamanEnhancementAnalysisProfile(_talents: ReadonlySet<string>): SpecAnalysisProfile {
  return {
    specId: 'shaman_enhancement',
    importantCooldowns: [...IMPORTANT_COOLDOWNS],
    importantAbilities: [...IMPORTANT_ABILITIES],
    exactMistakeSpellIds: [...EXACT_MISTAKE_SPELLS],
    explainRecommendedSpell,
    explainExactDecision,
    getTrackedBuffIds(): string[] {
      return ['maelstrom_weapon', 'stormsurge', 'stormblast', 'hot_hand', 'doom_winds', 'surging_totem', 'tempest', 'primordial_storm', 'voltaic_blaze', 'lightning_shield'];
    },
    getEssentialCooldownSpellIds(): string[] {
      return [...IMPORTANT_COOLDOWNS];
    },
    analyzeSetup(_player: RawRunTrace, _trainer: RawRunTrace): AnalysisFinding[] {
      return [];
    },
    shouldFlagDowntime(context: DowntimeContext): boolean {
      return context.duration >= 1 && context.topRecommendation !== null;
    },
  };
}
