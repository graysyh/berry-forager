// The visual scene — a port of ../scene.py onto a 2D canvas. Geometry is
// in PsychoPy 'height' units (window height = 1, origin at the centre, y
// up) and every constant is the Python one, so layouts match. scene.py
// documents the reasoning behind each choice; comments here only cover
// what is different in a browser.

import { cfg } from './config.js';

// ─── Palette (rgb255) ───────────────────────────────────────────────────
const COL_PANEL = [205, 205, 205];
const COL_PANEL_EDGE = [70, 70, 70];
const COL_BUTTON = [185, 185, 185];
const COL_INK = [25, 25, 25];
const COL_INK_SOFT = [70, 70, 70];
const COL_HIGHLIGHT = [255, 240, 190];
const COL_ON_BUSH = [250, 244, 220];
const COL_GAIN = [255, 250, 225];

const LINE_W = 3;        // outline px at an 800 px tall window
const FONT = '"Open Sans", "Helvetica Neue", Arial, sans-serif';
const LINE_SPACING = 1.36;

const HANG_STAGGER = [0.000, -0.022, 0.014, -0.030, 0.006,
                      -0.014, 0.016, -0.026, -0.006, 0.010];

const CLUSTER_POSITIONS = {
  1: [[0.000, 0.000]],
  2: [[-0.040, 0.005], [0.040, -0.005]],
  3: [[-0.045, -0.022], [0.045, -0.022], [0.000, 0.042]],
  4: [[-0.042, -0.035], [0.042, -0.035], [-0.042, 0.035], [0.042, 0.035]],
  5: [[-0.058, -0.035], [0.058, -0.035], [0.000, 0.000],
      [-0.038, 0.052], [0.038, 0.052]],
  6: [[-0.062, -0.045], [0.000, -0.052], [0.062, -0.045],
      [-0.062, 0.045], [0.000, 0.052], [0.062, 0.045]],
};

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp01 = x => Math.max(0, Math.min(1, x));
const mod = (a, n) => ((a % n) + n) % n;

// ─── Assets ─────────────────────────────────────────────────────────────

export async function loadAssets(base = 'assets/') {
  const man = await (await fetch(base + 'manifest.json')).json();
  const load = file => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('could not load ' + file));
    im.src = base + file;
  });
  const names = Object.keys(man).filter(k => man[k] && man[k].file);
  const imgs = {};
  await Promise.all(names.map(async k => { imgs[k] = await load(man[k].file); }));
  return { man, imgs };
}

// ─── Drawing context in height units ─────────────────────────────────────

class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.W = w; this.H = h; this.U = h;
    this.aspect = w / h;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }
  X(x) { return this.W / 2 + x * this.U; }
  Y(y) { return this.H / 2 - y * this.U; }
  lw() { return LINE_W * this.U / 800; }

  image(im, x, y, w, h, alpha = 1) {
    if (alpha <= 0) return;
    const c = this.ctx, U = this.U;
    c.globalAlpha = alpha;
    c.drawImage(im, this.X(x) - w * U / 2, this.Y(y) - h * U / 2, w * U, h * U);
    c.globalAlpha = 1;
  }

  rect(x, y, w, h, fill, line = null, alpha = 1) {
    const c = this.ctx, U = this.U;
    const px = this.X(x) - w * U / 2, py = this.Y(y) - h * U / 2;
    if (fill) { c.fillStyle = rgb(fill, alpha); c.fillRect(px, py, w * U, h * U); }
    if (line) {
      c.strokeStyle = rgb(line, alpha); c.lineWidth = this.lw();
      c.strokeRect(px, py, w * U, h * U);
    }
  }

  // PsychoPy TextStim-ish: `height` is the font size in height units,
  // anchored at its centre (or `anchorX`/`anchorY` = 'left'|'right',
  // 'top'|'bottom'). Multi-line strings stack downward.
  text(str, x, y, height, color, { bold = false, alpha = 1, anchorX = 'center',
                                   anchorY = 'center', spacing = LINE_SPACING } = {}) {
    if (alpha <= 0 || str === '') return;
    const c = this.ctx, U = this.U;
    const px = height * U;
    c.font = `${bold ? 700 : 400} ${px}px ${FONT}`;
    c.fillStyle = rgb(color, alpha);
    c.textAlign = anchorX;
    c.textBaseline = 'middle';
    const lines = String(str).split('\n');
    const lh = px * spacing;
    const blockH = lh * lines.length;
    let top;
    if (anchorY === 'top') top = this.Y(y);
    else if (anchorY === 'bottom') top = this.Y(y) - blockH;
    else top = this.Y(y) - blockH / 2;
    lines.forEach((ln, i) => c.fillText(ln, this.X(x), top + lh * (i + 0.5)));
  }
}

// ─── Sprites ────────────────────────────────────────────────────────────

class Forager {
  constructor(assets, height) {
    this.H = height;
    const { man, imgs } = assets;
    const ref = man.walker_ref_h;
    // One shared scale: the tallest frame is `height` (see art.sprite_frames).
    this.frames = man.walker_frames.map(k => ({
      im: imgs[k], w: man[k].w / ref * height, h: man[k].h / ref * height }));
  }
  get nFrames() { return this.frames.length; }
  draw(v, x, yFeet, frame = 0) {
    const fr = this.frames[mod(frame, this.frames.length)];
    v.image(fr.im, x, yFeet + fr.h / 2, fr.w, fr.h);
  }
}

class Bush {
  // Canopy geometry of the trunkless mound art (scene.Bush).
  static CANOPY_CY = 0.50;
  static CANOPY_H = 0.90;
  static CANOPY_W = 0.95;

  constructor(images, width) {
    this.width = width;
    this.imgs = images;                   // {state: Image}
    const any = Object.values(images)[0];
    this.h = width * any.naturalHeight / any.naturalWidth;
    this.canopy_y = this.h * Bush.CANOPY_CY;
    this.canopy_h = this.h * Bush.CANOPY_H;
    this.canopy_w = width * Bush.CANOPY_W;
  }
  draw(v, x, yGround, state = 'full') {
    v.image(this.imgs[state], x, yGround + this.h / 2, this.width, this.h);
  }
  drawScaled(v, [cx, cy], scale, state = 'full', opacity = 1) {
    v.image(this.imgs[state], cx, cy - (this.canopy_y - this.h / 2) * scale,
            this.width * scale, this.h * scale, opacity);
  }
}

// ─── Scene ──────────────────────────────────────────────────────────────

export class Scene {
  static BERRY_SIZE = 0.095;
  static CANOPY_ZOOM = 0.30;
  static CANOPY_FRINGE = 0.25;
  static CANOPY_START = 0.85;
  static GROUND_Y = cfg.TRAVEL_GROUND_Y;

  constructor(canvas, assets) {
    this.v = new View(canvas);
    this.assets = assets;
    const { man, imgs } = assets;

    // HUD
    this.hud = { w: 0.21, h: 0.088, y: 0.215 };
    this.hud_berry_pos = [0.0, this.hud.y - 0.017];

    // Travel
    this.walker = new Forager(assets, cfg.TRAVEL_FORAGER_H);
    this.travel_bush = new Bush({ full: imgs.travel_bush_full, picked: imgs.travel_bush_picked },
                                cfg.TRAVEL_BUSH_W);
    this._travel_bush_xs = [0.0, 0.0];
    this._travel_start_x = 0.0;
    this.meadow = imgs.meadow;
    this.splash = imgs.splash;

    // Bush-meter geometry
    this.BAR_W = cfg.BAR_W;
    this.SLOT_W_FRAC = 1.0 / cfg.GRID_SLOTS;
    this.hang_y = cfg.BAR_Y;
    this._grid_spacing = cfg.GRID_BERRY_SIZE * cfg.GRID_BERRY_SPACING_MULT;
    this._note_y = this.hang_y + cfg.NOTE_LIFT;

    // Foliage: one strip, one height unit tall, FOLIAGE_W wide, tiling.
    this.foliageImg = imgs.foliage_strip;
    this.FOLIAGE_W = man.foliage_strip.w / man.foliage_strip.h;
    this.COL_FOLIAGE = man.foliage_mean.map(Math.round);
    this._foliage_x = 0.0;
    this._foliage_y = 0.0;
    this._stripCanvas = null;               // strip pre-scaled to window height

    this._taken_column = null;
    this._pan_pending = false;
    this._panning = false;
    this._entering = false;
    this._search_dir = [1, 0];

    // Berries and stems
    this.berryImg = imgs.berry;
    this._berry_aspect = man.berry.w / man.berry.h;
    this.twigImg = imgs.twig;
    const stemW = cfg.GRID_BERRY_SIZE * cfg.BUNCH_STEM_W_MULT;
    this._stem_wh = [stemW, stemW * man.twig.h / man.twig.w];

    // Selection glow: a soft gaussian blob per berry (sd = radius / 3, as
    // PsychoPy's 'gauss' mask).
    this._glow_d = cfg.GRID_BERRY_SIZE * 2.4;
    this._glowSprite = makeGlowSprite(COL_HIGHLIGHT);

    // Stay pan
    this._prev_lad = null;
    this._prev_taken = null;
    this._stay_pan_pending = false;
    this._stay_pan = false;
    const stemH = this._stem_wh[1];
    const top = this.hang_y + Math.max(...HANG_STAGGER) + stemH;
    const bottom = this.hang_y + Math.min(...HANG_STAGGER)
      - cfg.MAX_REWARD * this._grid_spacing - cfg.GRID_BERRY_SIZE / 2;
    this._stay_pan_dy = Math.max(0.5 + top, 0.5 - bottom) + cfg.GRID_BERRY_SIZE;

    // Arrival
    this.enter_bush = new Bush({ full: imgs.enter_bush_full }, cfg.TRAVEL_BUSH_W);
    this._off = document.createElement('canvas');   // canopy compositing

    // Harvest feedback
    this.cluster_start = [0.0, cfg.BAR_Y];
    this.cluster_end = this.hud_berry_pos;
    this._callout_y = this._note_y;
    this._callout_max_h = Math.max(
      0.030, 2 * ((this.hud.y - this.hud.h / 2) - this._callout_y - 0.006));
    this.popup = { t: 0, duration: 1.4, active: false, reward: 0, positions: [],
                   text: '', textH: 0.10, color: COL_GAIN };
    this.warning = { t: 0, duration: 1.2, active: false, text: 'Too slow!' };

    // Prompt
    this._prompt_center = [0.0, -0.035];
    this.pressed_button = null;
    this.prompt_visible = false;

    this.startButton = { y: -0.35, text: '', overlay: false, textDy: 0 };
  }

  // Geometry that depends on the window's aspect, read live so a resize
  // (entering fullscreen) cannot leave it stale.
  get TRAVEL_SPEED() {
    const halfW = Math.min(this.v.aspect / 2, cfg.SAFE_HALF_W);
    const usable = 2 * (halfW - cfg.TRAVEL_EDGE_MARGIN - cfg.TRAVEL_BUSH_W / 2);
    const maxTravel = Math.max(...cfg.TRAVEL_TIMES) + Math.max(...cfg.DECISION_GAP_RANGE);
    return (usable - 2 * cfg.TRAVEL_STANDOFF) / maxTravel;
  }
  get _stay_pan_dx() {
    return this.v.aspect / 2.0 + this.BAR_W / 2 + cfg.GRID_BERRY_SIZE;
  }
  get _enter_end_size() {
    const cover = Math.sqrt(2) * 1.06 / (1.0 - Scene.CANOPY_FRINGE);
    return [this.v.aspect * cover, cover];
  }

  // Called once per frame by the task before drawing anything.
  beginFrame() {
    this.v.resize();
    const c = this.v.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgb(128,128,128)';           // cfg.BG_COLOR
    c.fillRect(0, 0, this.v.W, this.v.H);
  }

  // ── Background ────────────────────────────────────────────────────
  _drawCover(im) {
    const v = this.v, ia = im.naturalWidth / im.naturalHeight;
    const cover = Math.max(1.0, v.aspect / ia);
    v.image(im, 0, 0, cover * ia, cover);
  }
  _draw_background(scenery = false) { if (scenery) this._drawCover(this.meadow); }

  drawFixation() {
    this._draw_background();
    this.v.text('+', 0, 0, 0.070, COL_INK_SOFT, { bold: true });
  }

  // ── HUD ──────────────────────────────────────────────────────────
  drawHud(total) {
    const v = this.v, h = this.hud;
    v.rect(0, h.y, h.w, h.h, COL_PANEL, COL_PANEL_EDGE);
    v.text('BERRIES', 0, h.y + 0.024, 0.020, COL_INK_SOFT);
    v.text(String(total), ...this.hud_berry_pos, 0.034, COL_INK, { bold: true });
  }

  // ── Patch scene ───────────────────────────────────────────────────
  _pan_offset(f) {
    if (!this._panning) return 0.0;
    return cfg.HARVEST_PAN_DX * (1.0 - clamp01(f)) ** 3;
  }
  _enter_frac(rf) {
    if (!this._entering || rf >= 1.0) return null;
    const f = clamp01(rf) / cfg.ENTER_FRAC;
    return f < 1.0 ? f : null;
  }
  _slide_frac(rf) {
    if (!this._entering) return rf;
    if (rf >= 1.0) return 1.0;
    return clamp01((rf - cfg.ENTER_FRAC) / (1.0 - cfg.ENTER_FRAC));
  }
  _ladder_dx(rf) {
    rf = clamp01(rf);
    if (this._stay_pan && rf < 1.0) {
      const e = rf * rf * (3.0 - 2.0 * rf);
      const [sx, sy] = this._stay_span();
      return [sx * (1.0 - e), sy * (1.0 - e)];
    }
    return [this._pan_offset(this._slide_frac(rf)), 0.0];
  }
  _stay_span() {
    const [ux, uy] = this._search_dir;
    return [ux * this._stay_pan_dx, uy * this._stay_pan_dy];
  }

  // The foliage strip scaled once to exactly one window height in pixels,
  // so the per-frame pattern fill never resamples the 2500 px original.
  _strip() {
    const U = Math.round(this.v.U);
    if (!this._stripCanvas || this._stripCanvas.height !== U) {
      const c = document.createElement('canvas');
      c.height = U;
      c.width = Math.round(U * this.FOLIAGE_W);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(this.foliageImg, 0, 0, c.width, c.height);
      this._stripCanvas = c;
      this._pattern = null;
    }
    return this._stripCanvas;
  }

  // Fill `ctx` with the foliage, zoomed by `scale` about (cx, cy), with the
  // strip's origin at world x = F (see Scene._place_foliage in scene.py
  // for the texture mapping this reproduces).
  _fillFoliage(ctx, F, G, cx = 0, cy = 0, scale = 1) {
    const v = this.v, strip = this._strip();
    const pat = ctx.createPattern(strip, 'repeat');
    const e = v.W / 2 + v.U * (cx + scale * (F - cx));
    const f = v.H / 2 - v.U * (cy + scale * (0.5 + G - cy));
    pat.setTransform(new DOMMatrix([scale * v.U / strip.height, 0, 0,
                                    scale * v.U / strip.height, e, f]));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, v.W, v.H);
  }

  draw_patch(rf = 1.0) {
    const v = this.v;
    const [dx, dy] = this._ladder_dx(rf);
    const f = this._enter_frac(rf);
    if (f === null) {
      this._fillFoliage(v.ctx, mod(this._foliage_x + dx, this.FOLIAGE_W),
                        mod(this._foliage_y + dy, 1.0));
      return;
    }
    const e = f * f;
    const x0 = this._travel_bush_xs[1];
    const y0 = Scene.GROUND_Y + this.travel_bush.canopy_y;
    const w0 = this.travel_bush.canopy_w * Scene.CANOPY_START;
    const h0 = this.travel_bush.canopy_h * Scene.CANOPY_START;
    const [w1, h1] = this._enter_end_size;
    const size = [w0 + (w1 - w0) * e, h0 + (h1 - h0) * e];
    const pos = [x0 * (1.0 - e), y0 * (1.0 - e)];
    const scale = Scene.CANOPY_ZOOM + (1.0 - Scene.CANOPY_ZOOM) * e;

    this._draw_background(true);
    const grow = size[1] / h0;
    this.travel_bush.drawScaled(v, pos, grow);
    const sharp = clamp01((grow - 1.5) / 1.5);
    if (sharp > 0) this.enter_bush.drawScaled(v, pos, grow, 'full', sharp);
    let fade = clamp01((f - 0.30) / 0.50);
    fade = fade * fade * (3.0 - 2.0 * fade);
    if (fade > 0) this._drawCanopy(pos, size, dx, scale, fade);
  }

  // Foliage cut to a w x h ellipse with a raised-cosine feathered edge.
  _drawCanopy([x, y], [w, h], viewDx, scale, opacity) {
    const v = this.v, off = this._off;
    if (off.width !== v.W || off.height !== v.H) { off.width = v.W; off.height = v.H; }
    const c = off.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, v.W, v.H);
    this._fillFoliage(c, this._foliage_x + viewDx, 0.0 - 0.0, x, y, scale);
    // Mask: unit circle scaled to the ellipse; 1 inside 1 - fringe, raised
    // cosine to 0 at the rim.
    c.globalCompositeOperation = 'destination-in';
    c.translate(v.X(x), v.Y(y));
    c.scale(w * v.U / 2, h * v.U / 2);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    const inner = 1 - Scene.CANOPY_FRINGE;
    g.addColorStop(0, 'rgba(0,0,0,1)');
    for (let i = 0; i <= 8; i++) {
      const r = inner + Scene.CANOPY_FRINGE * i / 8;
      const a = 0.5 * (1 + Math.cos(Math.PI * (r - inner) / Scene.CANOPY_FRINGE));
      g.addColorStop(r, `rgba(0,0,0,${a})`);
    }
    c.fillStyle = g;
    c.fillRect(-1000, -1000, 2000, 2000);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    v.ctx.globalAlpha = opacity;
    v.ctx.drawImage(off, 0, 0);
    v.ctx.globalAlpha = 1;
  }

  begin_patch() { this._pan_pending = true; }

  begin_search(direction, lad) {
    this._pan_pending = false;
    this._panning = false;
    this._entering = false;
    this._search_dir = direction.slice();
    this._prev_lad = lad;
    this._prev_taken = this._taken_column;
    this._stay_pan_pending = true;
  }

  begin_harvest() {
    this._taken_column = null;
    this._panning = this._pan_pending;
    this._entering = this._pan_pending;
    this._pan_pending = false;
    this._stay_pan = this._stay_pan_pending;
    this._stay_pan_pending = false;
    if (this._stay_pan) {
      const [sx, sy] = this._stay_span();
      this._foliage_x = mod(this._foliage_x - sx, this.FOLIAGE_W);
      this._foliage_y = mod(this._foliage_y - sy, 1.0);
    }
  }

  // ── Bush-meter ────────────────────────────────────────────────────
  _tier_screen_x(frac) { return -this.BAR_W / 2 + frac * this.BAR_W; }
  slot_center_frac(slot) { return (slot + 0.5) * this.SLOT_W_FRAC; }
  _hang_dy(slot) { return HANG_STAGGER[slot % HANG_STAGGER.length]; }

  _slot_value(lad, slot) {
    let s = 0;
    for (let i = 0; i < lad.slotCounts.length; i++) {
      if (slot < s + lad.slotCounts[i]) return lad.values[i];
      s += lad.slotCounts[i];
    }
    return lad.values.length ? lad.values[lad.values.length - 1] : 0;
  }

  _column_index(lad, tierIdx, xFrac) {
    const n = lad.slotCounts[tierIdx];
    let k = Math.trunc((xFrac - lad.edges[tierIdx]) / this.SLOT_W_FRAC);
    k = Math.max(0, Math.min(n - 1, k));
    let before = 0;
    for (let i = 0; i < tierIdx; i++) before += lad.slotCounts[i];
    return [k, before + k];
  }

  column_pos(lad, tierIdx, xFrac) {
    const [k, slot] = this._column_index(lad, tierIdx, xFrac);
    const val = lad.values[tierIdx];
    const x = this._tier_screen_x(lad.edges[tierIdx] + (k + 0.5) * this.SLOT_W_FRAC);
    const y = this.hang_y + this._hang_dy(slot) - Math.max(val, 1) * this._grid_spacing * 0.5;
    return [x, y];
  }

  mark_taken(lad, tierIdx, xFrac) {
    this._taken_column = this._column_index(lad, tierIdx, xFrac)[1];
  }

  _draw_berries(lad, dx, dy = 0.0, skipColumn = null) {
    const v = this.v;
    const bw = cfg.GRID_BERRY_SIZE * this._berry_aspect, bh = cfg.GRID_BERRY_SIZE;
    const [sw, sh] = this._stem_wh;
    let slot = 0;
    lad.values.forEach((val, i) => {
      const edge = lad.edges[i];
      for (let k = 0; k < lad.slotCounts[i]; k++) {
        const x = this._tier_screen_x(edge + (k + 0.5) * this.SLOT_W_FRAC) + dx;
        const y0 = this.hang_y + this._hang_dy(slot) + dy;
        const tip = y0 - 0.5 * this._grid_spacing + cfg.GRID_BERRY_SIZE * 0.30;
        v.image(this.twigImg, x, tip + sh / 2, sw, sh);
        if (slot !== skipColumn) {
          for (let j = 0; j < val; j++) {
            v.image(this.berryImg, x, y0 - (j + 0.5) * this._grid_spacing, bw, bh);
          }
        }
        slot += 1;
      }
    });
  }

  _draw_cluster_highlight(lad, slot, dx, dy = 0.0) {
    const n = slot === this._taken_column ? 1 : Math.max(this._slot_value(lad, slot), 1);
    const x = this._tier_screen_x(this.slot_center_frac(slot)) + dx;
    const y0 = this.hang_y + this._hang_dy(slot) + dy;
    for (let j = 0; j < Math.min(n, cfg.MAX_REWARD); j++) {
      this.v.image(this._glowSprite, x, y0 - (j + 0.5) * this._grid_spacing,
                   this._glow_d, this._glow_d, 0.85);
    }
  }

  draw_skyline(lad, rf = 1.0, highlightSlot = null) {
    rf = clamp01(rf);
    if (this._enter_frac(rf) !== null) return;
    const [dx, dy] = this._ladder_dx(rf);
    if (this._stay_pan && rf < 1.0 && this._prev_lad !== null) {
      const [sx, sy] = this._stay_span();
      this._draw_berries(this._prev_lad, dx - sx, dy - sy, this._prev_taken);
    }
    if (highlightSlot !== null) this._draw_cluster_highlight(lad, highlightSlot, dx, dy);
    this._draw_berries(lad, dx, dy, this._taken_column);
  }

  draw_search(lad) { this.draw_patch(); this.draw_skyline(lad); }

  draw_search_fade(elapsed) {
    let f;
    if (cfg.SEARCH_FADE_S > 0) {
      f = clamp01(elapsed / cfg.SEARCH_FADE_S);
      f = f * f * (3.0 - 2.0 * f);
    } else f = 1.0;
    const c = this.v.ctx;
    c.fillStyle = rgb(this.COL_FOLIAGE, cfg.SEARCH_FADE_FLOOR * f);
    c.fillRect(0, 0, this.v.W, this.v.H);
  }

  draw_grab(lad, slot) { this.draw_patch(); this.draw_skyline(lad, 1.0, slot); }

  draw_reveal_note(empty = false) {
    if (empty) this._emptyNote();
    this.v.text('Ready...', 0, this._note_y, 0.032, COL_ON_BUSH, { bold: true });
  }
  draw_pick_note(empty = false) {
    const key = cfg.KEY_PICK.toUpperCase();
    if (empty) {
      this._emptyNote();
      this.v.text(`Press [${key}] to continue`, 0, this._note_y, 0.030, COL_ON_BUSH, { bold: true });
    } else {
      this.v.text(`Press [${key}] to pick!`, 0, this._note_y, 0.030, COL_ON_BUSH, { bold: true });
    }
  }
  _emptyNote() {
    this.v.text('No berries left on this bush', 0, this.hang_y - 0.11, 0.045,
                COL_ON_BUSH, { bold: true });
  }

  // ── Warning ───────────────────────────────────────────────────────
  show_warning(msg = 'Too slow!') {
    Object.assign(this.warning, { text: msg, active: true, t: 0 });
  }
  draw_warning(dt) {
    const w = this.warning;
    if (!w.active) return;
    w.t += dt;
    if (w.t >= w.duration) { w.active = false; return; }
    const frac = w.t / w.duration;
    const alpha = frac < 0.15 ? frac / 0.15 : frac < 0.75 ? 1.0
                : Math.max(0.0, 1.0 - (frac - 0.75) / 0.25);
    this.v.text(w.text, 0, this._callout_y, 0.055, COL_ON_BUSH, { bold: true, alpha });
  }

  // ── Reward popup ──────────────────────────────────────────────────
  show_popup(reward) {
    reward = Math.trunc(Math.max(0, Math.min(6, reward)));
    const p = this.popup;
    Object.assign(p, { reward, active: true, t: 0,
                       positions: CLUSTER_POSITIONS[reward] || [] });
    if (reward === 0) {
      p.text = '0'; p.textH = Math.min(0.040, this._callout_max_h); p.color = [205, 205, 190];
    } else {
      p.text = `+${reward}`; p.textH = Math.min(0.042 + 0.007 * reward, this._callout_max_h);
      p.color = COL_GAIN;
    }
  }

  draw_popup(dt) {
    const p = this.popup;
    if (!p.active) return;
    p.t += dt;
    if (p.t >= p.duration) { p.active = false; return; }
    const frac = p.t / p.duration;
    let scale, alpha, ease, ta;
    if (frac < 0.15) scale = 0.55 + (frac / 0.15) * 0.55;
    else if (frac < 0.22) scale = 1.10 - ((frac - 0.15) / 0.07) * 0.10;
    else scale = 1.0;
    if (frac < 0.15) alpha = frac / 0.15;
    else if (frac < 0.85) alpha = 1.0;
    else alpha = Math.max(0.0, 1.0 - (frac - 0.85) / 0.15);
    if (frac < 0.15) ease = 0.0;
    else if (frac < 0.90) { const t = (frac - 0.15) / 0.75; ease = 3 * t * t - 2 * t * t * t; }
    else ease = 1.0;
    const [sx, sy] = this.cluster_start, [ex, ey] = this.cluster_end;
    const cx = sx + (ex - sx) * ease;
    const cy = sy + (ey - sy) * ease + 0.06 * Math.sin(Math.PI * ease);
    if (frac < 0.15) ta = frac / 0.15;
    else if (frac < 0.50) ta = 1.0;
    else if (frac < 0.70) ta = Math.max(0.0, 1.0 - (frac - 0.50) / 0.20);
    else ta = 0.0;

    if (p.reward > 0) {
      const d = Scene.BERRY_SIZE * scale;
      for (const [ox, oy] of p.positions) {
        this.v.image(this.berryImg, cx + ox, cy + oy, d * this._berry_aspect, d, alpha);
      }
    }
    if (ta > 0) {
      const px = Math.max(-0.42, Math.min(0.42, this.cluster_start[0]));
      this.v.text(p.text, px, this._callout_y, p.textH, p.color, { bold: true, alpha: ta });
    }
  }

  // ── Prompt ────────────────────────────────────────────────────────
  show_prompt() { this.prompt_visible = true; this.pressed_button = null; }
  hide_prompt() { this.prompt_visible = false; this.pressed_button = null; }
  set_button_pressed(choice) {
    this.pressed_button = (choice === 'stay' || choice === 'leave') ? choice : null;
  }

  draw_prompt() {
    if (!this.prompt_visible) return;
    const v = this.v, [cx, cy] = this._prompt_center;
    const headerY = cy + 0.100, buttonY = cy - 0.050;
    const bw = 0.214, bh = 0.095, stayX = cx - 0.137, leaveX = cx + 0.137;
    const c = v.ctx;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, v.W, v.H);
    v.rect(cx, cy, 0.58, 0.34, COL_PANEL, COL_PANEL_EDGE);
    v.rect(stayX, buttonY, bw, bh, COL_BUTTON, COL_PANEL_EDGE);
    v.rect(leaveX, buttonY, bw, bh, COL_BUTTON, COL_PANEL_EDGE);
    v.text('Stay or explore?', cx, headerY, 0.038, COL_INK, { bold: true });
    const stayP = this.pressed_button === 'stay', leaveP = this.pressed_button === 'leave';
    if (stayP) v.rect(stayX, buttonY, bw, bh, [0, 0, 0], null, 0.35);
    if (leaveP) v.rect(leaveX, buttonY, bw, bh, [0, 0, 0], null, 0.35);
    const off = -0.004;
    v.text(`STAY\n[${cfg.KEY_STAY.toUpperCase()}]`, stayX, buttonY + (stayP ? off : 0),
           0.028, COL_INK, { bold: true, spacing: 1.25 });
    v.text(`EXPLORE\n[${cfg.KEY_LEAVE.toUpperCase()}]`, leaveX, buttonY + (leaveP ? off : 0),
           0.028, COL_INK, { bold: true, spacing: 1.25 });
  }

  // ── Travel ────────────────────────────────────────────────────────
  begin_travel(duration) {
    const walk = this.TRAVEL_SPEED * duration;
    const span = walk + 2 * cfg.TRAVEL_STANDOFF;
    this._travel_bush_xs = [-span / 2, +span / 2];
    this._travel_start_x = -span / 2 + cfg.TRAVEL_STANDOFF;
    this._foliage_x = mod(this._foliage_x + this.FOLIAGE_W * 0.381966, this.FOLIAGE_W);
    this._foliage_y = 0.0;
    this._travelDuration = duration;
  }

  draw_travel(tElapsed, tTotal) {
    const v = this.v;
    this._draw_background(true);
    const [xLeft, xAhead] = this._travel_bush_xs;
    this.travel_bush.draw(v, xLeft, Scene.GROUND_Y, 'picked');
    this.travel_bush.draw(v, xAhead, Scene.GROUND_Y, 'full');
    const t = Math.max(0.0, Math.min(tTotal, tElapsed));
    // Speed fixed at layout time, so a resize mid-walk cannot move the goal.
    const speed = (this._travel_bush_xs[1] - this._travel_bush_xs[0]
                   - 2 * cfg.TRAVEL_STANDOFF) / tTotal;
    const walked = speed * t;
    const frame = t < tTotal ? Math.trunc(walked / cfg.TRAVEL_FRAME_DIST) : 0;
    this.walker.draw(v, this._travel_start_x + walked, Scene.GROUND_Y, frame);
  }

  // ── Title / end ───────────────────────────────────────────────────
  _drawStartButton() {
    const v = this.v, b = this.startButton;
    v.rect(0, b.y, 0.40, 0.09, COL_BUTTON, COL_PANEL_EDGE);
    if (b.overlay) v.rect(0, b.y, 0.40, 0.09, [0, 0, 0], null, 0.40);
    v.text(b.text, 0, b.y + 0.007 + b.textDy, 0.028, COL_INK, { bold: true });
  }

  draw_title() {
    this._drawCover(this.splash);
    this._drawStartButton();
  }

  draw_end(total) {
    const v = this.v;
    this._draw_background(true);
    v.rect(0, 0.05, 0.62, 0.42, COL_PANEL, COL_PANEL_EDGE);
    v.text('Run complete!', 0, 0.20, 0.044, COL_INK, { bold: true });
    v.text(String(total), 0, 0.05, 0.090, cfg.ACCENT_COLOR, { bold: true });
    v.text('berries collected', 0, -0.07, 0.026, COL_INK_SOFT);
    this._drawStartButton();
  }

  draw_message(lines) {
    this._draw_background(true);
    this.v.rect(0, 0, 0.9, 0.36, COL_PANEL, COL_PANEL_EDGE);
    this.v.text(lines, 0, 0, 0.028, COL_INK);
  }
}

function makeGlowSprite(col) {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  const sd = 1 / 3;
  for (let i = 0; i <= 16; i++) {
    const r = i / 16;
    g.addColorStop(r, rgb(col, i === 16 ? 0 : Math.exp(-(r * r) / (2 * sd * sd))));
  }
  x.fillStyle = g;
  x.fillRect(0, 0, n, n);
  return c;
}
