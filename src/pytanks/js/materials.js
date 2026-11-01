// Materials: one electrode material as a tank (width = dQ/dU, log-compressed), the shelf of all materials on one
// voltage axis, capacity bars, the overflow weir with particles (LFP, LTO), the LMFP cascade, the S-curve of the
// regular-solution model and all NMC/NCA curves on one axis. Drawn as SVG; the material data come from the caller.
import { C, chart as kitChart, el, fmt, HALO, niceTicks, svgRoot } from './kit.js';

// Material charts: 5 ticks on x, lines break at poles
const chart = (container, opts) => kitChart(container, { height: 260, xTicks: 5, breakPoles: true, ...opts });
export { chart as materialChart };

// Order of the shelf (anodes left, cathodes right)
export const ORDER = ['lithium', 'graphite', 'silicon', 'lto', 'lfp', 'lmfp', 'nmc', 'lco'];

export function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i += 1) {
    if (xs[i] >= x) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1)) * (ys[i] - ys[i - 1]);
  }
  return ys[ys.length - 1];
}

/* Tank (hangs from the ceiling, depth = potential) ------------------------------------------- */
// Width ~ dQ/dU, smoothed with a bell of width sigma (V). Each curve piece (x_j, u_j) -> (x_j+1, u_j+1) spreads its
// lithium evenly over its potential range; folded with the bell this gives a smooth width without spikes.
// Area = capacity; flat pieces (plateaus) become basins, separate plateaus (graphite stages) stay separate.
const SQ2 = Math.SQRT2;
function erf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return z >= 0 ? y : -y;
}
const Phi = (z) => 0.5 * (1 + erf(z / SQ2));
export function profile(xs, us, q, uTop, uBot, n = 300, smooth = 0) {
  const sigma = Math.max(0.003, smooth, (uBot - uTop) / 300);
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const u = uTop + ((uBot - uTop) * i) / n;
    let w = 0;
    for (let j = 0; j < xs.length - 1; j += 1) {
      const dx = q * Math.abs(xs[j + 1] - xs[j]);
      if (!dx) continue;
      const hi = Math.max(us[j], us[j + 1]);
      const lo = Math.min(us[j], us[j + 1]);
      if (u < lo - 6 * sigma || u > hi + 6 * sigma) continue;
      if (hi - lo < 1e-6) w += (dx * Math.exp(-0.5 * ((u - lo) / sigma) ** 2)) / (sigma * Math.sqrt(2 * Math.PI));
      else w += (dx * (Phi((hi - u) / sigma) - Phi((lo - u) / sigma))) / (hi - lo);
    }
    pts.push({ u, w });
  }
  return pts; // u rises (from the ceiling downwards)
}

// Width for the picture: log-compressed, so wide basins and narrow necks are readable at once
// (w0 = median width of the curve, the widest point becomes cap). The area is then no longer to scale.
export function widthScale(ws, cap, min = 1.5) {
  const all = ws.filter(Number.isFinite);
  const wMax = Math.max(...all, 1e-9);
  const pos = all.filter((w) => w > 1e-3 * wMax).sort((a, b) => a - b);
  const w0 = pos[Math.floor(pos.length / 2)] || wMax;
  const den = Math.log(1 + wMax / w0);
  return (w) => Math.max(min, (cap * Math.log(1 + w / w0)) / den);
}

export function drawTank(container, { variants, fill, color, uTop, uBot, ceiling, label }) {
  const W = 360;
  const top = 30;
  const Hpx = 250;
  const H = top + Hpx + 34;
  const pxPerV = Hpx / (uBot - uTop);
  const y = (u) => top + (u - uTop) * pxPerV;
  const svg = svgRoot(container, W, H, label);
  if (ceiling) {
    svg.append(el('rect', { x: 8, y: top - 8, width: W - 16, height: 8, fill: C.metal, opacity: 0.5 }));
    svg.append(el('text', { x: W / 2, y: top - 12, fill: C.muted, 'font-size': 11, 'text-anchor': 'middle' }, 'ceiling = Li/Li⁺ (0 V)'));
  } else {
    svg.append(el('text', { x: W / 2, y: top - 12, fill: C.muted, 'font-size': 11, 'text-anchor': 'middle' }, `ceiling = Li/Li⁺ (0 V) is ${fmt(uTop, 1)} V above this view`));
  }
  for (const t of niceTicks(uTop, uBot, 5)) {
    svg.append(el('line', { x1: 40, x2: W - 8, y1: y(t), y2: y(t), stroke: C.grid }));
    // 0 V is already written at the ceiling bar (and would be hidden below it)
    if (ceiling && t === 0) continue;
    svg.append(el('text', { x: 34, y: y(t), fill: C.muted, 'font-size': 10, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, `${t} V`));
  }
  const cap = 230;
  const cx = 200;
  const shapes = variants.map((v) => profile(v.x, v.u, v.q, uTop, uBot));
  // All outlines (e.g. charge and discharge curve) with the same compression, the widest point becomes cap wide
  const sc = widthScale(shapes.flatMap((sh) => sh.map((p) => p.w)), cap);
  const W_ = (p) => sc(p.w);
  variants.forEach((v, i) => {
    const pts = shapes[i].filter((p) => p.u <= v.u[0] + 1e-9 && p.u >= v.u[v.u.length - 1] - 1e-9);
    if (!pts.length) return;
    if (v.wet) {
      const uS = interp(v.x, v.u, fill);
      const wet = pts.filter((p) => p.u >= uS);
      if (wet.length) {
        const d = [`M${cx + W_(wet[0]) / 2} ${y(uS)}`, ...wet.map((p) => `L${(cx + W_(p) / 2).toFixed(1)} ${y(p.u).toFixed(1)}`),
          ...[...wet].reverse().map((p) => `L${(cx - W_(p) / 2).toFixed(1)} ${y(p.u).toFixed(1)}`), 'Z'];
        svg.append(el('path', { d: d.join(''), fill: C.water, opacity: 0.85 }));
      }
      svg.append(el('line', { x1: 40, x2: W - 8, y1: y(uS), y2: y(uS), stroke: C.muted, 'stroke-dasharray': '3 3' }));
      svg.append(el('text', { x: 44, y: y(uS) - 5, fill: C.cell, 'font-size': 12, 'font-weight': 700, ...HALO }, `${fmt(uS)} V`));
    }
    // Wall open at the top (towards the ceiling), closed at the bottom: left side down, bottom, right side up
    const wall = [...pts.map((p, j) => `${j ? 'L' : 'M'}${(cx - W_(p) / 2).toFixed(1)} ${y(p.u).toFixed(1)}`),
      ...[...pts].reverse().map((p) => `L${(cx + W_(p) / 2).toFixed(1)} ${y(p.u).toFixed(1)}`)];
    svg.append(el('path', { d: wall.join(''), fill: 'none', stroke: v.color ?? color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-dasharray': v.dash }));
  });
  svg.append(el('text', { x: cx, y: H - 8, fill: color, 'font-size': 12, 'font-weight': 600, 'text-anchor': 'middle' }, `${label.split(':')[0]} ${Math.round(fill * 100)} %`));
}

// All NMC/NCA curves on one axis: full end fixed at the theoretical capacity, only the start and the shape change
const NI_COLORS = ['#fde3a7', '#f8c471', '#f5b041', '#f39c12', '#e67e22', '#ff8a80'];
export function drawNmcAll(container, m, current) {
  chart(container, {
    label: 'All NMC and NCA curves on one axis: the full end is fixed at the theoretical capacity, only the start moves',
    xMin: 0, xMax: m.qTheo, yMin: 2.9, yMax: 4.4, xTitle: 'lithium in the material [mAh/g]', yTitle: 'potential vs Li/Li⁺ [V]', height: 280,
    draw(p) {
      p.hline(4.3, 'upper limit 4.3 V', C.warn);
      p.vline(m.qTheo, 2.9, 4.4, C.muted);
      m.variants.forEach((v, i) => {
        if (i === current) return;
        p.line(v.x.map((x, j) => [m.qTheo - v.q + x * v.q, v.uIn[j]]), { stroke: NI_COLORS[i], opacity: 0.8, 'stroke-width': 1.75 });
      });
      const v = m.variants[current];
      p.line(v.x.map((x, j) => [m.qTheo - v.q + x * v.q, v.uIn[j]]), { stroke: NI_COLORS[current], 'stroke-width': 3 });
      // Legend top right (no curve runs there)
      m.variants.forEach((vv, i) => p.label(m.qTheo - 8, 4.2 - i * 0.075, vv.label, NI_COLORS[i], 'end'));
    },
  });
}

/* Shelf: all materials on one voltage axis, area ~ mAh/g ------------------------------------- */
const SHORT = { lithium: 'Li', graphite: 'Gr', silicon: 'Si', lto: 'LTO', lfp: 'LFP', lmfp: 'LMFP', nmc: 'NMC', lco: 'LCO' };

// Returns the svg; with nav every column is marked as a link (the caller binds the clicks).
export function drawShelf(container, data, current, nav) {
  const W = 360;
  const top = 26;
  const pxPerV = 58;
  const uMax = 4.5;
  const H = top + uMax * pxPerV + 40;
  const y = (u) => top + u * pxPerV;
  const svg = svgRoot(container, W, H, 'All materials on one voltage axis: anodes left, cathodes right, tank shapes normalised to the same width');
  svg.append(el('rect', { x: 30, y: top - 6, width: W - 34, height: 6, fill: C.metal, opacity: 0.5 }));
  svg.append(el('text', { x: 34, y: top - 10, fill: C.muted, 'font-size': 10 }, 'ceiling = Li/Li⁺'));
  for (let t = 0; t <= 4; t += 1) {
    svg.append(el('line', { x1: 30, x2: W - 4, y1: y(t), y2: y(t), stroke: C.grid }));
    svg.append(el('text', { x: 26, y: y(t), fill: C.muted, 'font-size': 10, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, `${t} V`));
  }
  svg.append(el('line', { x1: 195, x2: 195, y1: top, y2: H - 30, stroke: C.grid, 'stroke-dasharray': '2 3' }));
  svg.append(el('text', { x: 112, y: H - 4, fill: C.anode, 'font-size': 10, 'text-anchor': 'middle' }, 'anodes'));
  svg.append(el('text', { x: 278, y: H - 4, fill: C.cathode, 'font-size': 10, 'text-anchor': 'middle' }, 'cathodes'));
  // Shape instead of scale: every tank is normalised to the same mean width (the capacity is written below and in the bar chart)
  const slotW = 40;
  ORDER.forEach((slug, i) => {
    const m = data[slug];
    const cx = i < 4 ? 50 + i * 41 : 216 + (i - 4) * 41;
    const color = m.kind === 'anode' ? C.anode : C.cathode;
    const g = el('g', { class: 'shelf-item', opacity: !current || current === slug ? 1 : 0.5, 'data-slug': slug });
    if (nav) { g.setAttribute('role', 'link'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', `${m.name}: open part`); g.style.cursor = 'pointer'; }
    // whole column clickable, not only the (often narrow) tank
    g.append(el('rect', { x: cx - slotW / 2, y: top - 8, width: slotW, height: H - top - 10, fill: 'transparent' }));
    let ext = [top - 5, top + 9]; // vertical extent of the tank for the marker
    if (slug === 'lithium') {
      g.append(el('rect', { x: cx - slotW / 2, y: top - 2, width: slotW, height: 6, fill: C.cell }));
    } else {
      const v = m.variants[m.defaultVariant ?? 0];
      // Only the used window: cut the first and last percent of the fill (steep ends = long thin tails)
      const at = (x) => v.uIn[Math.round(x * (v.uIn.length - 1))];
      const lo = at(0.95);
      const hi = at(0.04);
      const pts = profile(v.x, v.uIn, v.q, Math.max(0, lo), hi, 200, 0.012);
      ext = [y(Math.max(0, lo)) - 4, y(hi) + 4];
      const sc = widthScale(pts.map((p) => p.w), slotW, 3);
      const w = (p) => sc(p.w);
      const d = [...pts.map((p, j) => `${j ? 'L' : 'M'}${(cx - w(p) / 2).toFixed(1)} ${y(p.u).toFixed(1)}`),
        ...[...pts].reverse().map((p) => `L${(cx + w(p) / 2).toFixed(1)} ${y(p.u).toFixed(1)}`), 'Z'];
      g.append(el('path', { d: d.join(''), fill: color, 'fill-opacity': 0.35, stroke: color, 'stroke-width': 1.5 }));
    }
    g.append(el('text', { x: cx, y: H - 30 + 2, fill: color, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle' }, SHORT[slug]));
    g.append(el('text', { x: cx, y: H - 18, fill: C.muted, 'font-size': 9, 'text-anchor': 'middle' }, m.q));
    if (current === slug) g.append(el('rect', { x: cx - slotW / 2 - 1, y: ext[0], width: slotW + 2, height: ext[1] - ext[0], fill: 'none', stroke: C.water, 'stroke-width': 1.5, rx: 4 }));
    svg.append(g);
  });
  svg.append(el('text', { x: 4, y: H - 18, fill: C.muted, 'font-size': 9 }, 'mAh/g'));
  return svg;
}

// Bars: capacity per material (linear; lithium and silicon break the scale - that is the point). Returns the svg.
export function drawCapacity(container, data, current, nav) {
  const W = 360;
  const rowH = 24;
  const top = 8;
  const left = 56;
  const H = top + ORDER.length * rowH + 34;
  const xMax = 4000;
  const x = (v) => left + (v / xMax) * (W - left - 44);
  const svg = svgRoot(container, W, H, 'Capacity per gram of all eight materials as horizontal bars');
  for (const t of [0, 1000, 2000, 3000, 4000]) {
    svg.append(el('line', { x1: x(t), x2: x(t), y1: top, y2: H - 30, stroke: C.grid }));
    svg.append(el('text', { x: x(t), y: H - 16, fill: C.muted, 'font-size': 10, 'text-anchor': 'middle' }, t));
  }
  svg.append(el('text', { x: (left + W - 44) / 2 + 10, y: H - 3, fill: C.text, 'font-size': 10.5, 'text-anchor': 'middle' }, 'capacity [mAh/g]'));
  ORDER.forEach((slug, i) => {
    const m = data[slug];
    const color = m.kind === 'anode' ? C.anode : C.cathode;
    const y = top + i * rowH;
    const g = el('g', { class: 'shelf-item', opacity: !current || current === slug ? 1 : 0.4, 'data-slug': slug });
    if (nav) { g.setAttribute('role', 'link'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', `${m.name}: open part`); g.style.cursor = 'pointer'; }
    g.append(el('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' }));
    g.append(el('text', { x: left - 8, y: y + rowH / 2, fill: color, 'font-size': 11, 'font-weight': 700, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, SHORT[slug]));
    g.append(el('rect', { x: left, y: y + 5, width: Math.max(2, x(m.q) - left), height: rowH - 10, fill: color, 'fill-opacity': 0.55, stroke: color, rx: 2 }));
    g.append(el('text', { x: x(m.q) + 5, y: y + rowH / 2, fill: C.text, 'font-size': 10.5, 'dominant-baseline': 'middle' }, m.q));
    svg.append(g);
  });
  return svg;
}

/* LFP and LTO: overflow weir, particles; LFP: S-curve --------------------------------------------- */
// Weir: two equally narrow necks, left the lithium-poor phase (FePO4), right the lithium-rich one (LiFePO4), each only a few
// percent solid solution. Below the right neck lies the large reservoir: the conversion FePO4 -> LiFePO4, almost the whole
// stoichiometry jump. Depth = potential, water rises from below towards the ceiling. Filling:
// 1) the left neck fills up to the weir crest (one phase, voltage falls steeply),
// 2) plateau: everything spills over the crest into the reservoir; the level one measures stays at the crest,
// 3) reservoir full: the level rises further in the right neck (one phase, voltage falls steeply again).
// Areas proportional to lithium: necks 5 % each, reservoir 90 %. The depth of the reservoir is not a voltage.
export const WEIR = { left: 0.05, right: 0.95 };
// Labels per material (LTO: same drawing, other phases and colour)
const PHASES = {
  lfp: { empty: 'FePO₄', full: 'LiFePO₄', color: C.cathode },
  lto: { empty: 'Li₄Ti₅O₁₂', full: 'Li₇Ti₅O₁₂', color: C.anode },
};
export function drawWeir(container, fill, slug = 'lfp') {
  const ph = PHASES[slug];
  const W = 360;
  const H = 300;
  const svg = svgRoot(container, W, H, `One ${slug.toUpperCase()} particle as two equal narrow tanks joined by an overflow weir; below the right one a large reservoir for turning ${ph.empty} into ${ph.full}`);
  const wN = 30;            // width of both necks
  const hN = 64;            // height of both necks
  const yCrest = 104;       // weir crest = plateau height
  const yTop = yCrest - hN; // top end of the right neck (close to the ceiling)
  const yLeftBottom = yCrest + hN;
  const xL = 60;            // left neck: xL .. xC (room for the label on the left)
  const xC = xL + wN;       // weir crest at the right wall of the left neck
  const xR0 = xC + 44;      // gap: gutter from the crest over to the reservoir
  const xN1 = xR0 + wN;     // right neck: xR0 .. xN1
  const xR = 340;           // right wall of the reservoir
  const gut = 6;            // height of the gutter above the crest
  const hRes = (wN * hN * (WEIR.right - WEIR.left)) / WEIR.left / (xR - xR0); // same area per percent of lithium
  const yResBottom = yCrest + hRes;
  const water = (x, y0, w, h) => svg.append(el('rect', { x, y: y0, width: w, height: Math.max(0, h), fill: C.water, opacity: 0.85 }));
  // 1) left neck
  const l = Math.min(1, fill / WEIR.left);
  water(xL, yLeftBottom - l * hN, wN, l * hN);
  // 2) reservoir; on the plateau a film runs through the gutter and falls into the reservoir
  const r = fill <= WEIR.left ? 0 : Math.min(1, (fill - WEIR.left) / (WEIR.right - WEIR.left));
  water(xR0, yResBottom - r * hRes, xR - xR0, r * hRes);
  if (r > 0 && r < 1) {
    water(xC, yCrest - 2, xR0 - xC + 2, 2);
    svg.append(el('path', { d: `M${xR0} ${yCrest - 2}Q${xR0 + 7} ${yCrest} ${xR0 + 6} ${yResBottom - r * hRes}H${xR0}Z`, fill: C.water, opacity: 0.85 }));
  }
  // 3) right neck (the gutter is then full too)
  if (fill > WEIR.right) {
    const t = (fill - WEIR.right) / (1 - WEIR.right);
    water(xC, yCrest - gut, xR0 - xC, gut);
    water(xR0, yCrest - t * hN, wN, t * hN);
  }
  const stroke = { stroke: ph.color, 'stroke-width': 2.5, fill: 'none', 'stroke-linejoin': 'round' };
  // left neck with roof; the roof continues as the lid of the gutter up to the right neck
  svg.append(el('path', { d: `M${xR0} ${yCrest - gut}H${xL}V${yLeftBottom}H${xC}V${yCrest}H${xR0}`, ...stroke }));
  // right neck and reservoir
  svg.append(el('path', { d: `M${xR0} ${yTop}V${yCrest - gut}M${xR0} ${yCrest}V${yResBottom}H${xR}V${yCrest}H${xN1}V${yTop}`, ...stroke }));
  // weir crest with a small sill
  svg.append(el('path', { d: `M${xC - 4} ${yCrest}h8`, stroke: C.warn, 'stroke-width': 3 }));
  svg.append(el('text', { x: xC, y: yCrest - gut - 8, fill: C.warn, 'font-size': 10, 'text-anchor': 'middle' }, 'weir crest ↓'));
  svg.append(el('text', { x: xL - 6, y: yCrest + hN / 2, fill: C.muted, 'font-size': 10, 'text-anchor': 'end' }, ph.empty));
  svg.append(el('text', { x: xN1 + 8, y: yTop + 12, fill: C.muted, 'font-size': 10 }, ph.full));
  svg.append(el('text', { x: (xR0 + xR) / 2, y: yCrest + 44, fill: C.muted, 'font-size': 10, 'text-anchor': 'middle' }, `reservoir: ${ph.empty} → ${ph.full}`));
  svg.append(el('text', { x: (xR0 + xR) / 2, y: yCrest + 58, fill: C.muted, 'font-size': 9.5, 'text-anchor': 'middle' }, '(its depth is not a voltage)'));
  const phase = fill <= WEIR.left ? 'left tank: empty phase takes up lithium'
    : fill <= WEIR.right ? 'on the plateau: spilling into the reservoir' : 'right tank: full phase gets fuller';
  svg.append(el('text', { x: 12, y: 20, fill: C.cell, 'font-size': 12, 'font-weight': 700 }, `${Math.round(fill * 100)} % · ${phase}`));
}

// Particles: at the edges (5 % solid solution each) all take up lithium at once, on the plateau they convert one after
// another (domino cascade), the others wait at the weir crest. Emptying is the mirror image.
export function drawParticles(container, fill, slug = 'lfp') {
  const n = 8;
  const W = 360;
  const H = 120;
  const svg = svgRoot(container, W, H, `Eight ${slug.toUpperCase()} particles: at the edges they all take up lithium together, on the plateau they convert one after another. Dashed lines mark the edges of the two narrow tanks.`);
  const inner = Math.min(1, Math.max(0, (fill - WEIR.left) / (WEIR.right - WEIR.left)));
  const done = Math.floor(inner * n);
  const part = inner * n - done;
  const top = 20;
  const h = 56;
  for (let i = 0; i < n; i += 1) {
    const x = 14 + i * 42;
    let f;
    if (fill <= WEIR.left || fill > WEIR.right) f = fill;
    else f = i < done ? WEIR.right : i === done ? WEIR.left + part * (WEIR.right - WEIR.left) : WEIR.left;
    svg.append(el('rect', { x, y: top + h - h * f, width: 32, height: h * f, fill: C.water, opacity: 0.85 }));
    for (const g of [WEIR.left, WEIR.right]) svg.append(el('line', { x1: x, x2: x + 32, y1: top + h - h * g, y2: top + h - h * g, stroke: C.warn, 'stroke-width': 1, 'stroke-dasharray': '2 2', opacity: 0.7 }));
    svg.append(el('rect', { x, y: top, width: 32, height: h, fill: 'none', stroke: PHASES[slug].color, 'stroke-width': 2, rx: 3 }));
  }
  const [line1, line2] = fill <= WEIR.left ? ['all particles take up lithium together', 'the voltage falls']
    : fill > WEIR.right ? ['all converted, they fill their last few percent together', 'the voltage falls again']
      : [`${Math.min(done, n)} of ${n} converted, the others wait at the weir`, 'the voltage stays on the plateau'];
  svg.append(el('text', { x: W / 2, y: 96, fill: C.muted, 'font-size': 11, 'text-anchor': 'middle' }, line1));
  svg.append(el('text', { x: W / 2, y: 112, fill: C.muted, 'font-size': 11, 'text-anchor': 'middle' }, line2));
}

// LMFP cascade: only the manganese step is two-phase (weir), the iron step at 60 % Mn is single-phase (Yamada 2001).
// Manganese share from the curve: steepest point between the two steps (discharge curve = lithiation).
export function mnShare(v) {
  let best = { x: 0.6, s: -Infinity };
  for (let i = 1; i < v.x.length; i += 1) {
    if (v.x[i] < 0.3 || v.x[i] > 0.85) continue;
    const s = (v.uIn[i - 1] - v.uIn[i]) / (v.x[i] - v.x[i - 1]);
    if (s > best.s) best = { x: v.x[i], s };
  }
  return best.x;
}
// Filling: 1) narrow left neck (lithium-poor phase, a few %), 2) plateau: everything spills over the crest into the
// manganese reservoir, 3) then the level rises in the wide iron section that narrows towards the top (one phase, no weir).
// Areas proportional to lithium. The depth of the reservoir is not a voltage, the height in the iron section is.
export function drawCascade(container, fill, mn = 0.59) {
  const W = 360;
  const svg = svgRoot(container, W, 300, 'One LMFP particle as a cascade: a narrow tank and a weir for manganese with a reservoir behind it, then an ordinary wide tank for iron without a weir');
  const left = 0.03;
  const wN = 30; const hN = 50;
  const yCrest = 152; const yLeftBottom = yCrest + hN;
  const xL = 60; const xC = xL + wN; const xR0 = xC + 44; const xR = 340; const gut = 6;
  // Iron section: trapezoid above the reservoir, wB wide at the bottom, wT at the top, height hFe
  const wB = 150; const wT = 26; const hFe = 104;
  const feArea = (h) => wB * h - ((wB - wT) * h * h) / (2 * hFe);
  const feTotal = feArea(hFe);
  const pxPerShare = feTotal / (1 - mn); // same area per share of lithium in all parts
  const hRes = ((mn - left) * pxPerShare) / (xR - xR0);
  const yResBottom = yCrest + hRes;
  const wLeft = (left * pxPerShare) / hN; // width of the left neck from its area
  const xLw = xC - Math.max(14, Math.min(wN, wLeft));
  const water = (x, y0, w, h) => svg.append(el('rect', { x, y: y0, width: w, height: Math.max(0, h), fill: C.water, opacity: 0.85 }));
  // 1) left neck
  const l = Math.min(1, fill / left);
  water(xLw, yLeftBottom - l * hN, xC - xLw, l * hN);
  // 2) manganese reservoir with a film through the gutter
  const r = fill <= left ? 0 : Math.min(1, (fill - left) / (mn - left));
  water(xR0, yResBottom - r * hRes, xR - xR0, r * hRes);
  if (r > 0 && r < 1) {
    water(xC, yCrest - 2, xR0 - xC + 2, 2);
    svg.append(el('path', { d: `M${xR0} ${yCrest - 2}Q${xR0 + 7} ${yCrest} ${xR0 + 6} ${yResBottom - r * hRes}H${xR0}Z`, fill: C.water, opacity: 0.85 }));
  }
  // 3) iron section: level from the area (bisection)
  const wAt = (h) => wB - ((wB - wT) * h) / hFe;
  if (fill > mn) {
    const target = Math.min(1, (fill - mn) / (1 - mn)) * feTotal;
    let lo = 0; let hi = hFe;
    for (let k = 0; k < 40; k += 1) { const m = (lo + hi) / 2; if (feArea(m) < target) lo = m; else hi = m; }
    const h = lo;
    water(xC, yCrest - gut, xR0 - xC, gut);
    svg.append(el('path', { d: `M${xR0} ${yCrest}H${xR0 + wB}L${xR0 + wAt(h)} ${yCrest - h}H${xR0}Z`, fill: C.water, opacity: 0.85 }));
  }
  const stroke = { stroke: C.cathode, 'stroke-width': 2.5, fill: 'none', 'stroke-linejoin': 'round' };
  svg.append(el('path', { d: `M${xR0} ${yCrest - gut}H${xLw}V${yLeftBottom}H${xC}V${yCrest}H${xR0}`, ...stroke }));
  svg.append(el('path', { d: `M${xR0} ${yCrest - hFe - 14}V${yCrest - gut}M${xR0} ${yCrest}V${yResBottom}H${xR}V${yCrest}H${xR0 + wB}L${xR0 + wT} ${yCrest - hFe}V${yCrest - hFe - 14}`, ...stroke }));
  svg.append(el('path', { d: `M${xC - 4} ${yCrest}h8`, stroke: C.warn, 'stroke-width': 3 }));
  svg.append(el('text', { x: xR0 - 6, y: yCrest - gut - 8, fill: C.warn, 'font-size': 10, 'text-anchor': 'end' }, 'Mn crest, about 4.0 V ↓'));
  svg.append(el('text', { x: xLw - 6, y: yCrest + hN / 2, fill: C.muted, 'font-size': 10, 'text-anchor': 'end' }, 'empty'));
  svg.append(el('text', { x: xR0 + wAt(48) + 12, y: yCrest - 64, fill: C.muted, 'font-size': 10 }, 'iron, about 3.5 V:'));
  svg.append(el('text', { x: xR0 + wAt(48) + 12, y: yCrest - 51, fill: C.muted, 'font-size': 10 }, 'one phase, no weir'));
  svg.append(el('text', { x: (xR0 + xR) / 2, y: yCrest + hRes / 2, fill: C.muted, 'font-size': 10, 'text-anchor': 'middle' }, `manganese reservoir (${Math.round(mn * 100)} %)`));
  svg.append(el('text', { x: (xR0 + xR) / 2, y: yCrest + hRes / 2 + 14, fill: C.muted, 'font-size': 9.5, 'text-anchor': 'middle' }, '(its depth is not a voltage)'));
  svg.append(el('text', { x: xR0 + wT + 6, y: yCrest - hFe - 2, fill: C.muted, 'font-size': 10 }, '↑ towards the ceiling: full, lower voltage'));
  const phase = fill <= left ? 'empty phase takes up lithium'
    : fill <= mn ? 'manganese step: spilling into the reservoir' : 'iron step: one phase, the level rises';
  svg.append(el('text', { x: 12, y: 20, fill: C.cell, 'font-size': 12, 'font-weight': 700 }, `${Math.round(fill * 100)} % · ${phase}`));
  // fit the height to the content (the reservoir is flat)
  svg.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(Math.max(yLeftBottom, yResBottom) + 16)}`);
}

// Regular-solution model: U = U0 - (RT/F) ln(x/(1-x)) - (Omega/F)(1 - 2x), Omega > 2RT gives the S-curve
export function regularSolution(omegaRT = 4.5, U0 = 3.42) {
  const kT = 0.025693;
  const xs = Array.from({ length: 401 }, (_, i) => 0.002 + (i * 0.996) / 400);
  const U = xs.map((x) => U0 - kT * Math.log(x / (1 - x)) - omegaRT * kT * (1 - 2 * x));
  const dQdU = xs.map((x) => 1 / (-kT / (x * (1 - x)) + 2 * omegaRT * kT)); // capacity 1, sign: filling lowers U
  const d = Math.sqrt(Math.max(0, 0.25 - 1 / (2 * omegaRT))); // turning points: x(1-x) = 1/(2 Omega/RT)
  return { xs, U, dQdU, U0, spin: [0.5 - d, 0.5 + d] };
}

export function drawSCurve(container) {
  const s = regularSolution();
  const [yMin, yMax] = [3.34, 3.5]; // everything of interest lies between the poles (about 3.38 and 3.46 V)
  const top = document.createElement('div');
  const bottom = document.createElement('div');
  container.replaceChildren(top, bottom);
  chart(top, {
    label: 'S-shaped potential of a homogeneous LFP particle (regular solution model) and the flat plateau',
    xMax: 1, yMin, yMax, xTitle: 'filling x', yTitle: 'potential vs Li/Li⁺ [V]', height: 220,
    draw(p) {
      p.band(s.spin[0], s.spin[1], 'rgb(255 138 128 / 0.12)');
      p.hline(s.U0, null, C.water);
      p.line(s.xs.map((x, i) => [x, s.U[i]]), { stroke: C.cathode });
      // left, above the line: there the curve lies below the plateau, the label does not cross it
      p.label(0.05, s.U0 + 0.006, 'plateau (both phases)', C.water);
      p.label(0.5, 3.49, 'spinodal region', C.warn, 'middle');
      p.label(0.04, 3.35, 'evenly filled crystal', C.cathode);
    },
  });
  // like a datasheet: voltage up, dQ/dV to the right; the two normal branches white, the negative branch in warning colour
  const iA = s.xs.findIndex((x) => x >= s.spin[0]);
  const iB = s.xs.findIndex((x) => x >= s.spin[1]);
  const uA = s.U[iA]; // lower turning point (minimum)
  const uB = s.U[iB]; // upper turning point (maximum)
  chart(bottom, {
    label: 'dQ/dV of the S-curve: two poles at the turning points, a negative branch in between, three branches over one voltage',
    xMin: -60, xMax: 60, yMin, yMax, xTitle: 'dQ/dV [1/V]', yTitle: 'potential vs Li/Li⁺ [V]', height: 220, xTicks: 6, breakPoles: false,
    draw(p) {
      p.vline(0, yMin, yMax, C.muted);
      p.hline(s.U0, null, C.water);
      const branch = (a, b) => s.xs.slice(a, b).map((x, k) => [-s.dQdU[a + k], s.U[a + k]]).filter(([d]) => Math.abs(d) < 200);
      p.line(branch(0, iA), { stroke: C.cell });
      p.line(branch(iA, iB), { stroke: C.warn });
      p.line(branch(iB, s.xs.length), { stroke: C.cell });
      p.label(-58, s.U0 + 0.004, 'negative branch', C.warn);
      p.label(58, uA - 0.012, `pole at ${fmt(uA, 3)} V`, C.cell, 'end');
      p.label(58, uB + 0.006, `pole at ${fmt(uB, 3)} V`, C.cell, 'end');
    },
  });
}
