// src/core/engine/talent_ref.ts
import type { SpellData, SpellEffect} from '../dbc/spell_data';
import { spell_data_t_nil } from '../dbc/spell_data';

export class TalentRef {
  constructor(
    private readonly _data: SpellData,
    private readonly _selected: boolean,
  ) {}
  ok():              boolean     { return this._selected && this._data.ok(); }
  id():              number      { return this._data.id(); }
  name():            string      { return this._data.name(); }
  effectN(n: number): SpellEffect { return this._data.effectN(n); }
}

export const talent_not_selected = new TalentRef(spell_data_t_nil, false);
