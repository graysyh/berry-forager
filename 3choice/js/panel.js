// Live MVT read-out in the window margin — a port of ../mvt_panel.py.
// Never draws inside cfg.SAFE_HALF_W; if the window is too narrow for a
// margin it stays off. Toggled with cfg.KEY_DEBUG_TOGGLE ('d').

import { cfg } from './config.js';

const COL_BG = [24, 28, 38], COL_EDGE = [90, 100, 120], COL_LABEL = [150, 162, 180];
const COL_VALUE = [238, 242, 248], COL_PLOT_BG = [16, 20, 28], COL_GRID = [52, 60, 74];
const COL_ARR = [147, 197, 253], COL_CRR = [249, 168, 212], COL_OPT = [134, 239, 172];
const COL_LEAVE = [252, 165, 165], COL_SUGG = [253, 186, 116];
const MAX_MARKERS = 20;
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const verdict = flag => flag ? 'LEAVE' : 'stay';
const fx = (x, d) => x.toFixed(d);

export class MvtPanel {
  constructor(scene) {
    this.scene = scene;
    this._lastTextT = -1e9;
    this.labels = ''; this.values = '';
  }

  get geom() {
    const v = this.scene.v;
    const halfW = v.aspect / 2;
    const x0 = cfg.SAFE_HALF_W + 0.020, x1 = halfW - 0.012;
    return { x0, x1, usable: (x1 - x0) >= 0.20 };
  }
  get usable() { return this.geom.usable; }

  draw(tracker, t) {
    const { x0, x1, usable } = this.geom;
    if (!usable) return;
    const v = this.scene.v, c = v.ctx;
    const snap = tracker.snapshot(t);
    if (t - this._lastTextT >= 1.0 / Math.max(cfg.MVT_PANEL_TEXT_HZ, 0.1)) {
      this._lastTextT = t;
      this._rebuildText(tracker, snap);
    }
    const w = x1 - x0, cx = (x0 + x1) / 2, top = 0.470, bot = -0.470;

    v.rect(cx, (top + bot) / 2, w + 0.016, top - bot + 0.016, COL_BG, COL_EDGE);
    v.text('MVT DEBUG   [d] toggle', cx, top - 0.016, 0.020, COL_LABEL);
    const textTop = top - 0.044;
    v.text(this.labels, x0, textTop, 0.016, COL_LABEL,
           { anchorX: 'left', anchorY: 'top', spacing: 1.45 });
    v.text(this.values, x1, textTop, 0.016, COL_VALUE,
           { anchorX: 'right', anchorY: 'top', spacing: 1.45 });

    // ── plot ──
    const pH = 0.250, pBot = bot + 0.050, pTop = pBot + pH;
    const pX0 = x0 + 0.030, pX1 = x1;
    v.rect((pX0 + pX1) / 2, (pBot + pTop) / 2, pX1 - pX0, pH, COL_PLOT_BG, COL_GRID);

    const entries = [['ARR', COL_ARR], ['CRR', COL_CRR], ['R*', COL_OPT],
                     ['left', COL_LEAVE], ['MVT', COL_SUGG]];
    entries.forEach(([txt, col], i) => v.text(
      txt, pX0 + (pX1 - pX0) * (i + 0.5) / entries.length, pTop + 0.010, 0.0145, col,
      { anchorY: 'bottom' }));

    const winS = cfg.MVT_PANEL_WINDOW_S;
    const t1 = Math.max(t, winS), t0 = t1 - winS;
    const sx = x => pX0 + Math.max(0, Math.min(1, t1 <= t0 ? 0 : (x - t0) / (t1 - t0))) * (pX1 - pX0);
    const warmup = Math.max(cfg.LADDER_REVEAL_S * 2, tracker.policy.tau_h);
    const pts = tracker.series.filter(p => p[0] >= Math.max(t0, warmup));
    const arrPts = pts.map(p => [p[0], p[1]]);
    const crrRaw = pts.filter(p => p[2] !== null).map(p => [p[0], p[2]]);
    const crrPts = [];
    crrRaw.forEach(([x, y], i) => { if (i) crrPts.push([x, crrRaw[i - 1][1]]); crrPts.push([x, y]); });
    if (crrRaw.length) crrPts.push([t1, crrRaw[crrRaw.length - 1][1]]);
    const yMax = Math.max(snap.rate_opt, ...arrPts.map(p => p[1]), ...crrPts.map(p => p[1]), 0.1) * 1.15;
    const sy = y => pBot + Math.max(0, Math.min(1, yMax <= 0 ? 0 : y / yMax)) * pH;

    v.text(fx(yMax, 2), pX0 - 0.005, pTop, 0.015, COL_LABEL, { anchorX: 'right', anchorY: 'top' });
    v.text('0', pX0 - 0.005, pBot, 0.015, COL_LABEL, { anchorX: 'right', anchorY: 'bottom' });
    v.text(`last ${winS}s`, (pX0 + pX1) / 2, pBot - 0.004, 0.014, COL_LABEL, { anchorY: 'top' });

    const line = (ptsU, col) => {
      if (ptsU.length < 2) return;
      c.strokeStyle = rgb(col); c.lineWidth = 2 * v.U / 800;
      c.beginPath();
      ptsU.forEach(([x, y], i) => i ? c.lineTo(v.X(x), v.Y(y)) : c.moveTo(v.X(x), v.Y(y)));
      c.stroke();
    };
    const yOpt = sy(snap.rate_opt);
    line([[pX0, yOpt], [pX1, yOpt]], COL_OPT);
    line(arrPts.map(([x, y]) => [sx(x), sy(y)]), COL_ARR);
    line(crrPts.map(([x, y]) => [sx(x), sy(y)]), COL_CRR);

    const recent = tracker.prompts.filter(p => p.run_time >= Math.max(t0, warmup));
    const sugg = recent.filter(p => p.mvt_suggested_leave).slice(-MAX_MARKERS);
    const left = recent.filter(p => p.choice === 'leave').slice(-MAX_MARKERS);
    c.fillStyle = rgb(COL_SUGG);
    for (const p of sugg) {
      const x = sx(p.run_time), y = sy(p.crr_peak) + 0.014;
      c.beginPath();
      c.moveTo(v.X(x), v.Y(y + 0.009));
      c.lineTo(v.X(x - 0.007), v.Y(y - 0.005));
      c.lineTo(v.X(x + 0.007), v.Y(y - 0.005));
      c.closePath(); c.fill();
    }
    for (const p of left) v.rect(sx(p.run_time), sy(p.crr_peak), 0.010, 0.010, COL_LEAVE);
  }

  _rebuildText(tracker, s) {
    const m = Math.floor(s.t / 60), sec = Math.floor(s.t) % 60;
    const last = tracker.prompts.length ? tracker.prompts[tracker.prompts.length - 1] : null;
    const rows = [
      ['run / patch', `${m}:${String(sec).padStart(2, '0')}   p${s.patch_id}`],
      ['berries', `${s.total_reward}`],
      ['harvests here', `${s.patch_harvests}   (age ${fx(s.patch_age, 0)}s)`],
      ['', ''],
    ];
    if (last) rows.push(['CRR peak', fx(last.crr_peak, 3)], ['CRR aim', fx(last.crr_aim, 3)],
                        ['CRR blind', fx(last.crr_chance, 3)]);
    else rows.push(['CRR peak', '-'], ['CRR aim', '-'], ['CRR blind', '-']);
    rows.push(['CRR recent', fx(s.crr_recent, 3)], ['', ''], ['ARR cum', fx(s.arr_cum, 3)]);
    cfg.ARR_EWMA_HALFLIVES.forEach((hl, i) => rows.push([`ARR ewma ${hl}s`, fx(s.arr_ewma[i], 3)]));
    const [lo, hi] = s.flat_span;
    rows.push(['R* optimal', fx(s.rate_opt, 3)], [`N* (flat ${lo}-${hi})`, `${s.n_opt}`], ['', '']);
    if (last) rows.push(['rule CRR<ARR', verdict(last.mvt_suggested_leave)],
                        ['rule ewma', verdict(last.mvt_leave_ewma)],
                        ['rule optimal', verdict(last.mvt_leave_opt)],
                        ['last choice', String(last.choice ?? '-')]);
    else rows.push(['rule CRR<ARR', '-'], ['rule ewma', '-'], ['rule optimal', '-'], ['last choice', '-']);
    rows.push(['', ''],
      ['cycle/travel/hit', `${fx(s.mean_cycle, 1)} / ${fx(s.mean_travel, 1)} / ${fx(100 * s.hit_rate, 0)}%`],
      ['prompts/left/MVT', `${s.n_prompts} / ${s.n_leaves} / ${s.n_suggested}`],
      ['agreement', `${fx(100 * s.agreement, 0)}%`]);
    this.labels = rows.map(r => r[0]).join('\n');
    this.values = rows.map(r => r[1]).join('\n');
  }
}
