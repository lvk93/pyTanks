// Blended anode (silicon + graphite): two tanks joined by a pipe, the potential of the blend, how the lithium splits,
// and dQ/dV for taking a blend apart. Drawn as SVG; the electrode comes from model/blendTanks.js.
import { sample } from './balance.js';
import { C, chart, el, fmt, pct, svgRoot } from './kit.js';

// Blended anode: 10 Ah, shares of silicon and graphite in the capacity
export const Q_BLEND = 10;
export const U_RANGE = 0.7;      // potential range of the blend pictures vs Li/Li+

/* Tanks, potential, split and dQ/dV ---------------------------------------------------------- */
export const BLEND_PX_PER_V = 380;

// Tank profile of one blend component: width ~ dQ/dU, smoothed over a small potential window and capped
export function blendProfile(U, q, cap) {
  const n = 200;
  const pts = [];
  for (let i = 0; i <= n; i += 1) pts.push({ f: i / n, u: U(i / n) });
  const h = 0.008;
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
    p.w = Math.max(14, Math.min(cap, (2.6 * q * (fHi - fLo)) / Math.max(uHi - uLo, 0.002)));
  }
  return pts.filter((p) => p.u <= U_RANGE && p.u >= 0);
}

export function drawBlendTanks(container, blend, q) {
  const W = 360;
  const top = 30;
  const y = (u) => top + u * BLEND_PX_PER_V;
  const H = top + U_RANGE * BLEND_PX_PER_V + 34;
  const svg = svgRoot(container, W, H, 'Silicon and graphite tanks of a blended anode, connected at the bottom');
  svg.append(el('rect', { x: 8, y: top - 8, width: W - 16, height: 8, fill: C.metal, opacity: 0.5 }));
  svg.append(el('line', { x1: 8, x2: W - 8, y1: top, y2: top, stroke: C.metal, 'stroke-width': 1.5 }));
  svg.append(el('text', { x: W / 2, y: top - 12, fill: C.muted, 'font-size': 11, 'text-anchor': 'middle' }, 'ceiling = Li/Li⁺ (0 V)'));
  const uS = blend.U(q);
  const fills = blend.split(q);
  const centers = [100, 250];
  const bottoms = [];
  blend.parts.forEach((part, i) => {
    if (part.share <= 1e-6) return;
    const pts = blendProfile(part.U, part.share * Q_BLEND, 150);
    const cx = centers[i];
    const L = (p) => (cx - p.w / 2).toFixed(1);
    const R = (p) => (cx + p.w / 2).toFixed(1);
    const Y = (p) => y(p.u).toFixed(1);
    const wet = pts.filter((p) => p.u >= uS);
    if (fills[i] > 0 && wet.length) {
      const sw = wet[wet.length - 1].w;
      const water = [`M${R(wet[0])} ${Y(wet[0])}`, ...wet.map((p) => `L${R(p)} ${Y(p)}`), `L${(cx + sw / 2).toFixed(1)} ${y(uS).toFixed(1)}`,
        `L${(cx - sw / 2).toFixed(1)} ${y(uS).toFixed(1)}`, ...[...wet].reverse().map((p) => `L${L(p)} ${Y(p)}`), 'Z'];
      svg.append(el('path', { d: water.join(''), fill: C.water, opacity: 0.85 }));
    }
    const last = pts[pts.length - 1];
    const wall = [`M${L(last)} ${(y(last.u) - 3).toFixed(1)}`, ...[...pts].reverse().map((p) => `L${L(p)} ${Y(p)}`),
      ...pts.map((p) => `L${R(p)} ${Y(p)}`), `L${R(last)} ${(y(last.u) - 3).toFixed(1)}`];
    svg.append(el('path', { d: wall.join(''), fill: 'none', stroke: part.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    bottoms.push({ cx, y: y(pts[0].u) });
    // Label next to the pipe, so it does not sit on it
    svg.append(el('text', { x: i === 0 ? cx - 12 : cx + 12, y: Math.min(H - 4, y(pts[0].u) + 18), fill: part.color, 'font-size': 12, 'font-weight': 600, 'text-anchor': i === 0 ? 'end' : 'start' }, `${part.name} ${pct(fills[i])}`));
  });
  // Pipe at the bottom: connects the tanks, which is why the level is the same in both
  if (bottoms.length === 2) {
    const yp = Math.max(bottoms[0].y, bottoms[1].y) + 12;
    const d = `M${bottoms[0].cx} ${bottoms[0].y}L${bottoms[0].cx} ${yp}L${bottoms[1].cx} ${yp}L${bottoms[1].cx} ${bottoms[1].y}`;
    svg.append(el('path', { d, fill: 'none', stroke: C.tank, 'stroke-width': 9, 'stroke-linejoin': 'round', opacity: 0.5 }));
    svg.append(el('path', { d, fill: 'none', stroke: C.water, 'stroke-width': 5, 'stroke-linejoin': 'round', opacity: q > 0 ? 0.9 : 0 }));
  }
  // common level and potential
  svg.append(el('line', { x1: 16, x2: W - 16, y1: y(uS), y2: y(uS), stroke: C.muted, 'stroke-dasharray': '3 3' }));
  const xv = 150;
  svg.append(el('line', { x1: xv, x2: xv, y1: top, y2: y(uS), stroke: C.cell, 'stroke-width': 1.5 }));
  svg.append(el('text', { x: xv + 6, y: Math.max(top + 14, (top + y(uS)) / 2), fill: C.cell, 'font-size': 12, 'font-weight': 700, 'dominant-baseline': 'middle' }, `${fmt(uS, 2)} V`));
}

export function drawBlendPotential(container, blend, q) {
  chart(container, {
    label: 'Potential of the blended anode over its lithium content',
    xMax: Q_BLEND, yMin: 0, yMax: U_RANGE, xTitle: 'lithium in the anode [Ah]', yTitle: 'potential vs Li/Li⁺ [V]', height: 240,
    draw(p) {
      p.line(sample((x) => blend.U(x / Q_BLEND), 0, Q_BLEND * 0.999, 300), { stroke: C.cell });
      p.dot(q * Q_BLEND, blend.U(q), C.water);
    },
  });
}

export function drawBlendSplit(container, blend, q) {
  chart(container, {
    label: 'How the lithium splits between silicon and graphite',
    xMax: Q_BLEND, yMin: 0, yMax: Q_BLEND, xTitle: 'lithium in the anode [Ah]', yTitle: 'lithium per material [Ah]', height: 240,
    draw(p) {
      blend.parts.forEach((part, i) => {
        p.line(sample((x) => part.share * Q_BLEND * blend.split(x / Q_BLEND)[i], 0, Q_BLEND * 0.999, 200), { stroke: part.color });
        p.dot(q * Q_BLEND, part.share * Q_BLEND * blend.split(q)[i], part.color);
      });
      p.label(0.3, Q_BLEND * 0.9, 'graphite', C.anode);
      p.label(0.3, Q_BLEND * 0.8, 'silicon', '#c39bd3');
    },
  });
}

export function drawDqdv(container, d) {
  // Top, full height: blend and the estimated graphite, so the graphite peaks can really be matched.
  // Bottom, own scale: what is left for the silicon.
  const top = document.createElement('div');
  const bottom = document.createElement('div');
  container.replaceChildren(top, bottom);
  const pts = (arr) => d.grid.map((u, i) => [u, arr[i]]);
  const yTop = Math.ceil(Math.max(...d.blendCurve, ...d.graphite) * 1.08);
  chart(top, {
    label: 'dQ/dV of the blend and of your graphite share',
    xMax: U_RANGE, yMin: 0, yMax: yTop, xTitle: 'potential vs Li/Li⁺ [V]', yTitle: 'dQ/dV [Ah/V]', height: 240,
    draw(p) {
      p.line(pts(d.blendCurve), { stroke: C.cell, 'stroke-width': 2.5 });
      p.line(pts(d.graphite), { stroke: C.anode, 'stroke-dasharray': '5 4', 'stroke-width': 2 });
      p.label(0.42, yTop * 0.85, 'blend', C.cell);
      p.label(0.42, yTop * 0.72, 'your graphite', C.anode);
    },
  });
  const yRest = Math.ceil(Math.max(...d.si) * 2.2);
  chart(bottom, {
    label: 'Remainder: blend minus your graphite',
    xMax: U_RANGE, yMin: -yRest, yMax: yRest, xTitle: 'potential vs Li/Li⁺ [V]', yTitle: 'remainder [Ah/V]', height: 200,
    draw(p) {
      p.hline(0, null, C.muted, '2 3');
      p.line(pts(d.si), { stroke: '#c39bd3', 'stroke-dasharray': '4 4', 'stroke-width': 1.5, opacity: 0.8 });
      p.line(pts(d.rest), { stroke: C.water, 'stroke-width': 3 });
      p.label(0.42, yRest * 0.8, 'remainder', C.water);
      p.label(0.42, yRest * 0.6, 'true silicon', '#c39bd3');
    },
  });
}
