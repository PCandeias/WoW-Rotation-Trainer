// src/core/class_modules/monk/monk_t.ts
import { TalentRef, talent_not_selected } from '../../engine/talent_ref';
import type { SpellData } from '../../dbc/spell_data';

export interface WindwalkerTalents {
  readonly sharp_reflexes:        TalentRef;
  readonly combo_breaker:         TalentRef;
  readonly rushing_wind_kick:     TalentRef;
  readonly whirling_dragon_punch: TalentRef;
  readonly glory_of_the_dawn:     TalentRef;
  readonly hit_combo:             TalentRef;
  readonly jade_ignition:         TalentRef;
  readonly zenith:                TalentRef;
  readonly energy_burst:          TalentRef;
  readonly obsidian_spiral:       TalentRef;
  readonly one_versus_many:       TalentRef;
  readonly stand_ready:           TalentRef;
  readonly weapons_of_the_wall:   TalentRef;
  readonly flurry_strikes:        TalentRef;
  readonly shado_over_the_battlefield: TalentRef;
  readonly wisdom_of_the_wall:    TalentRef;
  readonly thunderfist:           TalentRef;
}

export interface MonkTalents {
  readonly windwalker: WindwalkerTalents;
}

/** Maps talent name string → DBC spell ID */
const TALENT_SPELL_IDS: Record<string, number> = {
  sharp_reflexes:            261917,
  combo_breaker:             137384,
  flurry_strikes:            450615,
  one_versus_many:           450988,
  zenith:                    322101,
  thunderfist:               392985,
  // TODO(Phase 2): Add spell IDs for hit_combo, rushing_wind_kick, glory_of_the_dawn, etc.
  // Until they are added, ok() returns false and the bonus is silently skipped.
  // hit_combo is already used in monk_action.ts — it needs a DBC ID before Phase 2.
};

function makeTalentRef(name: string, selected: Set<string>, dbc: Record<number, SpellData>): TalentRef {
  const spellId = TALENT_SPELL_IDS[name];
  if (spellId !== undefined) {
    const spellData = dbc[spellId];
    if (spellData) {
      return new TalentRef(spellData, selected.has(name));
    }
  }
  // Talent not in DBC yet: ok() = selected.has(name) would need spell data.
  // Return talent_not_selected; executor fallback still uses state.talents.has().
  return talent_not_selected;
}

export function buildMonkTalents(
  selected: Set<string>,
  dbc: Record<number, SpellData>,
): MonkTalents {
  const ww = (name: string): TalentRef => makeTalentRef(name, selected, dbc);
  return {
    windwalker: {
      sharp_reflexes:        ww('sharp_reflexes'),
      combo_breaker:         ww('combo_breaker'),
      rushing_wind_kick:     ww('rushing_wind_kick'),
      whirling_dragon_punch: ww('whirling_dragon_punch'),
      glory_of_the_dawn:     ww('glory_of_the_dawn'),
      hit_combo:             ww('hit_combo'),
      jade_ignition:         ww('jade_ignition'),
      zenith:                ww('zenith'),
      energy_burst:          ww('energy_burst'),
      obsidian_spiral:       ww('obsidian_spiral'),
      one_versus_many:       ww('one_versus_many'),
      stand_ready:           ww('stand_ready'),
      weapons_of_the_wall:   ww('weapons_of_the_wall'),
      flurry_strikes:        ww('flurry_strikes'),
      shado_over_the_battlefield: ww('shado_over_the_battlefield'),
      wisdom_of_the_wall:    ww('wisdom_of_the_wall'),
      thunderfist:           ww('thunderfist'),
    },
  };
}
