/**
 * SimC Debug Log Parser — APL Decision Validator
 *
 * Parses a SimC debug-mode log (produced with `log=1 iterations=1`) to
 * extract a sequence of state snapshots, one per foreground APL-eligible
 * action performed by the player.
 *
 * At each decision point the snapshot captures the game state that was
 * visible to the APL when it chose that action:
 *   - Current energy (from the `(N)` value in `performs Action`)
 *   - Current chi (tracked from chi-gain/loss events)
 *   - Active buffs with per-stack expiration times
 *   - Active cooldowns with readyAt timestamps
 *   - prevGcdAbility / prevGcdAbilities
 *   - energyRegenRate (derived from consecutive regen events)
 *
 * SimC is the ultimate source of truth — all values come directly from
 * the logged output rather than from our own simulation.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SimcBuffSnapshot {
  /** Number of active stacks at this decision point. */
  stacks: number;
  /**
   * Per-stack expiration timestamps in sim-seconds (0 = permanent stack).
   * Ordered from oldest to newest.
   */
  stackTimers: number[];
}

export interface SimcCooldownSnapshot {
  /** Sim time when the cooldown completes and the ability is usable again. */
  readyAt: number;
  /**
   * For charge-based cooldowns: sorted list of timestamps when each spent
   * charge will recharge.  Available charges = maxCharges - readyTimes.filter(t > now).length.
   */
  readyTimes?: number[];
  /** Maximum number of charges for charge-based cooldowns. */
  maxCharges?: number;
}

/**
 * A snapshot of the SimC game state at one APL decision point, immediately
 * before the action is executed (energy spent, chi gained, buffs applied, etc.).
 */
export interface SimcDecisionPoint {
  /** Simulation timestamp in seconds. */
  time: number;
  /** SimC action name as it appears in the log (e.g. `rising_sun_kick`). */
  simcAction: string;
  /** SimC spell ID (numeric string). 0 means a wrapper (auto-attack, potion, etc.). */
  spellId: number;
  /** Energy at execution time, taken directly from the `performs Action (N)` line. */
  energy: number;
  /** Maximum energy pool (tracked from regen events). */
  energyMax: number;
  /**
   * Estimated energy regen rate in energy/second.
   * Derived from consecutive regen log lines to capture real-time haste.
   */
  energyRegenRate: number;
  /** Current chi. */
  chi: number;
  /** Maximum chi. */
  chiMax: number;
  /**
   * Flurry charge stacks (from the `flurry_charge` buff or a dedicated counter).
   * Also stored in buffs['flurry_charge'] when the buff is active.
   */
  flurryCharges: number;
  /** Buff state map keyed by SimC buff name (not yet normalized to trainer IDs). */
  buffs: Map<string, SimcBuffSnapshot>;
  /** Cooldown map keyed by SimC cooldown name. */
  cooldowns: Map<string, SimcCooldownSnapshot>;
  /** Most recently completed foreground on-GCD ability before this decision. */
  prevGcdAbility: string | null;
  /**
   * Full history of completed foreground on-GCD abilities, most recent first.
   * Capped at 5 for memory efficiency.
   */
  prevGcdAbilities: string[];
  /**
   * The last combo-strike ability performed.
   * Used to evaluate `combo_strike` conditions in the APL.
   */
  lastComboStrikeAbility: string | null;
}

// ---------------------------------------------------------------------------
// Known APL-eligible SimC spell IDs
// These are the foreground actions we care about comparing.
// Spell ID 0 = auto-attack / wrapper → excluded.
// ---------------------------------------------------------------------------

const APL_SPELL_IDS = new Set([
  100780, // tiger_palm
  100784, // blackout_kick
  107270, // spinning_crane_kick
  107428, // rising_sun_kick
  113656, // fists_of_fury
  115080, // touch_of_death
  115098, // expel_harm / expel_harm (old)
  115181, // breath_of_fire (non-WW but keep safe)
  122470, // touch_of_karma
  123986, // chi_surge
  125359, // tiger_palm (variant)
  152175, // whirling_dragon_punch
  179057, // strike_of_the_windlord
  392983, // strike_of_the_windlord (new)
  451968, // expel_harm (midnight)
  467307, // rushing_wind_kick
  1249625, // zenith (celestial_conduit)
  338986, // slicing_winds (if applicable)
]);

/**
 * Known APL foreground spell names — used as a second filter in addition to
 * spell ID (some IDs may not be in the static set above if the profile uses
 * different talent builds).
 */
const APL_SPELL_NAMES = new Set([
  'tiger_palm',
  'blackout_kick',
  'rising_sun_kick',
  'fists_of_fury',
  'whirling_dragon_punch',
  'spinning_crane_kick',
  'expel_harm',
  'zenith',
  'rushing_wind_kick',
  'strike_of_the_windlord',
  'touch_of_death',
  'touch_of_karma',
  'slicing_winds',
  'chi_burst',
  'chi_wave',
]);

/**
 * Actions that produce a `schedule_ready()` log line and therefore represent
 * the end of a GCD slot (foreground on-GCD actions).
 */
const SCHEDULE_READY_ACTIONS = new Set([
  'tiger_palm',
  'blackout_kick',
  'rising_sun_kick',
  'fists_of_fury',
  'whirling_dragon_punch',
  'spinning_crane_kick',
  'expel_harm',
  'zenith',
  'rushing_wind_kick',
  'strike_of_the_windlord',
  'touch_of_death',
  'touch_of_karma',
  'slicing_winds',
  'chi_burst',
  'chi_wave',
]);

/**
 * Fallback buff durations (in seconds) for buffs where we cannot derive the
 * expiry from log events. Used when the immediately-following Add Event is
 * not present.
 */
const FALLBACK_BUFF_DURATIONS: Record<string, number> = {
  teachings_of_the_monastery: 20,
  hit_combo: 30,
  whirling_dragon_punch: 10,
  combo_breaker: 15,
  blackout_reinforcement: 15,
  dance_of_chiji: 15,
  dance_of_chi_ji: 15,
  rushing_wind_kick: 10,
  zenith: 10,
  celestial_conduit_active: 10,
  heart_of_the_jade_serpent: 5,
  heart_of_the_jade_serpent_unity_within: 5,
  heart_of_the_jade_serpent_yulons_avatar: 5,
  bloodlust: 40,
  power_infusion: 20,
  tigereye_brew: 6,
  tigereye_brew_1: 6,
  tigereye_brew_3: 6,
  stand_ready: 8,
  pressure_point: 5,
  combat_wisdom: 999999,
  momentum_boost_damage: 10,
  momentum_boost_speed: 2,
  flurry_charge: 0, // permanent stacks
  combo_strikes: 3600, // effectively permanent
};

// ---------------------------------------------------------------------------
// Mutable tracking state during parsing
// ---------------------------------------------------------------------------

interface TrackingState {
  time: number;
  chi: number;
  chiMax: number;
  energy: number;
  energyMax: number;
  // For regen-rate derivation
  lastRegenTime: number;
  lastRegenEnergy: number;
  energyRegenRate: number;
  // Buff state keyed by SimC buff name
  buffs: Map<string, { stacks: number; stackTimers: number[] }>;
  // Cooldown state keyed by SimC cooldown name
  cooldowns: Map<string, { readyAt: number; readyTimes?: number[]; maxCharges?: number }>;
  // Foreground GCD history
  prevGcdAbility: string | null;
  prevGcdAbilities: string[];
  lastComboStrikeAbility: string | null;
  /** The last action name from a `schedules execute` or `performs Action` line. */
  lastScheduledOrPerformedAction: string | null;
  // flurry charge counter (mirrors the flurry_charge buff stacks)
  flurryCharges: number;
  // Pending: the next Add Event time (for buff expiry pairing)
  pendingAddEventTime: number | null;
  // Whether we just saw a `gains Buff` and are waiting for Add Event
  awaitingBuffExpiry: { name: string } | null;
  /**
   * True immediately after `Executing event: Player-Ready` fires and before
   * the first `schedules execute for Action` in that Player-Ready block.
   *
   * The APL decision is the FIRST action scheduled by the Player-Ready event.
   * Subsequent actions (melee swings, triggered free-casts, etc.) are automatic
   * and fire either from concurrent events or from the chosen action's own effects.
   */
  withinPlayerReadyBlock: boolean;
}

// ---------------------------------------------------------------------------
// parseSimcDebugLog
// ---------------------------------------------------------------------------

/**
 * Parse a SimC debug log and extract one `SimcDecisionPoint` per foreground
 * APL-eligible action.
 *
 * @param log  Raw string content of the SimC debug log (e.g. `simc_debug.log`).
 * @param playerName  Player name prefix in the log (default: `MID1_Monk_Windwalker`).
 * @returns Array of decision points in chronological order.
 */
export function parseSimcDebugLog(log: string, playerName = 'MID1_Monk_Windwalker'): SimcDecisionPoint[] {
  const lines = log.split('\n');
  const decisions: SimcDecisionPoint[] = [];

  const state: TrackingState = {
    time: 0,
    chi: 0,
    chiMax: 6,
    energy: 100,
    energyMax: 100,
    lastRegenTime: 0,
    lastRegenEnergy: 0,
    energyRegenRate: 10, // default before we see the first regen event
    buffs: new Map(),
    cooldowns: new Map(),
    prevGcdAbility: null,
    prevGcdAbilities: [],
    lastComboStrikeAbility: null,
    lastScheduledOrPerformedAction: null,
    flurryCharges: 0,
    pendingAddEventTime: null,
    awaitingBuffExpiry: null,
    withinPlayerReadyBlock: false,
  };

  // Regex patterns
  const rTimestamp = /^(\d+\.\d+) /;
  const rPerforms = new RegExp(`Player '${playerName}' performs Action '([^']+)' \\((\\d+)\\) \\(([\\d.]+)\\)`);
  const rChiGain = new RegExp(`${playerName} gains [\\d.]+ \\([\\d.]+\\) chi from .+ \\(([\\d.]+)\\/([\\d.]+)\\)`);
  const rChiLose = new RegExp(`${playerName} loses ([\\d.]+) .+ chi`);
  const rEnergyRegen = new RegExp(`${playerName} gains [\\d.]+ \\([\\d.]+\\) energy from Energy Regen \\(([\\d.]+)\\/([\\d.]+)\\)`);
  const rDynamicRegen = new RegExp(`${playerName} dynamic regen, last=([\\d.]+) interval=([\\d.]+)`);
  const rEnergyLose = new RegExp(`Player '${playerName}' loses [\\d.]+ \\([\\d.]+\\) energy\\. pct=[\\d.]+% \\(([\\d.]+)\\/([\\d.]+)\\)`);
  const rBuffGain = new RegExp(`Player '${playerName}' gains Buff '([^']+)' \\((\\d+)\\) \\(stacks=(\\d+)\\)`);
  const rBuffRefresh = new RegExp(`Player '${playerName}' refreshes ([a-z_A-Z0-9]+)_(\\d+) .*duration=(-?[\\d.]+)`);
  const rBuffLose = new RegExp(`Player '${playerName}' loses Buff '([^']+)'`);
  const rCooldownStart = new RegExp(`Player '${playerName}' starts cooldown (\\S+) with duration ([\\d.]+)`);
  /** Matches detailed charge-based cooldown starts: extracts cdName, remaining/max charges, duration, and readyAt. */
  const rCooldownCharge = new RegExp(
    `Player '${playerName}' starts cooldown for Action '[^']+' \\(\\d+\\) \\(Cooldown (\\S+), (\\d+)\\/(\\d+)\\)\\. Duration=([\\d.]+) Delay=[\\d.]+\\. (Will be ready at ([\\d.]+)\\.|Ready now\\.)`,
  );
  /** Matches cooldown adjustment lines: adjusts readyAt to the `ready=` field. */
  const rCooldownAdjust = new RegExp(`${playerName} cooldown (\\S+) adjustment=[-\\d.]+, remains=[-\\d.]+, ready=([-\\d.]+)`);
  /** Matches dynamic haste-rescaling lines: `Player '...' dynamic cooldown X adjusted: new_ready=T`. */
  const rDynamicCooldown = new RegExp(`Player '${playerName}' dynamic cooldown (\\S+) adjusted: new_ready=([\\d.]+)`);
  const rAddEvent = /Add Event: core_event_t\(#\d+\) time=([\d.]+)/;
  const rScheduleReady = new RegExp(`Player '${playerName}' ([a-z_]+) schedule_ready\\(\\): cast_finishes=([\\d.]+)`);
  /** Matches only the real APL-selection Player-Ready, not Cast-While-Casting variants. */
  const rPlayerReady = /Executing event: Player-Ready\((?!.*Cast-While-Casting)/;
  /**
   * Matches `schedules execute for Action 'name' (spell_id)`.
   * This fires immediately after the APL selects an action during Player-Ready processing,
   * before any concurrent events (melee swings, procs) fire.
   */
  const rSchedulesExecute = new RegExp(`Player '${playerName}' schedules execute for Action '([^']+)' \\((\\d+)\\)`);

  for (const line of lines) {
    const tsMatch = rTimestamp.exec(line);
    if (!tsMatch) continue;

    const time = parseFloat(tsMatch[1]);
    state.time = time;

    // Clear pending add-event pairing if this is a new context
    // (the pair is always on the immediately following line with the same timestamp)

    // -----------------------------------------------------------------------
    // Player-Ready event (APL evaluation fires) — arm the decision capture
    // Only capture from the real Player-Ready, not Cast-While-Casting variants.
    // -----------------------------------------------------------------------
    if (rPlayerReady.test(line)) {
      state.withinPlayerReadyBlock = true;
      continue;
    }

    // -----------------------------------------------------------------------
    // Executing event (any non-Player-Ready event) — closes the Player-Ready block.
    // The APL decision is the FIRST "schedules execute" within the block;
    // once we see a new "Executing event:" that is not Player-Ready, the block ends.
    // -----------------------------------------------------------------------
    if (line.includes('Executing event:') && !rPlayerReady.test(line)) {
      state.withinPlayerReadyBlock = false;
    }

    // -----------------------------------------------------------------------
    // APL decision capture: the action selected by the APL during a Player-Ready
    // is the FIRST `schedules execute for Action` within the Player-Ready block.
    // This fires synchronously during the Player-Ready event processing, before
    // any concurrent events (melee auto-attacks, procs) interleave.
    // -----------------------------------------------------------------------
    const schedExecMatch = rSchedulesExecute.exec(line);
    if (schedExecMatch) {
      const actionName = schedExecMatch[1];
      const spellId = parseInt(schedExecMatch[2], 10);

      // Track the most recent scheduled action for combo_strikes correlation.
      state.lastScheduledOrPerformedAction = actionName;

      if (state.withinPlayerReadyBlock) {
        // This is the APL's choice for this Player-Ready slot.
        // Close the block so subsequent schedules in the same slot are ignored.
        state.withinPlayerReadyBlock = false;

        const isAplEligible =
          spellId > 0 &&
          (APL_SPELL_IDS.has(spellId) || APL_SPELL_NAMES.has(actionName));

        if (isAplEligible) {
          decisions.push({
            time,
            simcAction: actionName,
            spellId,
            energy: state.energy,
            energyMax: state.energyMax,
            energyRegenRate: state.energyRegenRate,
            chi: state.chi,
            chiMax: state.chiMax,
            flurryCharges: state.flurryCharges,
            buffs: new Map(
              [...state.buffs.entries()].map(([k, v]) => [
                k,
                { stacks: v.stacks, stackTimers: [...v.stackTimers] },
              ]),
            ),
            cooldowns: new Map(
              [...state.cooldowns.entries()].map(([k, v]) => [k, {
                readyAt: v.readyAt,
                readyTimes: v.readyTimes ? [...v.readyTimes] : undefined,
                maxCharges: v.maxCharges,
              }]),
            ),
            prevGcdAbility: state.prevGcdAbility,
            prevGcdAbilities: [...state.prevGcdAbilities],
            lastComboStrikeAbility: state.lastComboStrikeAbility,
          });

          // Apply implicit side effects of certain actions, so subsequent decisions
          // at the same timestamp see the correct state.
          if (actionName === 'zenith') {
            // Zenith (Celestial Conduit) immediately resets Rising Sun Kick's cooldown.
            // This mirrors monk_runtime's startCooldown hook: s.cooldowns.delete('rising_sun_kick').
            state.cooldowns.delete('rising_sun_kick');
          }
        }
        // Non-APL-eligible action (potion, trinket, etc.) — slot consumed, no capture needed.
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Dynamic energy regen — used to update energyRegenRate
    // -----------------------------------------------------------------------
    const dynRegenMatch = rDynamicRegen.exec(line);
    if (dynRegenMatch) {
      const last = parseFloat(dynRegenMatch[1]);
      const interval = parseFloat(dynRegenMatch[2]);
      if (interval > 0) {
        // The next line has the actual gain amount; track interval for rate derivation
        state.lastRegenTime = last;
      }
    }

    // -----------------------------------------------------------------------
    // Energy regen event — gives exact current energy
    // -----------------------------------------------------------------------
    const energyRegenMatch = rEnergyRegen.exec(line);
    if (energyRegenMatch) {
      const after = parseFloat(energyRegenMatch[1]);
      const max = parseFloat(energyRegenMatch[2]);
      // Derive energy regen rate from the delta since last settled energy
      const interval = time - state.lastRegenTime;
      if (interval > 0.001 && state.lastRegenEnergy >= 0) {
        const gained = after - state.lastRegenEnergy;
        // Only derive rate from regen that wasn't capped at max
        if (after < max && gained > 0) {
          state.energyRegenRate = gained / interval;
        }
      }
      state.energy = after;
      state.energyMax = max;
      state.lastRegenEnergy = after;
      state.lastRegenTime = time;
      continue;
    }

    // -----------------------------------------------------------------------
    // Energy lost (cost paid)
    // -----------------------------------------------------------------------
    const energyLoseMatch = rEnergyLose.exec(line);
    if (energyLoseMatch) {
      const after = parseFloat(energyLoseMatch[1]);
      const max = parseFloat(energyLoseMatch[2]);
      state.energy = after;
      state.energyMax = max;
      state.lastRegenEnergy = after;
      state.lastRegenTime = time;
      continue;
    }

    // -----------------------------------------------------------------------
    // Chi gain
    // -----------------------------------------------------------------------
    const chiGainMatch = rChiGain.exec(line);
    if (chiGainMatch) {
      state.chi = Math.round(parseFloat(chiGainMatch[1]));
      state.chiMax = Math.round(parseFloat(chiGainMatch[2]));
      continue;
    }

    // -----------------------------------------------------------------------
    // Chi loss (spending chi for spells)
    // -----------------------------------------------------------------------
    const chiLoseMatch = rChiLose.exec(line);
    if (chiLoseMatch) {
      const lost = Math.round(parseFloat(chiLoseMatch[1]));
      state.chi = Math.max(0, state.chi - lost);
      continue;
    }

    // -----------------------------------------------------------------------
    // Buff gained
    // -----------------------------------------------------------------------
    const buffGainMatch = rBuffGain.exec(line);
    if (buffGainMatch) {
      const buffName = buffGainMatch[1];
      const stacks = parseInt(buffGainMatch[3], 10);

      // Get or create the buff entry
      const existing = state.buffs.get(buffName);
      if (existing) {
        // Adding a stack on top of existing — don't overwrite all timers
        // We'll update via awaitingBuffExpiry below
        existing.stacks = stacks;
      } else {
        state.buffs.set(buffName, { stacks, stackTimers: [] });
      }

      // Flag that the next Add Event line belongs to this buff's expiry timer
      state.awaitingBuffExpiry = { name: buffName };
      continue;
    }

    // -----------------------------------------------------------------------
    // Buff refreshed (existing buff gets new stack or duration extended)
    // -----------------------------------------------------------------------
    const buffRefreshMatch = rBuffRefresh.exec(line);
    if (buffRefreshMatch) {
      const buffBaseName = buffRefreshMatch[1];
      const stackIdx = parseInt(buffRefreshMatch[2], 10);
      const duration = parseFloat(buffRefreshMatch[3]);

      const expiresAt = duration <= 0 ? 0 : time + duration;

      let buff = state.buffs.get(buffBaseName);
      if (!buff) {
        buff = { stacks: stackIdx, stackTimers: [] };
        state.buffs.set(buffBaseName, buff);
      }
      buff.stacks = stackIdx;

      // Update or push the per-stack timer at index (stackIdx - 1)
      const idx = stackIdx - 1;
      while (buff.stackTimers.length <= idx) {
        buff.stackTimers.push(0);
      }
      buff.stackTimers[idx] = expiresAt;

      // Update aggregate expiresAt (max across all timers) — but we store per-stack
      // Clear the awaitingBuffExpiry since the refresh line provides duration directly
      state.awaitingBuffExpiry = null;

      // Track flurry charges via this buff
      if (buffBaseName === 'flurry_charge') {
        state.flurryCharges = stackIdx;
      }

      // combo_strikes refresh marks the preceding action as combo-strike-eligible.
      // SimC pushes the action onto combo_strike_actions in combo_strikes_trigger().
      if (buffBaseName === 'combo_strikes' && state.lastScheduledOrPerformedAction) {
        state.lastComboStrikeAbility = state.lastScheduledOrPerformedAction;
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Add Event: core_event_t — buff expiry timer (immediately follows gains Buff)
    // -----------------------------------------------------------------------
    const addEventMatch = rAddEvent.exec(line);
    if (addEventMatch && state.awaitingBuffExpiry) {
      const expiresAt = parseFloat(addEventMatch[1]);
      const buffName = state.awaitingBuffExpiry.name;

      // If the Add Event fires at the current time it is almost certainly not
      // a buff-expiry timer (e.g. it is a Player-Ready event that happens to
      // be queued at the same timestamp).  Fall through to the fallback-
      // duration path so we don't accidentally expire the buff immediately.
      const fallback = FALLBACK_BUFF_DURATIONS[buffName];
      const useExpiresAt = expiresAt > time ? expiresAt
        : fallback !== undefined ? (fallback <= 0 ? 0 : time + fallback)
        : expiresAt;

      state.awaitingBuffExpiry = null;

      const buff = state.buffs.get(buffName);
      if (buff) {
        // Push this as the latest stack timer
        buff.stackTimers.push(useExpiresAt);
        // Keep at most stacks entries
        if (buff.stackTimers.length > buff.stacks) {
          buff.stackTimers = buff.stackTimers.slice(-buff.stacks);
        }
      }
      continue;
    } else if (!addEventMatch) {
      // Any non-AddEvent line clears the awaiting flag — the pair must be consecutive
      if (state.awaitingBuffExpiry && !line.includes('Add Event')) {
        // Apply fallback duration if no Add Event followed
        const buffName = state.awaitingBuffExpiry.name;
        const fallbackDuration = FALLBACK_BUFF_DURATIONS[buffName];
        if (fallbackDuration !== undefined) {
          const buff = state.buffs.get(buffName);
          if (buff) {
            const expiresAt = fallbackDuration <= 0 ? 0 : time + fallbackDuration;
            buff.stackTimers.push(expiresAt);
            if (buff.stackTimers.length > buff.stacks) {
              buff.stackTimers = buff.stackTimers.slice(-buff.stacks);
            }
          }
        }
        state.awaitingBuffExpiry = null;
      }
    }

    // -----------------------------------------------------------------------
    // Buff lost
    // -----------------------------------------------------------------------
    const buffLoseMatch = rBuffLose.exec(line);
    if (buffLoseMatch) {
      const buffName = buffLoseMatch[1];
      state.buffs.delete(buffName);
      if (buffName === 'flurry_charge') {
        state.flurryCharges = 0;
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Cooldown started
    // -----------------------------------------------------------------------
    const cooldownMatch = rCooldownStart.exec(line);
    if (cooldownMatch) {
      const cdName = cooldownMatch[1];
      const duration = parseFloat(cooldownMatch[2]);
      // Only set as a simple readyAt; the detailed charge line (rCooldownCharge) may
      // follow immediately and will upgrade this to a charge-based entry.
      const existing = state.cooldowns.get(cdName);
      state.cooldowns.set(cdName, { readyAt: time + duration, readyTimes: existing?.readyTimes, maxCharges: existing?.maxCharges });
      continue;
    }

    // -----------------------------------------------------------------------
    // Charge-based cooldown started (detailed format)
    // Updates charge tracking state for abilities with multiple charges.
    // -----------------------------------------------------------------------
    const chargeMatch = rCooldownCharge.exec(line);
    if (chargeMatch) {
      const cdName = chargeMatch[1];
      const remaining = parseInt(chargeMatch[2], 10); // charges remaining after this spend
      const maxCharges = parseInt(chargeMatch[3], 10);
      const duration = parseFloat(chargeMatch[4]);
      const readyNow = chargeMatch[5].startsWith('Ready now');
      const nextReadyAt = readyNow ? time + duration : parseFloat(chargeMatch[6]);
      const spentCount = maxCharges - remaining;

      if (maxCharges > 1) {
        // Build readyTimes: spentCount entries, each spaced `duration` apart.
        const readyTimes: number[] = [];
        for (let k = 0; k < spentCount; k++) {
          readyTimes.push(nextReadyAt + k * duration);
        }
        state.cooldowns.set(cdName, {
          readyAt: nextReadyAt,
          readyTimes,
          maxCharges,
        });
      }
      // For single-charge CDs (maxCharges=1) the simple line already handled it.
      continue;
    }

    // -----------------------------------------------------------------------
    // Dynamic haste-rescaling of cooldown expiry
    // -----------------------------------------------------------------------
    const dynamicCooldownMatch = rDynamicCooldown.exec(line);
    if (dynamicCooldownMatch) {
      const cdName = dynamicCooldownMatch[1];
      const newReady = parseFloat(dynamicCooldownMatch[2]);
      const existing = state.cooldowns.get(cdName);
      state.cooldowns.set(cdName, { readyAt: newReady, readyTimes: existing?.readyTimes, maxCharges: existing?.maxCharges });
      continue;
    }

    // Cooldown adjustment (haste changes, channel-based reductions, etc.)
    // -----------------------------------------------------------------------
    const cooldownAdjustMatch = rCooldownAdjust.exec(line);
    if (cooldownAdjustMatch) {
      const cdName = cooldownAdjustMatch[1];
      const ready = parseFloat(cooldownAdjustMatch[2]);
      if (ready <= 0) {
        // Negative/zero ready means the CD has already expired
        state.cooldowns.delete(cdName);
      } else {
        const existing = state.cooldowns.get(cdName);
        state.cooldowns.set(cdName, { readyAt: ready, readyTimes: existing?.readyTimes, maxCharges: existing?.maxCharges });
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // [PROC] Teachings of the Monastery - Rising Sun Kick Reset (SUCCESS)
    // SimC's proc_t::occur() emits `[PROC]` on SUCCESS.  When this fires,
    // the RSK cooldown was reset via `rising_sun_kick->reset( true )`.
    // -----------------------------------------------------------------------
    if (line.includes('[PROC] Teachings of the Monastery - Rising Sun Kick Reset')) {
      state.cooldowns.delete('rising_sun_kick');
      continue;
    }

    // -----------------------------------------------------------------------
    // schedule_ready() — marks end of foreground GCD slot; update prevGcd
    // -----------------------------------------------------------------------
    const scheduleReadyMatch = rScheduleReady.exec(line);
    if (scheduleReadyMatch) {
      const actionName = scheduleReadyMatch[1];
      if (SCHEDULE_READY_ACTIONS.has(actionName)) {
        state.prevGcdAbility = actionName;
        state.prevGcdAbilities = [actionName, ...state.prevGcdAbilities].slice(0, 5);
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // performs Action — track state updates (resource costs, etc.) but do NOT
    // use as a decision capture point. APL decisions are captured via
    // `schedules execute for Action` above, which fires synchronously within
    // the Player-Ready processing before any concurrent events interleave.
    // -----------------------------------------------------------------------
    const performsMatch = rPerforms.exec(line);
    if (performsMatch) {
      // Track for combo_strikes correlation.
      state.lastScheduledOrPerformedAction = performsMatch[1];
    }
  }

  return decisions;
}
