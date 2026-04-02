import { SpellData } from './spell_data';

/**
 * Minimal Enhancement Shaman DBC spell data used by the first live action slice.
 *
 * Values are sourced from the checked-in SimC Midnight SpellDataDump:
 * - Flametongue Attack: `SpellDataDump/shaman.txt` lines 404-421
 * - Enhancement Shaman passive / Flame Shock: `SpellDataDump/shaman.txt` lines 2906-2942, 3742-3787
 * - Lava Lash: `SpellDataDump/shaman.txt` lines 1346-1378
 * - Ashen Catalyst / Lashing Flames: `SpellDataDump/shaman.txt` lines 8918-8955, 11895-11932
 * - Stormstrike MH/OH: `SpellDataDump/shaman.txt` lines 641-683
 * - Windstrike MH/OH: `SpellDataDump/shaman.txt` lines 2372-2440
 * - Crash Lightning / Converging Storms: `SpellDataDump/shaman.txt` lines 3584-3628, 4346-4365, 4551-4571, 11747-11760
 * - Storm Unleashed / Crash Lightning (Unleashed): `SpellDataDump/shaman.txt` lines 17613-17625, 17675-17691
 * - Lightning Bolt / Lightning Bolt Overload / Maelstrom Weapon aura: `SpellDataDump/shaman.txt`
 * - Molten Assault: `SpellDataDump/shaman.txt` lines 8878-8898
 * - Maelstrom Weapon / Hot Hand proc data: `SpellDataDump/shaman.txt`
 */
export const SHAMAN_DBC: Record<number, SpellData> = {
  137041: new SpellData(137041, 'Enhancement Shaman',
    [
      { _id: 179725, _subtype: 108, _value: 8, _ap_coefficient: 0, _sp_coefficient: 2 },
      { _id: 191038, _subtype: 108, _value: 8, _ap_coefficient: 0, _sp_coefficient: 2 },
      { _id: 191039, _subtype: 429, _value: 8, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 191040, _subtype: 531, _value: 8, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 191041, _subtype: 344, _value: 278, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 261007, _subtype: 366, _value: 101, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  10444: new SpellData(10444, 'Flametongue Attack',
    [{ _id: 4391, _subtype: 2, _value: 0, _ap_coefficient: 0.0396, _sp_coefficient: 0 }],
    0,
    0),

  25504: new SpellData(25504, 'Windfury Attack',
    [{ _id: 15497, _subtype: 2, _value: 0, _ap_coefficient: 0.27945, _sp_coefficient: 0 }],
    0,
    0),

  77223: new SpellData(77223, 'Mastery: Enhanced Elements',
    [
      { _id: 68076, _subtype: 108, _value: 0, _ap_coefficient: 0, _sp_coefficient: 2 },
      { _id: 92143, _subtype: 4, _value: 250, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 297947, _subtype: 107, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0.12 },
      { _id: 297948, _subtype: 107, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0.08 },
    ],
    0,
    0),

  201845: new SpellData(201845, 'Stormsurge',
    [{ _id: 297456, _subtype: 4, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _proc_chance_pct: 5 }),

  201846: new SpellData(201846, 'Stormsurge',
    [
      { _id: 297457, _subtype: 408, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 297909, _subtype: 108, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 297910, _subtype: 4, _value: -100, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 302446, _subtype: 108, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 342303, _subtype: 107, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 363023, _subtype: 408, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1185735, _subtype: 293, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 12000 }),

  319930: new SpellData(319930, 'Stormblast',
    [
      { _id: 806720, _subtype: 4, _value: 25, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1185745, _subtype: 411, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1185758, _subtype: 42, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  390287: new SpellData(390287, 'Stormblast',
    [{ _id: 1027004, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0),

  382043: new SpellData(382043, 'Surging Elements',
    [{ _id: 1013243, _subtype: 193, _value: 15, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 12000, _max_stacks: 6 }),

  392352: new SpellData(392352, 'Storm\'s Wrath',
    [
      { _id: 1030492, _subtype: 218, _value: 150, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1030493, _subtype: 218, _value: 150, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  470466: new SpellData(470466, 'Stormblast',
    [{ _id: 1185751, _subtype: 4, _value: 25, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 12000, _max_stacks: 2 }),

  188389: new SpellData(188389, 'Flame Shock',
    [
      { _id: 274966, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0.22425 },
      { _id: 274967, _subtype: 3, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0.1334 },
    ],
    6000,
    1500,
    { _duration_ms: 18000 }),

  188196: new SpellData(188196, 'Lightning Bolt',
    [{ _id: 274268, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 1.311 }],
    0,
    1500),

  188443: new SpellData(188443, 'Chain Lightning',
    [{ _id: 274311, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0.73025 }],
    0,
    1500),

  452201: new SpellData(452201, 'Tempest',
    [
      { _id: 1153178, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 3.88125 },
      { _id: 1158656, _subtype: 3, _value: 65, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1184273, _subtype: 3, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    1500),

  463351: new SpellData(463351, 'Tempest Overload',
    [
      { _id: 1173986, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 3.88125 },
      { _id: 1173987, _subtype: 3, _value: 65, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1185078, _subtype: 3, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  45284: new SpellData(45284, 'Lightning Bolt Overload',
    [{ _id: 52440, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 1.311 }],
    0,
    0),

  187874: new SpellData(187874, 'Crash Lightning',
    [
      { _id: 274038, _subtype: 2, _value: 0, _ap_coefficient: 1.53014, _sp_coefficient: 0 },
      { _id: 739957, _subtype: 3, _value: 6, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    15000,
    1500),

  195592: new SpellData(195592, 'Crash Lightning',
    [{ _id: 287112, _subtype: 2, _value: 0, _ap_coefficient: 0.88872, _sp_coefficient: 0 }],
    0,
    0),

  198300: new SpellData(198300, 'Converging Storms',
    [{ _id: 291440, _subtype: 108, _value: 25, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 12000, _max_stacks: 6 }),

  1252373: new SpellData(1252373, 'Storm Unleashed',
    [
      { _id: 1257483, _subtype: 4, _value: 50, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1257484, _subtype: 4, _value: 2, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  1250364: new SpellData(1250364, 'Elemental Tempo',
    [
      { _id: 1254431, _subtype: 108, _value: 10, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1254432, _subtype: 108, _value: 10, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1254433, _subtype: 4, _value: 300, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1254434, _subtype: 4, _value: 300, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  1252431: new SpellData(1252431, 'Crash Lightning (Unleashed)',
    [{ _id: 1257585, _subtype: 2, _value: 0, _ap_coefficient: 0.765072, _sp_coefficient: 0 }],
    0,
    0),

  262647: new SpellData(262647, 'Forceful Winds',
    [
      { _id: 624003, _subtype: 108, _value: 50, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1253111, _subtype: 107, _value: 10, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  262652: new SpellData(262652, 'Forceful Winds',
    [
      { _id: 624009, _subtype: 108, _value: 15, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 722347, _subtype: 4, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 15000, _max_stacks: 5 }),

  17364: new SpellData(17364, 'Stormstrike',
    [
      { _id: 9070, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 223648, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    7500,
    1500),

  32175: new SpellData(32175, 'Stormstrike',
    [{ _id: 21915, _subtype: 2, _value: 0, _ap_coefficient: 2.66408, _sp_coefficient: 0 }],
    0,
    0),

  32176: new SpellData(32176, 'Stormstrike Off-Hand',
    [{ _id: 21916, _subtype: 2, _value: 0, _ap_coefficient: 2.66408, _sp_coefficient: 0 }],
    0,
    0),

  60103: new SpellData(60103, 'Lava Lash',
    [{ _id: 53784, _subtype: 2, _value: 0, _ap_coefficient: 2.0758, _sp_coefficient: 0 }],
    0,
    0),

  334168: new SpellData(334168, 'Lashing Flames',
    [{ _id: 829938, _subtype: 271, _value: 100, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 20000, _max_stacks: 1 }),

  334033: new SpellData(334033, 'Molten Assault',
    [
      { _id: 829716, _subtype: 107, _value: -6000, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 910359, _subtype: 107, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  390370: new SpellData(390370, 'Ashen Catalyst',
    [{ _id: 1027131, _subtype: 4, _value: 2000, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0),

  319773: new SpellData(319773, 'Windfury Weapon',
    [
      { _id: 806482, _subtype: 4, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1159602, _subtype: 226, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _proc_chance_pct: 15, _duration_ms: 3600000 }),

  384352: new SpellData(384352, 'Doom Winds',
    [
      { _id: 1016910, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1183511, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    60000,
    0),

  445028: new SpellData(445028, 'Imbuement Mastery',
    [
      { _id: 1141753, _subtype: 107, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1160429, _subtype: 108, _value: 8, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  445035: new SpellData(445035, 'Splitstream',
    [
      { _id: 1141760, _subtype: 4, _value: 80, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1164017, _subtype: 108, _value: 25, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  384444: new SpellData(384444, 'Thorim\'s Invocation',
    [
      { _id: 1017065, _subtype: 4, _value: 10, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1072487, _subtype: 4, _value: 100, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1123796, _subtype: 4, _value: 10, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1273320, _subtype: 107, _value: -60000, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1273321, _subtype: 219, _value: 2000, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1273323, _subtype: 219, _value: 2000, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  211094: new SpellData(211094, 'Chain Lightning',
    [
      { _id: 312680, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0.73025 },
    ],
    0,
    0.04),

  456369: new SpellData(456369, 'Amplification Core',
    [
      { _id: 1160528, _subtype: 108, _value: 3, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1160529, _subtype: 108, _value: 3, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  466772: new SpellData(466772, 'Doom Winds',
    [
      { _id: 1179546, _subtype: 108, _value: 100, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1179547, _subtype: 108, _value: 20, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1179548, _subtype: 226, _value: 8, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1179549, _subtype: 218, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1183589, _subtype: 4, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1273057, _subtype: 285, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 8000 }),

  469270: new SpellData(469270, 'Doom Winds',
    [{ _id: 1183500, _subtype: 2, _value: 0, _ap_coefficient: 1.2, _sp_coefficient: 0 }],
    0,
    0),

  114051: new SpellData(114051, 'Ascendance',
    [
      { _id: 127173, _subtype: 6, _value: 15000, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 127176, _subtype: 339, _value: 1254, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 127177, _subtype: 108, _value: 60, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 126979, _subtype: 218, _value: -100, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    180000,
    1500,
    { _duration_ms: 15000 }),

  51533: new SpellData(51533, 'Feral Spirit',
    [{ _id: 36505, _subtype: 6, _value: 15000, _ap_coefficient: 0, _sp_coefficient: 0 }],
    90000,
    1500,
    { _duration_ms: 15000 }),

  114089: new SpellData(114089, 'Windlash',
    [{ _id: 127209, _subtype: 31, _value: 378, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0),

  114093: new SpellData(114093, 'Windlash Off-Hand',
    [{ _id: 127218, _subtype: 31, _value: 378, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0),

  198455: new SpellData(198455, 'Alpha Wolf',
    [{ _id: 291691, _subtype: 2, _value: 0, _ap_coefficient: 0.16, _sp_coefficient: 0 }],
    0,
    0),

  224125: new SpellData(224125, 'Molten Weapon',
    [
      { _id: 335388, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1030539, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1200004, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1200005, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 15000, _max_stacks: 30 }),

  224126: new SpellData(224126, 'Icy Edge',
    [
      { _id: 335390, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1030541, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1200008, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1200009, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 15000, _max_stacks: 30 }),

  224127: new SpellData(224127, 'Crackling Surge',
    [
      { _id: 335392, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 624158, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1200006, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1200007, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 15000, _max_stacks: 30 }),

  333957: new SpellData(333957, 'Feral Spirit',
    [{ _id: 829602, _subtype: 226, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 15000 }),

  344548: new SpellData(344548, 'Ascendance',
    [{ _id: 869020, _subtype: 2, _value: 0, _ap_coefficient: 2.15625, _sp_coefficient: 0 }],
    0,
    0),

  384411: new SpellData(384411, 'Static Accumulation',
    [
      { _id: 1017016, _subtype: 219, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1017017, _subtype: 4, _value: 10, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  384437: new SpellData(384437, 'Static Accumulation',
    [{ _id: 1017055, _subtype: 226, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 15000 }),

  392375: new SpellData(392375, 'Earthen Weapon',
    [
      { _id: 1114282, _subtype: 108, _value: 15, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1114283, _subtype: 108, _value: 15, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 15000, _max_stacks: 30 }),

  453405: new SpellData(453405, 'Whirling Fire',
    [{ _id: 1155235, _subtype: 4, _value: 8000, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 24000 }),

  453406: new SpellData(453406, 'Whirling Earth',
    [
      { _id: 1155240, _subtype: 108, _value: 100, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1160080, _subtype: 4, _value: 150, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 24000 }),

  453409: new SpellData(453409, 'Whirling Air',
    [
      { _id: 1155246, _subtype: 108, _value: -40, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1160020, _subtype: 4, _value: 25, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1160021, _subtype: 4, _value: 3, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1160022, _subtype: 4, _value: 75, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 24000 }),

  455622: new SpellData(455622, 'Tremor',
    [
      { _id: 1159222, _subtype: 2, _value: 0, _ap_coefficient: 1.22382, _sp_coefficient: 0 },
      { _id: 1159269, _subtype: 4, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  444995: new SpellData(444995, 'Surging Totem',
    [{ _id: 1141743, _subtype: 6, _value: 24000, _ap_coefficient: 0, _sp_coefficient: 0 }],
    25000,
    1000,
    { _duration_ms: 24000 }),

  458267: new SpellData(458267, 'Surging Bolt',
    [{ _id: 1164134, _subtype: 2, _value: 0, _ap_coefficient: 1.61, _sp_coefficient: 0 }],
    0,
    0),

  470057: new SpellData(470057, 'Voltaic Blaze',
    [
      { _id: 1184878, _subtype: 3, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1185192, _subtype: 3, _value: 1, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1267929, _subtype: 30, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1267980, _subtype: 3, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    10000,
    1500),

  1259101: new SpellData(1259101, 'Voltaic Blaze',
    [{ _id: 1268023, _subtype: 2, _value: 0, _ap_coefficient: 0, _sp_coefficient: 4 }],
    0,
    0),

  458269: new SpellData(458269, 'Totemic Rebound',
    [
      { _id: 1164136, _subtype: 108, _value: 10, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1164149, _subtype: 108, _value: 10, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 25000, _max_stacks: 10 }),

  1218616: new SpellData(1218616, 'Winning Streak!',
    [
      { _id: 1203591, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1211381, _subtype: 108, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 30000, _max_stacks: 5 }),

  1223332: new SpellData(1223332, 'Electrostatic Wager',
    [{ _id: 1211182, _subtype: 108, _value: 12, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 30000, _max_stacks: 5 }),

  1223410: new SpellData(1223410, 'Electrostatic Wager',
    [{ _id: 1211338, _subtype: 4, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 30000, _max_stacks: 10 }),

  467283: new SpellData(467283, 'Sundering',
    [
      { _id: 1180339, _subtype: 2, _value: 0, _ap_coefficient: 2.5392, _sp_coefficient: 0 },
      { _id: 1180340, _subtype: 3, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1180341, _subtype: 3, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  467386: new SpellData(467386, 'Flametongue Attack',
    [
      { _id: 1180525, _subtype: 2, _value: 0, _ap_coefficient: 0.1188, _sp_coefficient: 0 },
    ],
    0,
    50),

  115356: new SpellData(115356, 'Windstrike',
    [
      { _id: 129136, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 129137, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    7500,
    1500),

  115357: new SpellData(115357, 'Windstrike',
    [{ _id: 129139, _subtype: 2, _value: 0, _ap_coefficient: 2.90628, _sp_coefficient: 0 }],
    0,
    0),

  115360: new SpellData(115360, 'Windstrike Off-Hand',
    [{ _id: 129143, _subtype: 2, _value: 0, _ap_coefficient: 2.90628, _sp_coefficient: 0 }],
    0,
    0),

  187880: new SpellData(187880, 'Maelstrom Weapon',
    [{ _id: 274047, _subtype: 4, _value: 20, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _proc_chance_pct: 20 }),

  197214: new SpellData(197214, 'Sundering',
    [
      { _id: 289629, _subtype: 2, _value: 0, _ap_coefficient: 2.5392, _sp_coefficient: 0 },
      { _id: 290614, _subtype: 3, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 290630, _subtype: 3, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    30000,
    1500),

  344179: new SpellData(344179, 'Maelstrom Weapon',
    [
      { _id: 909275, _subtype: 108, _value: 20, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 909276, _subtype: 108, _value: 20, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0,
    { _duration_ms: 30000, _max_stacks: 10 }),

  454015: new SpellData(454015, 'Tempest',
    [{ _id: 1156250, _subtype: 332, _value: 452201, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _duration_ms: 30000, _max_stacks: 2 }),

  1218047: new SpellData(1218047, 'Primordial Storm',
    [
      { _id: 1202579, _subtype: 42, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1202858, _subtype: 4, _value: 150, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1206347, _subtype: 4, _value: 5, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    0),

  1218090: new SpellData(1218090, 'Primordial Storm',
    [
      { _id: 1202694, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1202695, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
      { _id: 1202696, _subtype: 64, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 },
    ],
    0,
    1500),

  1218113: new SpellData(1218113, 'Primordial Fire',
    [{ _id: 1202739, _subtype: 2, _value: 0, _ap_coefficient: 1.188, _sp_coefficient: 0 }],
    0,
    0),

  1218116: new SpellData(1218116, 'Primordial Frost',
    [{ _id: 1202743, _subtype: 2, _value: 0, _ap_coefficient: 1.188, _sp_coefficient: 0 }],
    0,
    0),

  1218118: new SpellData(1218118, 'Primordial Lightning',
    [{ _id: 1202746, _subtype: 2, _value: 0, _ap_coefficient: 1.188, _sp_coefficient: 0 }],
    0,
    0),

  201900: new SpellData(201900, 'Hot Hand',
    [{ _id: 297542, _subtype: 4, _value: 0, _ap_coefficient: 0, _sp_coefficient: 0 }],
    0,
    0,
    { _proc_chance_pct: 5 }),
};

/**
 * Return required Shaman spell data and fail loudly when a referenced entry is missing.
 */
export function requireShamanSpellData(spellId: number): SpellData {
  const spell = SHAMAN_DBC[spellId];
  if (!spell) {
    throw new Error(`Missing Shaman spell data for spellId=${spellId}`);
  }
  return spell;
}
