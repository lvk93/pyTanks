// Lithium balance: tanks hanging from the Li/Li+ ceiling, electrode potentials, cell voltage, lithium account and the
// fill gauge, drawn as SVG into a container element. The cell comes from model/linearCell.js (linear or real curves).
// These are the drawings of the lithium-balance chapter on chargetanks.com, which loads them from here.
import { LINEAR_ANODE } from './model/linearCell.js';
import { chart, el, fmt, fs, niceTicks, pct, svgRoot, T, use } from './kit.js';

/* Tank picture ------------------------------------------------------------------------------- */
// Ceiling = Li/Li+ at the top; depth below the ceiling = potential. Tank width ~ dQ/dU, area ~ capacity.
// Linear tanks are rectangles; real curves (graphite, NMC) give steps or funnels. Very flat
// plateaus would be infinitely wide, so the width is capped per tank.
export const PX_PER_V = 60;
export const K_WIDTH = 150 / (16 / (LINEAR_ANODE.empty - LINEAR_ANODE.full)); // linear anode with 16 Ah = 150 px

export function tankProfile(U, q, { uMin = -Infinity, cap }) {
  const n = 220;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const f = i / n;
    const u = U(f);
    if (u >= uMin) pts.push({ f, u });
  }
  // Width from the slope df/du over a potential window (smooths noise, keeps straight lines constant)
  const h = 0.025;
  for (const p of pts) {
    let fLo = Infinity;
    let fHi = -Infinity;
    let uLo = Infinity;
    let uHi = -Infinity;
    for (const o of pts) {
      if (Math.abs(o.u - p.u) > h) continue;
      fLo = Math.min(fLo, o.f); fHi = Math.max(fHi, o.f);
      uLo = Math.min(uLo, o.u); uHi = Math.max(uHi, o.u);
    }
    p.w = Math.min(cap, (K_WIDTH * q * (fHi - fLo)) / Math.max(uHi - uLo, 0.004));
  }
  return pts; // f rises, u falls (towards the ceiling)
}

export function drawTanks(container, cell, x, { only } = {}) {
  use(container);
  const W = 360;
  const top = 30;
  const H = top + 4.45 * PX_PER_V + 26;
  const y = (u) => top + u * PX_PER_V;
  const svg = svgRoot(container, W, H, only === 'cathode'
    ? 'One cathode tank hanging from the Li/Li+ ceiling' : 'Anode and cathode tanks hanging from the Li/Li+ ceiling');

  // Ceiling
  svg.append(el('rect', { x: 8, y: top - 8, width: W - 16, height: 8, fill: T.metal, opacity: 0.5 }));
  svg.append(el('line', { x1: 8, x2: W - 8, y1: top, y2: top, stroke: T.metal, 'stroke-width': 1.5 }));
  svg.append(el('text', { x: W / 2, y: top - 12, fill: T.muted, 'font-size': fs(11), 'text-anchor': 'middle' }, 'ceiling = Li/Li⁺ (0 V)'));

  // Symmetric tank: dQ/dU split half to the left and half to the right of the centre line
  function tank({ x0, pts, fill, color, name }) {
    const bottom = pts[0];
    const last = pts[pts.length - 1];
    const level = Math.min(1, Math.max(0, fill));
    const yBot = y(bottom.u);
    const maxW = Math.max(...pts.map((p) => p.w));
    const cx = x0 + maxW / 2;
    const L = (p) => (cx - p.w / 2).toFixed(1);
    const R = (p) => (cx + p.w / 2).toFixed(1);
    const Y = (p) => y(p.u).toFixed(1);
    // Water: everything below the surface (fill <= fill)
    const wet = pts.filter((p) => p.f <= level);
    const surfU = level >= last.f ? last.u : interpU(pts, level);
    const surf = { u: surfU, w: wet.length ? wet[wet.length - 1].w : bottom.w };
    if (level > 0 && wet.length) {
      const water = [`M${R(wet[0])} ${Y(wet[0])}`, ...wet.map((p) => `L${R(p)} ${Y(p)}`), `L${R(surf)} ${Y(surf)}`,
        `L${L(surf)} ${Y(surf)}`, ...[...wet].reverse().map((p) => `L${L(p)} ${Y(p)}`), 'Z'];
      svg.append(el('path', { d: water.join(''), fill: T.water, opacity: 0.85 }));
    }
    const rim = y(last.u) - 3;
    const wall = [`M${L(last)} ${rim.toFixed(1)}`, ...[...pts].reverse().map((p) => `L${L(p)} ${Y(p)}`),
      ...pts.map((p) => `L${R(p)} ${Y(p)}`), `L${R(last)} ${rim.toFixed(1)}`];
    svg.append(el('path', { d: wall.join(''), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    svg.append(el('text', { x: cx, y: yBot + 16, fill: color, 'font-size': fs(12), 'font-weight': 600, 'text-anchor': 'middle' }, `${name} ${pct(level)}`));
    return { maxW, ySurf: y(surfU), yTop: y(last.u), x0, yBot };
  }

  const cathPts = tankProfile(cell.cathodeU, cell.qCath, { uMin: cell.real ? 3.3 : -Infinity, cap: 12 * cell.qCath });
  const cathW = Math.max(...cathPts.map((p) => p.w));
  const ca = tank({ x0: only === 'cathode' ? (W - cathW) / 2 : W - 16 - cathW, pts: cathPts, fill: cell.fillCath(x), color: T.cathode, name: 'Cathode' });

  if (only === 'cathode') {
    // Half cell: potential = distance from the ceiling to the water surface
    const xv = ca.x0 - 22;
    svg.append(el('line', { x1: xv, x2: xv, y1: top, y2: ca.ySurf, stroke: T.cell, 'stroke-width': 1.5 }));
    svg.append(el('path', { d: `M${xv - 4} ${top + 6}L${xv} ${top}L${xv + 4} ${top + 6}M${xv - 4} ${ca.ySurf - 6}L${xv} ${ca.ySurf}L${xv + 4} ${ca.ySurf - 6}`, stroke: T.cell, fill: 'none', 'stroke-width': 1.5 }));
    svg.append(el('line', { x1: xv, x2: ca.x0, y1: ca.ySurf, y2: ca.ySurf, stroke: T.muted, 'stroke-dasharray': '3 3' }));
    svg.append(el('text', { x: xv - 8, y: (top + ca.ySurf) / 2, fill: T.cell, 'font-size': fs(13), 'font-weight': 700, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, `${fmt(cell.uCath(x))} V`));
    svg.append(el('text', { x: xv - 8, y: (top + ca.ySurf) / 2 + 16, fill: T.muted, 'font-size': fs(11), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, 'vs Li/Li⁺'));
    return;
  }

  const anPts = tankProfile(cell.anodeU, cell.qAnode, { cap: 10 * cell.qAnode });
  const an = tank({ x0: 16, pts: anPts, fill: cell.fillAnode(x), color: T.anode, name: 'Anode' });

  // Plating: what no longer fits into the anode tank becomes part of the ceiling
  const plated = cell.plated(x);
  let anodeSurface = an.ySurf;
  if (plated > 1e-6) {
    anodeSurface = top;
    svg.append(el('rect', { x: 16, y: top, width: an.maxW, height: Math.max(3, an.yTop - top), fill: T.metal }));
    svg.append(el('text', { x: 16, y: an.yBot + 32, fill: T.warn, 'font-size': fs(11), 'font-weight': 600 }, `plating: ${fmt(plated)} Ah Li metal`));
  }

  // Cell voltage = height difference of the two water surfaces
  const xv = Math.max(16 + an.maxW + 30, (16 + an.maxW + ca.x0) / 2);
  const v = cell.vCell(x);
  svg.append(el('line', { x1: 16 + an.maxW / 2, x2: xv + 8, y1: anodeSurface, y2: anodeSurface, stroke: T.muted, 'stroke-dasharray': '3 3' }));
  svg.append(el('line', { x1: xv - 8, x2: ca.x0 + 6, y1: ca.ySurf, y2: ca.ySurf, stroke: T.muted, 'stroke-dasharray': '3 3' }));
  svg.append(el('line', { x1: xv, x2: xv, y1: anodeSurface, y2: ca.ySurf, stroke: T.cell, 'stroke-width': 1.5 }));
  svg.append(el('path', { d: `M${xv - 4} ${anodeSurface + 6}L${xv} ${anodeSurface}L${xv + 4} ${anodeSurface + 6}M${xv - 4} ${ca.ySurf - 6}L${xv} ${ca.ySurf}L${xv + 4} ${ca.ySurf - 6}`, stroke: T.cell, fill: 'none', 'stroke-width': 1.5 }));
  svg.append(el('text', { x: xv + 8, y: (anodeSurface + ca.ySurf) / 2, fill: T.cell, 'font-size': fs(13), 'font-weight': 700, 'dominant-baseline': 'middle' }, `${fmt(v)} V`));
  svg.append(el('text', { x: xv + 8, y: (anodeSurface + ca.ySurf) / 2 + 16, fill: T.muted, 'font-size': fs(11), 'dominant-baseline': 'middle' }, 'cell voltage'));
}

// Potential at fill f from the points of the profile
export function interpU(pts, f) {
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i].f >= f) {
      const a = pts[i - 1];
      const b = pts[i];
      return a.u + ((f - a.f) / (b.f - a.f || 1)) * (b.u - a.u);
    }
  }
  return pts[pts.length - 1].u;
}

/* Charts ------------------------------------------------------------------------------------- */
export function sample(f, x0, x1, n = 160) {
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const xx = x0 + ((x1 - x0) * i) / n;
    out.push([xx, f(xx)]);
  }
  return out;
}

export function drawElectrodes(container, cell, x, xMax) {
  use(container);
  chart(container, {
    label: 'Electrode potentials against Li/Li+ over the lithium in the anode',
    // same height as the tank picture, so both stand side by side at the same size
    xMax, yMin: 0, yMax: 4.5, xTitle: 'lithium in the anode [Ah]', yTitle: 'potential vs Li/Li⁺ [V]', height: 30 + 4.45 * PX_PER_V + 26,
    draw(p) {
      p.hline(0, null, T.metal, '2 3');
      p.label(0.2, 0.12, 'ceiling Li/Li⁺', T.metal);
      p.band(cell.xMin, cell.xMax, T.window);
      p.line(sample(cell.uCath, cell.xLo, cell.xHi, 240), { stroke: T.cathode });
      const xFull = Math.min(cell.xHi, cell.qAnode);
      const anode = sample(cell.uAnode, 0, xFull, 240);
      if (cell.xHi > cell.qAnode) anode.push([cell.qAnode + 1e-9, 0], [cell.xHi, 0]);
      // Rest of the anode tank that the lithium never reaches (anode too big): dashed up to full
      if (cell.qAnode > cell.xHi + 1e-9) {
        p.line(sample(cell.uAnode, cell.xHi, cell.qAnode, 120), { stroke: T.anode, 'stroke-dasharray': '6 5', opacity: 0.7 });
      }
      p.line(anode, { stroke: T.anode });
      p.vline(x, cell.uAnode(x), cell.uCath(x), T.cell);
      p.dot(x, cell.uCath(x), T.cathode);
      p.dot(x, cell.uAnode(x), T.anode);
      p.label(0.2, 4.15, 'cathode', T.cathode);
      p.label(0.2, 1.05, 'anode', T.anode);
    },
  });
}

export function drawCell(container, cell, x, xMax, ref = null) {
  use(container);
  chart(container, {
    label: 'Cell voltage over the lithium in the anode with Vmin and Vmax',
    xMax, yMin: 2.8, yMax: 4.5, xTitle: 'lithium in the anode [Ah]', yTitle: 'cell voltage [V]', height: 200,
    draw(p) {
      p.band(cell.xMin, cell.xMax, T.windowStrong);
      // fresh cell for comparison (aging), shifted to the same starting point
      if (ref) {
        const dx = ref.xMin - cell.xMin;
        p.line(sample((xx) => ref.vCell(xx + dx), ref.xLo - dx, ref.xHi - dx, 240), { stroke: T.muted, 'stroke-dasharray': '5 4', 'stroke-width': 1.75 });
      }
      p.hline(cell.vMax, `Vmax ${fmt(cell.vMax)} V`, T.warn);
      p.hline(cell.vMin, `Vmin ${fmt(cell.vMin)} V`, T.warn);
      p.line(sample(cell.vCell, cell.xLo, cell.xHi, 240), { stroke: T.cell });
      p.dot(x, cell.vCell(x), T.water);
    },
  });
}

// Lithium account as a waterfall (vertical bars): cathode in operation, + bonus, (+ prelithiation), - SEI,
// = lithium in operation. The dashed line is the room in the cathode.
export function drawAccount(container, acc) {
  use(container);
  const W = 360;
  const H = 240;
  const m = { l: 40, r: 10, t: 24, b: 46 };
  const top = acc.firstCharge + acc.prelith;
  const yMax = Math.ceil(top + 0.6);
  // Axis starts just below the shortest bar end, so bonus and SEI stay visible
  const yMin = Math.max(0, Math.floor(Math.min(acc.li, acc.qCathRev)) - 2);
  const svg = svgRoot(container, W, H, 'Lithium account of the formation as a waterfall chart');
  const py = (v) => H - m.b - ((Math.max(v, yMin) - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  for (const t of niceTicks(yMin, yMax)) {
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: py(t), y2: py(t), stroke: T.grid }));
    svg.append(el('text', { x: m.l - 6, y: py(t), fill: T.muted, 'font-size': fs(10), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, t));
  }
  svg.append(el('text', { x: 12, y: (m.t + H - m.b) / 2, fill: T.text, 'font-size': fs(11), 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})` }, 'lithium [Ah]'));
  const bars = [
    { name: ['cathode', 'in operation'], from: 0, to: acc.qCathRev, color: T.cathode, total: true },
    { name: ['formation', 'bonus'], from: acc.qCathRev, to: acc.firstCharge, color: T.anode },
  ];
  if (acc.prelith > 1e-9) bars.push({ name: ['prelithi-', 'ation'], from: acc.firstCharge, to: top, color: T.metal });
  bars.push({ name: ['SEI'], from: top, to: acc.li, color: T.warn });
  bars.push({ name: ['lithium', 'in operation'], from: 0, to: acc.li, color: T.water, total: true });
  const slot = (W - m.l - m.r) / bars.length;
  bars.forEach((b, i) => {
    const x0 = m.l + i * slot + slot * 0.18;
    const w = slot * 0.64;
    const lo = Math.min(b.from, b.to);
    const hi = Math.max(b.from, b.to);
    svg.append(el('rect', { x: x0, y: py(hi), width: w, height: Math.max(1, py(lo) - py(hi)), fill: b.color, rx: 2 }));
    const delta = b.to - b.from;
    const text = b.total ? fmt(b.to) : delta >= 0 ? `+${fmt(delta)}` : `−${fmt(-delta)}`;
    svg.append(el('text', { x: x0 + w / 2, y: py(hi) - 5, fill: T.text, 'font-size': fs(11), 'font-weight': 600, 'text-anchor': 'middle' }, text));
    b.name.forEach((line, j) => svg.append(el('text', { x: x0 + w / 2, y: H - m.b + 14 + j * 12, fill: T.muted, 'font-size': fs(10), 'text-anchor': 'middle' }, line)));
    if (i < bars.length - 1) {
      svg.append(el('line', { x1: x0 + w, x2: x0 + slot, y1: py(b.to), y2: py(b.to), stroke: T.muted, 'stroke-dasharray': '2 2' }));
    }
  });
  // Room in the cathode for comparison: lithium below the line means a gap in the cathode
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: py(acc.qCathRev), y2: py(acc.qCathRev), stroke: T.cathode, 'stroke-dasharray': '5 4', opacity: 0.7 }));
  // Legend top left, where there are no bars
  svg.append(el('line', { x1: m.l + 6, x2: m.l + 26, y1: 10, y2: 10, stroke: T.cathode, 'stroke-dasharray': '5 4', opacity: 0.85 }));
  svg.append(el('text', { x: m.l + 30, y: 10, fill: T.cathode, 'font-size': fs(10), 'dominant-baseline': 'middle', opacity: 0.9 }, 'room in the cathode'));
}

// Fill of the anode at Vmax as a large bar: in the tank picture the difference is hard to see by eye
export function drawFillGauge(container, fill) {
  use(container);
  const W = 360;
  const H = 74;
  const x0 = 16;
  const x1 = W - 16;
  const svg = svgRoot(container, W, H, `Anode filled to ${pct(fill)} at Vmax`);
  const xf = x0 + (x1 - x0) * Math.min(1, fill);
  svg.append(el('text', { x: x0, y: 16, fill: T.text, 'font-size': fs(12), 'font-weight': 600 }, 'Anode at Vmax'));
  svg.append(el('text', { x: x1, y: 16, fill: T.muted, 'font-size': fs(11), 'text-anchor': 'end' }, `room to the ceiling: ${pct(1 - fill)}`));
  svg.append(el('rect', { x: x0, y: 26, width: x1 - x0, height: 26, rx: 4, fill: T.faint, stroke: T.anode, 'stroke-width': 1.5 }));
  svg.append(el('rect', { x: x0, y: 26, width: xf - x0, height: 26, rx: 4, fill: T.water, opacity: 0.9 }));
  svg.append(el('text', { x: xf - 8, y: 44, fill: T.bg, 'font-size': fs(15), 'font-weight': 700, 'text-anchor': 'end' }, pct(fill)));
  svg.append(el('line', { x1, x2: x1, y1: 22, y2: 58, stroke: T.metal, 'stroke-width': 2 }));
  svg.append(el('text', { x: x1, y: 70, fill: T.muted, 'font-size': fs(10), 'text-anchor': 'end' }, 'full = ceiling'));
}
