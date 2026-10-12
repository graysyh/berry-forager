// Data files — the same four CSVs and meta JSON the PsychoPy task writes
// (columns from ../schema.py), formatted the way Python's csv module would
// write them, and handed to the browser as one zip download.

import { cfg } from './config.js';

const ARR_EWMA_FIELDS = cfg.ARR_EWMA_HALFLIVES.map(h => `arr_ewma_${h}`);

export const EVENT_FIELDS = [
  'event_id', 'run_time', 'event_type', 'run_id', 'patch_id', 'harvest_index', 'branch_id',
  'peak_value', 'floor_value', 'n_tiers', 'tier_values', 'tier_edges',
  'peak_center', 'hand_speed', 'sweep_start_x', 'sweep_start_dir', 'press_time',
  'hand_pos_at_press', 'tier_index', 'tier_value', 'reward',
  'max_possible', 'reward_deficit', 'aim_deficit', 'luck', 'timed_out',
  'patch_total_reward', 'total_reward',
  'prompt_id', 'reward_since_last_prompt', 'time_since_last_prompt',
  'crr_peak', 'crr_chance', 'arr', 'mvt_suggested_leave',
  'choice', 'rt', 'missed_response',
  'travel_time', 'travel_base', 'travel_level',
  'n_harvests_here', 'patch_age', 'crr_aim', 'crr_recent',
  ...ARR_EWMA_FIELDS,
  'crr_minus_arr', 'crr_aim_minus_arr_ewma', 'mvt_leave_ewma', 'mvt_leave_opt',
  'mvt_n_opt', 'mvt_rate_opt', 'mvt_tau_h', 'mvt_tau_t', 'mvt_hit_rate',
];
export { ARR_EWMA_FIELDS };

export const PATCH_FIELDS = [
  'run_id', 'patch_id', 'patch_entry_time', 'patch_duration', 'leave_time',
  'n_harvests', 'n_prompts', 'patch_total_reward', 'exit_reason',
  'mean_reward_deficit', 'n_timeouts', 'patch_r0',
  'patch_rate', 'mvt_n_opt_at_leave', 'harvests_vs_optimal',
];

export const TIMELINE_FIELDS = [
  'onset', 'onset_intended', 'phase',
  'run_id', 'patch_id', 'patch_r0', 'harvest_index', 'prompt_id',
  'ladder_peak', 'ladder_chance_ev',
  'tier_value', 'reward', 'patch_total_reward', 'total_reward',
  'choice', 'rt', 'timed_out', 'travel_time', 'travel_base',
];

const TRIGGER_FIELDS = ['volume', 'onset', 'interval'];

// ─── Python-style values ─────────────────────────────────────────────────
// A number the Python task holds as a FLOAT, so it prints as 4.0, not 4.
export class F { constructor(v) { this.v = v; } }
export const f = v => (v === null || v === undefined || v === '') ? v : new F(v);

// round(x, n) as Python does it for the values written here.
export const round = (x, n = 4) => {
  const m = 10 ** n;
  return Math.round(x * m) / m;
};

// repr(float): shortest round-trip digits (as JS), but Python's exponent
// rules and always a decimal point.
export function pyFloat(x) {
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const ax = Math.abs(x);
  if (ax >= 1e16 || ax < 1e-4) {
    let [m, e] = x.toExponential().split('e');
    const n = parseInt(e, 10);
    return `${m}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
  }
  const s = String(x);
  return s.includes('.') || s.includes('e') ? s : s + '.0';
}

// json.dumps of a flat list (", " separators, Python float repr).
export const pyJsonList = (xs, floats = false) =>
  '[' + xs.map(x => floats ? pyFloat(x) : String(x)).join(', ') + ']';

function cell(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof F) return pyFloat(v.v);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : pyFloat(v);
  return String(v);
}

// csv.writer, QUOTE_MINIMAL, '\r\n' line endings.
function csvRow(fields, row) {
  return fields.map(k => {
    const s = cell(row[k]);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',') + '\r\n';
}

export class Logger {
  constructor(info) {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
               `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    this.stem = `sub-${info.participant}_run-${info.run}_${ts}`;
    this.info = info;
    this.events = []; this.patches = []; this.phases = []; this.triggers = [];
    this.eventId = 0;
    this.extra = {};
  }

  logEvent(row) { this.eventId += 1; this.events.push({ ...row, event_id: this.eventId }); }
  logPatch(row) { this.patches.push(row); }
  logPhase(row) {
    this.phases.push({ ...row, onset: f(round(row.onset)),
                       onset_intended: f(round(row.onset_intended)) });
  }

  finalize(extra) { this.extra = extra; }

  files() {
    const csv = (fields, rows) => csvRow(fields, Object.fromEntries(fields.map(k => [k, k])))
      + rows.map(r => csvRow(fields, r)).join('');
    const meta = { session: this.info, params: cfg, ...this.extra };
    return [
      [`${this.stem}_events.csv`, csv(EVENT_FIELDS, this.events)],
      [`${this.stem}_patches.csv`, csv(PATCH_FIELDS, this.patches)],
      [`${this.stem}_timeline.csv`, csv(TIMELINE_FIELDS, this.phases)],
      [`${this.stem}_triggers.csv`, csv(TRIGGER_FIELDS, this.triggers)],
      [`${this.stem}_meta.json`, JSON.stringify(meta, null, 2)],
    ];
  }

  // One zip with all five files, downloaded by the browser.
  download() {
    const blob = makeZip(this.files());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.stem}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return a.download;
  }
}

// ─── Minimal zip (stored, no compression) ───────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, text] of files) {
    const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true); local.setUint16(26, nameB.length, true);
    local.setUint16(28, 0, true);
    chunks.push(local.buffer, nameB, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true); cen.setUint16(28, nameB.length, true);
    cen.setUint32(42, offset, true);
    central.push(cen.buffer, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cenSize = central.reduce((a, c) => a + c.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end.buffer], { type: 'application/zip' });
}
