// Tank shapes and where they come from: the linear tank (constant cross-section), the ideal (dilute) solution, the
// ideal solid solution (lattice gas) and the regular solution (one interaction term), each as a tank on a TRUE width
// scale (width = dQ/dU, not compressed), plus a comparison with measured curves. Potentials are relative to the
// standard potential U0 of the material: positive = deeper below the ceiling. Capacity of every shape = 1.
import { chart, el, fmt, fs, halo, niceTicks, svgRoot, T, use } from './kit.js';
import { interp, profile } from './materials.js';

export const KT = 0.025693; // kT/e at 25 °C [V]

/* Model ------------------------------------------------------------------------------------------------------ */
// Regular solution (lattice gas with one neighbour interaction), omega in units of kT (> 0: neighbours attract):
//   U - U0 = -kT [ ln(x/(1-x)) + omega (1 - 2x) ]      omega = 0: ideal solid solution
// Homogeneous width dQ/dU = 1 / (kT (1/(x(1-x)) - 2 omega)); for omega > 2 the middle part is unstable and the
// material splits: in equilibrium both phases sit at U0 (plateau) between the binodal points xb and 1 - xb.
export const uRegular = (x, omega = 0) => -KT * (Math.log(x / (1 - x)) + omega * (1 - 2 * x));
export const wRegular = (x, omega = 0) => 1 / (KT * (1 / (x * (1 - x)) - 2 * omega));
// Free energy of mixing per site in units of kT; mu = dg/dx. Double well (two minima) for omega > 2.
export const gRegular = (x, omega = 0) => x * Math.log(x) + (1 - x) * Math.log(1 - x) + omega * x * (1 - x);

// Binodal point xb < 0.5 (lithium-poor phase) for omega > 2, else null
export function binodal(omega) {
  if (omega <= 2) return null;
  const f = (x) => Math.log(x / (1 - x)) + omega * (1 - 2 * x);
  const xs = 0.5 - Math.sqrt(0.25 - 1 / (2 * omega)); // spinodal point: f > 0 between here and 0.5
  let lo = 1e-15;
  let hi = xs;
  for (let i = 0; i < 200; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// Equilibrium curve U(x) (relative to U0) with the plateau for omega > 2
export function regularCurve(omega = 0, n = 400) {
  const xb = binodal(omega);
  const xs = [];
  const us = [];
  for (let i = 0; i <= n; i += 1) {
    const x = 0.001 + (i * 0.998) / n;
    xs.push(x);
    us.push(xb !== null && x > xb && x < 1 - xb ? 0 : uRegular(x, omega));
  }
  return { xs, us, xb };
}

// Potential span holding the middle 90 % of the lithium (5 % to 95 % full)
export function span90(omega = 0) {
  const xb = binodal(omega);
  if (xb !== null && xb <= 0.05) return 0;
  return uRegular(0.05, omega) - uRegular(0.95, omega);
}

/* Drawing: tanks in columns on one relative potential axis ---------------------------------------------------- */
// cols: [{ name, color, parts: [{ pts: [{u, w}], dash, color, opacity }], basin: { u, share } }]
// u rises downwards (deeper below the ceiling). Widths in 1/V, scaled with k px per (1/V) and clipped at cap.
function columns(container, { cols, uMin, uMax, k: kGiven, fitWidth, label, height = 280, note }) {
  use(container);
  const W = 360;
  const left = 58;
  const top = 34;
  const H = top + height + 38;
  const colW = (W - left - 6) / cols.length;
  const cap = colW - 10;
  // fitWidth: the widest shape of the figure (1/V) just fills a column, everything else on the same scale
  const k = fitWidth ? (0.96 * cap) / fitWidth : kGiven;
  const y = (u) => top + ((u - uMin) / (uMax - uMin)) * height;
  const svg = svgRoot(container, W, H, label);
  svg.append(el('text', { x: left - 6, y: top - 12, fill: T.muted, 'font-size': fs(10), 'text-anchor': 'end' }, 'mV'));
  for (const t of niceTicks(uMin, uMax, 5)) {
    svg.append(el('line', { x1: left, x2: W - 6, y1: y(t), y2: y(t), stroke: T.grid }));
    const mv = Math.round(t * 1000);
    svg.append(el('text', { x: left - 6, y: y(t), fill: T.muted, 'font-size': fs(10), 'text-anchor': 'end', 'dominant-baseline': 'middle' },
      mv === 0 ? 'U₀' : `${mv > 0 ? '+' : '−'}${Math.abs(mv)}`));
  }
  cols.forEach((c, i) => {
    const cx = left + colW * (i + 0.5);
    for (const part of c.parts) {
      // open: stop where the shape gets wider than the column (the horn keeps widening), instead of a straight wall
      const pts = part.pts.filter((p) => p.u >= uMin && p.u <= uMax && Number.isFinite(p.w) && p.w >= 0 && (!part.open || p.w * k <= cap));
      if (pts.length < 2) continue;
      const half = (p) => Math.min(cap, Math.max(0.75, p.w * k)) / 2;
      const d = [...pts.map((p, j) => `${j ? 'L' : 'M'}${(cx - half(p)).toFixed(1)} ${y(p.u).toFixed(1)}`),
        ...[...pts].reverse().map((p) => `L${(cx + half(p)).toFixed(1)} ${y(p.u).toFixed(1)}`)];
      if (part.fill) svg.append(el('path', { d: `${d.join('')}Z`, fill: part.fill, stroke: 'none' }));
      svg.append(el('path', { d: d.join(''), fill: 'none', stroke: part.color ?? c.color, 'stroke-width': part.dash ? 1.5 : 2.5,
        'stroke-linejoin': 'round', 'stroke-dasharray': part.dash, opacity: part.opacity }));
    }
    if (c.basin) {
      // a plateau holds its share of lithium at one height: in true scale infinitely wide, drawn as a bar at cap
      svg.append(el('rect', { x: cx - cap / 2, y: y(c.basin.u) - 2.5, width: cap, height: 5, fill: c.color, rx: 1 }));
    }
    svg.append(el('text', { x: cx, y: H - 8, fill: c.color, 'font-size': fs(11), 'font-weight': 600, 'text-anchor': 'middle' }, c.name));
  });
  if (note) svg.append(el('text', { x: W - 6, y: 14, fill: T.muted, 'font-size': fs(10), 'text-anchor': 'end' }, note));
}

const grid = (uMin, uMax, n = 280) => Array.from({ length: n + 1 }, (_, i) => uMin + ((uMax - uMin) * i) / n);

// Outline of a shape given as U(x) over x in (0, 1), sampled in x (smooth even where dQ/dU is huge)
function outline(uOf, wOf, n = 400) {
  const pts = [];
  for (let i = 1; i < n; i += 1) {
    const x = i / n;
    pts.push({ u: uOf(x), w: wOf(x) });
  }
  return pts.sort((a, b) => a.u - b.u);
}

/* Figure: linear tank, ideal (dilute) solution, ideal solid solution ------------------------------------------ */
export function drawTankShapes(container, { span = 0.3 } = {}) {
  const [uMin, uMax] = [-0.16, 0.16];
  const linear = [{ u: -span / 2, w: 1 / span }, { u: span / 2, w: 1 / span }];
  // dilute: U - U0 = -kT ln c, width = c / kT. Next to the solid solution it is normalized so that it equals the
  // solid solution where that is nearly empty; on its own it has no fixed capacity (the horn never closes), so there
  // it is shifted down by 2 kT ln 10 to show more of its shape before it leaves the column.
  const horn = (shift) => grid(uMin, uMax, 400).map((u) => ({ u, w: Math.exp(-(u - shift) / KT) / KT }));
  const solid = outline((x) => uRegular(x), (x) => wRegular(x));
  const k = 70 / (0.25 / KT); // widest point of the ideal solid solution = 70 px
  columns(container, {
    label: 'Three tank shapes with the same capacity on a true width scale: the linear tank is a straight box, the ideal dilute solution a horn that keeps widening towards the ceiling, the ideal solid solution a narrow bell',
    uMin, uMax, k,
    cols: [
      { name: 'linear', color: T.tank, parts: [{ pts: linear }] },
      { name: 'dilute solution', color: T.water, parts: [{ pts: horn(-2 * KT * Math.LN10), open: true }] },
      { name: 'solid solution', color: T.anode, parts: [{ pts: horn(0), open: true, dash: '4 4', color: T.water, opacity: 0.7 }, { pts: solid }] },
    ],
  });
}

/* Figure: the ideal solid solution against measured curves, same capacity, true width ------------------------ */
// materials: [{ name, color, x, u }] with x = filling 0..1 (more lithium = lower u). Potentials relative to u at x = 0.5.
export function drawShapeCompare(container, materials) {
  const [uMin, uMax] = [-0.6, 0.6];
  const ideal = outline((x) => uRegular(x), (x) => wRegular(x));
  const cols = materials.map((m) => {
    const u0 = interp(m.x, m.u, 0.5);
    const us = m.u.map((u) => u - u0);
    // widths per volt for capacity 1, only where the curve has data
    const pts = profile(m.x, us, 1, uMin, uMax, 360, 0.004).filter((p) => p.u >= Math.min(...us) && p.u <= Math.max(...us));
    return { name: m.name, color: m.color, pts, parts: [{ pts: ideal, dash: '4 4', color: T.anode, opacity: 0.8 }, { pts }] };
  });
  const fitWidth = Math.max(0.25 / KT, ...cols.flatMap((c) => c.pts.map((p) => p.w)));
  columns(container, {
    label: 'Measured tanks next to the ideal solid solution (dashed), all with the same capacity and on one true width scale: graphite and LFP are much wider and flatter than the bell, NMC much narrower and taller',
    uMin, uMax, fitWidth, cols,
  });
}

/* Tool: one interaction term, curve and tank ------------------------------------------------------------------ */
const U_TOOL = [-0.45, 0.45];

export function drawInteractionCurve(container, omega = 0) {
  const c = regularCurve(omega);
  const ideal = regularCurve(0);
  chart(container, {
    label: `Potential of a solid solution with interaction ${fmt(omega, 1)} kT between neighbouring lithium ions, compared with the ideal solid solution`,
    xMax: 1, yMin: U_TOOL[0] * 1000, yMax: U_TOOL[1] * 1000, xTitle: 'filling x', yTitle: 'potential relative to U₀ [mV]', height: 250, xTicks: 5,
    draw(p) {
      p.line(ideal.xs.map((x, i) => [x, ideal.us[i] * 1000]), { stroke: T.anode, 'stroke-dasharray': '4 4', 'stroke-width': 1.5, opacity: 0.7 });
      if (c.xb !== null) {
        // the evenly filled crystal (S-curve) that the material avoids by splitting
        const xs = c.xs.filter((x) => x > c.xb && x < 1 - c.xb);
        p.line(xs.map((x) => [x, uRegular(x, omega) * 1000]), { stroke: T.warn, 'stroke-dasharray': '3 3', 'stroke-width': 1.5 });
      }
      p.line(c.xs.map((x, i) => [x, c.us[i] * 1000]), { stroke: T.cathode });
      p.label(0.97, U_TOOL[1] * 1000 - 40, 'ideal (dashed)', T.anode, 'end');
      if (c.xb !== null) p.label(0.5, 40, 'two phases: plateau', T.cathode, 'middle');
    },
  });
}

export function drawInteractionTank(container, omega = 0) {
  const xb = binodal(omega);
  const ideal = outline((x) => uRegular(x), (x) => wRegular(x));
  const edges = (lo, hi) => outline((x) => uRegular(lo + (hi - lo) * x, omega), (x) => wRegular(lo + (hi - lo) * x, omega));
  const parts = [{ pts: ideal, dash: '4 4', color: T.anode, opacity: 0.6 }];
  if (xb === null) parts.push({ pts: outline((x) => uRegular(x, omega), (x) => wRegular(x, omega)), fill: T.window });
  else parts.push({ pts: edges(0.0005, xb), fill: T.window }, { pts: edges(1 - xb, 0.9995), fill: T.window });
  const share = xb === null ? 0 : 1 - 2 * xb;
  columns(container, {
    label: `Tank of a solid solution with interaction ${fmt(omega, 1)} kT on a true width scale; dashed: the ideal solid solution with the same capacity`,
    uMin: U_TOOL[0], uMax: U_TOOL[1], k: 70 / (0.25 / KT), height: 250,
    note: xb === null ? null : `plateau holds ${Math.round(share * 100)} %`,
    cols: [{ name: omega === 0 ? 'ideal solid solution' : omega < 0 ? 'neighbours repel' : 'neighbours attract', color: T.cathode, parts, basin: xb === null ? null : { u: 0, share } }],
  });
}

// Free energy per site (in kT) over the filling. For omega > 2 a double well: the common tangent (horizontal, the
// curve is symmetric) touches both minima at the binodal points, and every filling in between is cheaper as a mix of
// the two phases than as one evenly filled crystal.
export function drawInteractionFreeEnergy(container, omega = 0) {
  const xb = binodal(omega);
  const xs = Array.from({ length: 401 }, (_, i) => 0.0005 + (i * 0.999) / 400);
  const gs = xs.map((x) => gRegular(x, omega));
  const lo = Math.min(...gs);
  const hi = Math.max(...gs, 0);
  const pad = 0.08 * Math.max(hi - lo, 0.05);
  chart(container, {
    label: `Free energy of a solid solution with interaction ${fmt(omega, 1)} kT between neighbouring lithium ions${xb === null ? ', one minimum' : ', a double well with two minima'}`,
    xMax: 1, yMin: lo - pad, yMax: hi + pad, xTitle: 'filling x', yTitle: 'free energy [kT per site]', height: 250, xTicks: 5,
    draw(p) {
      p.line(xs.map((x, i) => [x, gs[i]]), { stroke: T.cathode });
      if (xb !== null) {
        const g = gRegular(xb, omega);
        p.line([[xb, g], [1 - xb, g]], { stroke: T.warn, 'stroke-dasharray': '3 3', 'stroke-width': 1.5 });
        p.label(0.5, g + pad * 0.6, 'two phases: common tangent', T.warn, 'middle');
      }
    },
  });
}
