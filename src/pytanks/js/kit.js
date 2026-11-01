// SVG building blocks of every pytanks drawing: colours, elements, axes, line chart (the look of chargetanks.com).
// Plain ES module without dependencies or build step. Runs in the browser; in Node it needs a DOM (document).
export const NS = 'http://www.w3.org/2000/svg';
export const C = {
  anode: '#70ad47', cathode: '#f39c12', water: '#5dade2', cell: '#ffffff', text: '#e6eaf1',
  muted: 'rgb(255 255 255 / 0.55)', grid: 'rgb(255 255 255 / 0.12)', tank: 'rgb(255 255 255 / 0.75)',
  metal: '#b8c2cc', warn: '#ff8a80', alt: '#c39bd3',
};
// Dark outline around chart labels (same colour as the background)
export const HALO = { stroke: '#003b73', 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke' };

export const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
export const pct = (v) => `${Math.round(v * 100)} %`;

export function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

export function svgRoot(container, width, height, label) {
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label, class: 'ch-svg' });
  container.replaceChildren(svg);
  return svg;
}

export function niceTicks(min, max, count = 5) {
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const out = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

// Line chart with a small drawing API (line, hline, band, vline, dot, label).
// breakPoles: points far outside [yMin, yMax] break the line (dQ/dV with poles). xTicks: number of x tick marks.
export function chart(container, { label, xMin = 0, xMax, yMin, yMax, xTitle, yTitle, height = 240, xTicks = 6, breakPoles = false, draw }) {
  const W = 360;
  const m = { l: 44, r: 12, t: 12, b: 40 };
  const svg = svgRoot(container, W, height, label);
  const px = (x) => m.l + ((x - xMin) / (xMax - xMin)) * (W - m.l - m.r);
  const py = (v) => height - m.b - ((v - yMin) / (yMax - yMin)) * (height - m.t - m.b);
  for (const t of niceTicks(yMin, yMax)) {
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: py(t), y2: py(t), stroke: C.grid }));
    svg.append(el('text', { x: m.l - 6, y: py(t), fill: C.muted, 'font-size': 10, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, t));
  }
  for (const t of niceTicks(xMin, xMax, xTicks)) {
    svg.append(el('text', { x: px(t), y: height - m.b + 14, fill: C.muted, 'font-size': 10, 'text-anchor': 'middle' }, t));
  }
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: height - 6, fill: C.text, 'font-size': 11, 'text-anchor': 'middle' }, xTitle));
  svg.append(el('text', { x: 12, y: (m.t + height - m.b) / 2, fill: C.text, 'font-size': 11, 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + height - m.b) / 2})` }, yTitle));
  const clip = `clip-${Math.random().toString(36).slice(2)}`;
  const defs = el('defs');
  const cp = el('clipPath', { id: clip });
  cp.append(el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: height - m.t - m.b }));
  defs.append(cp);
  svg.append(defs);
  const g = el('g', { 'clip-path': `url(#${clip})` });
  svg.append(g);
  draw({
    line(points, attrs) {
      let d = '';
      let pen = false;
      for (const [x, v] of points) {
        if (!Number.isFinite(v) || (breakPoles && (v < yMin - (yMax - yMin) || v > yMax + (yMax - yMin)))) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${px(x).toFixed(1)} ${py(v).toFixed(1)}`;
        pen = true;
      }
      g.append(el('path', { d, fill: 'none', 'stroke-width': 2.5, 'stroke-linejoin': 'round', ...attrs }));
    },
    hline(v, text, color, dash = '5 4') {
      g.append(el('line', { x1: m.l, x2: W - m.r, y1: py(v), y2: py(v), stroke: color, 'stroke-dasharray': dash, 'stroke-width': 1.25 }));
      if (text) svg.append(el('text', { x: W - m.r - 4, y: py(v) - 4, fill: color, 'font-size': 10, 'text-anchor': 'end', ...HALO }, text));
    },
    band(x0, x1, color) {
      g.append(el('rect', { x: px(x0), y: m.t, width: Math.max(0, px(x1) - px(x0)), height: height - m.t - m.b, fill: color }));
    },
    vline(x, v0, v1, color) {
      g.append(el('line', { x1: px(x), x2: px(x), y1: py(v0), y2: py(v1), stroke: color, 'stroke-width': 1.5 }));
    },
    dot(x, v, color) {
      g.append(el('circle', { cx: px(x), cy: py(v), r: 4.5, fill: color, stroke: '#003b73', 'stroke-width': 1.5 }));
    },
    label(x, v, text, color, anchor = 'start') {
      svg.append(el('text', { x: px(x), y: py(v), fill: color, 'font-size': 11, 'font-weight': 600, 'text-anchor': anchor, ...HALO }, text));
    },
  });
}
