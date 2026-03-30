import { MONK_WW_SPELLS } from '@core/data/spells/monk_windwalker';
import { MONK_BUFF_REGISTRY } from '@core/class_modules/monk/monk_buff_registry';
import type {
  AnalysisDecisionState,
  AnalysisFinding,
  AplRuleExplanation,
  DowntimeContext,
  RawRunTrace,
  SpecAnalysisProfile,
} from './types';

const IMPORTANT_COOLDOWNS = [
  'invoke_xuen_the_white_tiger',
  'celestial_conduit',
  'strike_of_the_windlord',
  'fists_of_fury',
  'zenith',
] as const;

const IMPORTANT_ABILITIES = [
  'rising_sun_kick',
  'whirling_dragon_punch',
] as const;

const EXACT_MISTAKE_BASE_SPELLS = [
  'tiger_palm',
  'blackout_kick',
  'spinning_crane_kick',
  'rising_sun_kick',
  'fists_of_fury',
  'strike_of_the_windlord',
  'whirling_dragon_punch',
] as const;

const EXACT_MISTAKE_OPTIONAL_SPELLS = [
  'invoke_xuen_the_white_tiger',
  'celestial_conduit',
  'zenith',
] as const;

const EXACT_MISTAKE_BASE_BUFFS = [
  'hit_combo',
  'blackout_reinforcement',
  'dance_of_chi_ji',
  'combo_strikes',
  'whirling_dragon_punch',
] as const;

const EXACT_MISTAKE_OPTIONAL_BUFFS: readonly { talentId: string; buffIds: readonly string[] }[] = [
  { talentId: 'zenith', buffIds: ['zenith'] },
  { talentId: 'celestial_conduit', buffIds: ['celestial_conduit_active'] },
  {
    talentId: 'heart_of_the_jade_serpent',
    buffIds: ['heart_of_the_jade_serpent', 'heart_of_the_jade_serpent_unity_within', 'heart_of_the_jade_serpent_yulons_avatar'],
  },
];

function isSpellAvailable(spellId: string, talents: ReadonlySet<string>): boolean {
  const requiredTalent = MONK_WW_SPELLS.get(spellId)?.talentRequired;
  return !requiredTalent || talents.has(requiredTalent);
}

function averageSpellDamage(trace: RawRunTrace, spellId: string): number {
  const spellStats = trace.damageBySpell[spellId];
  if (!spellStats || spellStats.casts <= 0) {
    return 0;
  }

  return spellStats.damage / spellStats.casts;
}

function recentCastWithin(trace: RawRunTrace, spellId: string, time: number, windowSeconds: number): boolean {
  return trace.casts.some((entry) => entry.spellId === spellId && time - entry.time >= 0 && time - entry.time <= windowSeconds);
}

function explainRecommendedSpell(spellId: string): AplRuleExplanation | null {
  switch (spellId) {
    case 'fists_of_fury':
      return {
        title: 'Keep Fists of Fury moving',
        summary: 'Use `Fists of Fury` promptly when it is your highest-priority button instead of drifting into lower-value filler.',
        fix: 'Plan Chi so `Fists of Fury` can be pressed on time, especially before spending on filler GCDs.',
      };
    case 'rising_sun_kick':
      return {
        title: 'Prioritize Rising Sun Kick over filler',
        summary: 'When `Rising Sun Kick` is the top recommendation, spending the GCD elsewhere usually gives up efficient damage.',
        fix: 'Keep enough Chi available to press `Rising Sun Kick` as soon as it becomes the best button.',
      };
    case 'strike_of_the_windlord':
      return {
        title: 'Do not sit on Strike of the Windlord',
        summary: '`Strike of the Windlord` is a high-value button and should not drift behind lower-priority casts.',
        fix: 'Watch for overlaps so `Strike of the Windlord` is ready to go without being blocked by filler.',
      };
    case 'whirling_dragon_punch':
      return {
        title: 'Respect Whirling Dragon Punch windows',
        summary: 'When `Whirling Dragon Punch` becomes your top priority, delaying it usually costs burst tempo.',
        fix: 'Avoid filling too early when `Whirling Dragon Punch` is about to become available.',
      };
    case 'spinning_crane_kick':
      return {
        title: 'Spend your Dance of Chi-Ji proc on time',
        summary: '`Spinning Crane Kick` jumps in priority when `Dance of Chi-Ji` is active, especially if the proc is close to expiring or overstacking.',
        fix: 'Spend `Dance of Chi-Ji` before it expires or reaches an awkward overlap with other proc windows.',
      };
    case 'blackout_kick':
      return {
        title: 'Use Blackout Kick! before it backs up',
        summary: '`Blackout Kick` rises in value when `Blackout Kick!` is active because the proc is free and helps keep cooldown reduction flowing.',
        fix: 'Spend `Blackout Kick!` before it overcaps, especially inside your faster burst windows.',
      };
    case 'tiger_palm':
      return {
        title: 'Build resources before the next spender window',
        summary: '`Tiger Palm` is sometimes the correct setup button when Energy is high or you need Chi for a stronger spender immediately after.',
        fix: 'Use `Tiger Palm` proactively before you cap Energy or starve an upcoming priority spender.',
      };
    case 'celestial_conduit':
      return {
        title: 'Keep Celestial Conduit aligned',
        summary: '`Celestial Conduit` is a major burst tool and should not be pushed behind low-impact globals.',
        fix: 'Set up for `Celestial Conduit` in advance so you can channel it when its window arrives.',
      };
    case 'invoke_xuen_the_white_tiger':
      return {
        title: 'Prepare for your Xuen window',
        summary: '`Invoke Xuen, the White Tiger` is part of a strong burst sequence and should not be left unused.',
        fix: 'Be ready to summon Xuen before your next `Celestial Conduit` or major burst sequence.',
      };
    default:
      return null;
  }
}

function buffStacks(state: AnalysisDecisionState, buffId: string): number {
  return state.activeBuffs.find((buff) => buff.buffId === buffId)?.stacks ?? 0;
}

function hasBuff(state: AnalysisDecisionState, buffId: string): boolean {
  return buffStacks(state, buffId) > 0;
}

function describeBuff(buffId: string): string {
  return MONK_BUFF_REGISTRY[buffId]?.displayName ?? buffId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function explainExactDecision(
  expectedSpellId: string,
  _actualSpellId: string,
  playerState: AnalysisDecisionState,
): AplRuleExplanation | null {
  switch (expectedSpellId) {
    case 'spinning_crane_kick': {
      const danceStacks = buffStacks(playerState, 'dance_of_chi_ji');
      const zenithActive = hasBuff(playerState, 'zenith');
      return {
        title: danceStacks >= 2 ? 'Do not overcap Dance of Chi-Ji' : 'Spend Dance of Chi-Ji while the proc is up',
        summary: danceStacks > 0
          ? `You had \`${describeBuff('dance_of_chi_ji')}\` at ${danceStacks} stack${danceStacks === 1 ? '' : 's'}, so \`Spinning Crane Kick\` was the clean proc spender here${zenithActive ? ' and it also fits well inside `Zenith`.' : '.'}`
          : '`Spinning Crane Kick` was the better spender at that moment because it fit the current Windwalker priority better than your chosen cast.',
        fix: 'Spend `Dance of Chi-Ji` before it expires or overcaps, and avoid drifting it behind lower-value filler.',
      };
    }
    case 'blackout_kick': {
      const breakoutStacks = buffStacks(playerState, 'blackout_reinforcement');
      const zenithActive = hasBuff(playerState, 'zenith');
      return {
        title: breakoutStacks >= 2 ? 'Do not let Blackout Kick! overcap' : 'Use the free Blackout Kick window',
        summary: breakoutStacks > 0
          ? `You had \`${describeBuff('blackout_reinforcement')}\` at ${breakoutStacks} stack${breakoutStacks === 1 ? '' : 's'}, making \`Blackout Kick\` free and valuable for cooldown reduction${zenithActive ? ' during `Zenith`.' : '.'}`
          : '`Blackout Kick` was the correct filler here because it advanced your cooldown cycle more cleanly than the button you pressed.',
        fix: 'Spend `Blackout Kick!` before it overcaps, and let it help cycle into higher-damage cooldowns.',
      };
    }
    case 'fists_of_fury': {
      const hotjsActive = hasBuff(playerState, 'heart_of_the_jade_serpent')
        || hasBuff(playerState, 'heart_of_the_jade_serpent_unity_within')
        || hasBuff(playerState, 'heart_of_the_jade_serpent_yulons_avatar');
      return {
        title: 'Keep Fists of Fury inside your best windows',
        summary: hotjsActive
          ? '`Fists of Fury` was especially important here because a Heart of the Jade Serpent window was active, so delaying it gave up high-value haste and cooldown acceleration.'
          : '`Fists of Fury` was your highest-value cast here, so pushing it back for filler cost burst tempo and future cooldown alignment.',
        fix: 'Pool enough Chi ahead of time so `Fists of Fury` is ready to go the moment it becomes the best button.',
      };
    }
    case 'rising_sun_kick': {
      return {
        title: 'Do not let Rising Sun Kick wait behind filler',
        summary: hasBuff(playerState, 'heart_of_the_jade_serpent')
          ? '`Rising Sun Kick` belonged inside the active Heart of the Jade Serpent window, where its cooldown and damage pacing mattered more.'
          : '`Rising Sun Kick` was the stronger GCD here and should not have been delayed by a lower-impact cast.',
        fix: 'Keep enough Chi in reserve to press `Rising Sun Kick` as soon as it rises to the top of the priority.',
      };
    }
    case 'tiger_palm': {
      return {
        title: 'Use Tiger Palm to set up the next spender',
        summary: playerState.energy >= 85
          ? '`Tiger Palm` was correct here because your Energy was close to capping and you needed Chi for the next stronger spender.'
          : '`Tiger Palm` was the clean setup cast here because you needed Chi or Energy relief before the next priority window.',
        fix: 'Use `Tiger Palm` proactively when Energy is climbing and your next key spender is waiting on Chi.',
      };
    }
    case 'celestial_conduit':
      return {
        title: 'Channel Celestial Conduit in the burst window',
        summary: hasBuff(playerState, 'zenith')
          ? '`Celestial Conduit` was correct here because your burst setup was already active, and delaying it wasted part of that stacked cooldown window.'
          : '`Celestial Conduit` was ready for a better burst window here and should not have been delayed behind filler.',
        fix: 'Plan the GCD before `Celestial Conduit` so you can channel it immediately when the setup is ready.',
      };
    case 'invoke_xuen_the_white_tiger':
      return {
        title: 'Summon Xuen before the Conduit burst',
        summary: '`Invoke Xuen, the White Tiger` was the right setup button here so your next `Celestial Conduit` or major burst sequence could start fully prepared.',
        fix: 'Plan one GCD ahead so `Invoke Xuen, the White Tiger` is already active before the burst channel starts.',
      };
    case 'whirling_dragon_punch':
      return {
        title: 'Take the Whirling Dragon Punch window while it is open',
        summary: hasBuff(playerState, 'whirling_dragon_punch')
          ? '`Whirling Dragon Punch` was available at this moment, and those windows are valuable because they disappear quickly once other cooldowns move again.'
          : '`Whirling Dragon Punch` was the correct burst follow-up here and should not have been pushed back.',
        fix: 'Avoid spending a filler GCD when `Whirling Dragon Punch` is available or about to fall out of its window.',
      };
    default:
      return explainRecommendedSpell(expectedSpellId);
  }
}

function analyzeSetup(
  player: RawRunTrace,
  trainer: RawRunTrace,
  options: {
    hasCelestialConduit: boolean;
    hasXuen: boolean;
  },
): AnalysisFinding[] {
  if (!options.hasCelestialConduit || !options.hasXuen) {
    return [];
  }

  const conduitCasts = player.casts.filter((entry) => entry.spellId === 'celestial_conduit');
  const missingXuen = conduitCasts.filter((entry) => !recentCastWithin(player, 'invoke_xuen_the_white_tiger', entry.time, 20));
  if (missingXuen.length === 0) {
    return [];
  }

  const trainerConduitDamage = averageSpellDamage(trainer, 'celestial_conduit');
  return [
    {
      id: 'ww-xuen-before-conduit',
      category: 'setup',
      title: 'Set up Celestial Conduit with Xuen more often',
      summary: `You cast \`Celestial Conduit\` ${missingXuen.length} time${missingXuen.length === 1 ? '' : 's'} without a recent \`Invoke Xuen, the White Tiger\` setup.`,
      fix: 'Try to summon `Invoke Xuen, the White Tiger` shortly before `Celestial Conduit` so the burst window lines up more cleanly.',
      focusSpellId: 'celestial_conduit',
      comparisonSpellId: 'invoke_xuen_the_white_tiger',
      estimatedDpsLoss: Math.round((trainerConduitDamage * missingXuen.length) / Math.max(1, trainer.encounterDuration)),
      occurrences: missingXuen.length,
      severity: missingXuen.length >= 2 ? 'major' : 'medium',
      evidence: missingXuen.slice(0, 3).map((entry) => ({
        time: entry.time,
        actualSpellId: 'celestial_conduit',
        note: 'Celestial Conduit cast without a recent Xuen setup.',
      })),
    },
  ];
}

function shouldFlagDowntime(context: DowntimeContext): boolean {
  if (context.duration < 2.5) {
    return false;
  }

  if (context.chiWasteDelta > 0 || context.energyWasteDelta > 0) {
    return true;
  }

  if (context.energyBefore >= 85) {
    return true;
  }

  return context.topRecommendation !== 'fists_of_fury'
    && context.topRecommendation !== 'whirling_dragon_punch'
    && context.topRecommendation !== 'strike_of_the_windlord';
}

function getTrackedBuffIds(talents: ReadonlySet<string>): string[] {
  const buffIds = new Set<string>(EXACT_MISTAKE_BASE_BUFFS);
  for (const group of EXACT_MISTAKE_OPTIONAL_BUFFS) {
    if (!talents.has(group.talentId)) {
      continue;
    }
    for (const buffId of group.buffIds) {
      buffIds.add(buffId);
    }
  }
  return [...buffIds];
}

function getEssentialCooldownSpellIds(talents: ReadonlySet<string>): string[] {
  return [
    ...IMPORTANT_COOLDOWNS.filter((spellId) => isSpellAvailable(spellId, talents)),
    ...IMPORTANT_ABILITIES.filter((spellId) => isSpellAvailable(spellId, talents)),
  ];
}

function getExactMistakeSpellIds(talents: ReadonlySet<string>): string[] {
  return [
    ...EXACT_MISTAKE_BASE_SPELLS.filter((spellId) => isSpellAvailable(spellId, talents)),
    ...EXACT_MISTAKE_OPTIONAL_SPELLS.filter((spellId) => isSpellAvailable(spellId, talents)),
  ];
}

export const MONK_WINDWALKER_ANALYSIS_PROFILE: SpecAnalysisProfile = {
  ...buildMonkWindwalkerAnalysisProfile(new Set([
    'invoke_xuen_the_white_tiger',
    'celestial_conduit',
    'strike_of_the_windlord',
    'fists_of_fury',
    'zenith',
    'rising_sun_kick',
    'whirling_dragon_punch',
  ])),
};

export function buildMonkWindwalkerAnalysisProfile(talents: ReadonlySet<string>): SpecAnalysisProfile {
  const hasCelestialConduit = isSpellAvailable('celestial_conduit', talents);
  const hasXuen = isSpellAvailable('invoke_xuen_the_white_tiger', talents);

  return {
    specId: 'monk_windwalker',
    importantCooldowns: IMPORTANT_COOLDOWNS.filter((spellId) => isSpellAvailable(spellId, talents)),
    importantAbilities: IMPORTANT_ABILITIES.filter((spellId) => isSpellAvailable(spellId, talents)),
    exactMistakeSpellIds: getExactMistakeSpellIds(talents),
    explainRecommendedSpell,
    explainExactDecision,
    getTrackedBuffIds: () => getTrackedBuffIds(talents),
    getEssentialCooldownSpellIds: () => getEssentialCooldownSpellIds(talents),
    analyzeSetup: (player, trainer) => analyzeSetup(player, trainer, { hasCelestialConduit, hasXuen }),
    shouldFlagDowntime,
  };
}
