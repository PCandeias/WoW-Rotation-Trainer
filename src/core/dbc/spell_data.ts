// src/core/dbc/spell_data.ts
export interface SpellEffectData {
  readonly _id: number;
  readonly _subtype: number;
  readonly _value: number;
  readonly _ap_coefficient: number;
  readonly _sp_coefficient: number;
}

export interface SpellMetaData {
  readonly _proc_chance_pct?: number;
  readonly _internal_cooldown_ms?: number;
  readonly _max_stacks?: number;
  readonly _duration_ms?: number;
}

const NIL_EFFECT_DATA: SpellEffectData = {
  _id: 0, _subtype: 0, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0,
};

export class SpellEffect {
  constructor(private readonly d: SpellEffectData) {}
  base_value(): number { return this.d._value; }
  percent():    number { return this.d._value / 100; }
  time_value(): number { return this.d._value; }
  ap_coeff():   number { return this.d._ap_coefficient; }
  sp_coeff():   number { return this.d._sp_coefficient; }
  /**
   * SimC's spell data dumps expose these mastery-scaling coefficients through
   * the same numeric field we ingest as `_sp_coefficient` for subtype 107
   * effects, so the trainer uses that sourced value and converts it to the
   * fractional `mastery_value()` shape SimC formulas expect.
   */
  mastery_value(): number { return this.d._sp_coefficient / 100; }
}

export class SpellData {
  constructor(
    private readonly _id: number,
    private readonly _name: string,
    private readonly _effects: SpellEffectData[] = [],
    readonly _cooldown_ms = 0,
    readonly _gcd_ms = 1500,
    private readonly _meta: SpellMetaData = {},
  ) {}
  id():   number  { return this._id; }
  name(): string  { return this._name; }
  ok():   boolean { return this._id !== 0; }
  proc_chance_pct(): number { return this._meta._proc_chance_pct ?? 0; }
  internal_cooldown_ms(): number { return this._meta._internal_cooldown_ms ?? 0; }
  max_stacks(): number { return this._meta._max_stacks ?? 0; }
  duration_ms(): number { return this._meta._duration_ms ?? 0; }
  /** 1-indexed, like SimC effectN(). Returns zero-value effect if out of range. */
  effectN(n: number): SpellEffect {
    return new SpellEffect(this._effects[n - 1] ?? NIL_EFFECT_DATA);
  }
}

export const spell_data_t_nil = new SpellData(0, 'nil');
