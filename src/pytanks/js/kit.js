// SVG building blocks of every pytanks drawing: colours, elements, axes, line chart (the look of chargetanks.com).
// Plain ES module without dependencies or build step. Runs in the browser; in Node it needs a DOM (document).
export const NS = 'http://www.w3.org/2000/svg';
// Colour themes. "dark" is the look of chargetanks.com (dark blue background), "light" is for paper and slides.
export const THEMES = {
  dark: {
    anode: '#70ad47', cathode: '#f39c12', water: '#5dade2', cell: '#ffffff', text: '#e6eaf1',
    muted: 'rgb(255 255 255 / 0.55)', grid: 'rgb(255 255 255 / 0.12)', tank: 'rgb(255 255 255 / 0.75)',
    metal: '#b8c2cc', warn: '#ff8a80', alt: '#c39bd3',
    bg: '#003b73', window: 'rgb(93 173 226 / 0.10)', windowStrong: 'rgb(93 173 226 / 0.18)', faint: 'rgb(255 255 255 / 0.10)',
    warnBand: 'rgb(255 138 128 / 0.12)',
  },
  light: {
    anode: '#4e8a2e', cathode: '#d68910', water: '#3498db', cell: '#1b2631', text: '#1b2631',
    muted: 'rgb(0 0 0 / 0.55)', grid: 'rgb(0 0 0 / 0.12)', tank: 'rgb(0 0 0 / 0.7)',
    metal: '#5d6d7e', warn: '#c0392b', alt: '#8e44ad',
    bg: '#ffffff', window: 'rgb(52 152 219 / 0.10)', windowStrong: 'rgb(52 152 219 / 0.18)', faint: 'rgb(0 0 0 / 0.06)',
    warnBand: 'rgb(192 57 43 / 0.10)',
  },
};

// Size profiles: one drawing (what is shown) in three sizes (how big it is shown).
// wide: browser on a computer (the reference look). compact: phone or a single-column paper figure, larger text and
// flatter charts. paper: fixed physical width in mm (single column), text about 8-9 pt in print.
export const PROFILES = {
  wide: { font: 1, chart: 1 },
  compact: { font: 1.3, chart: 0.85 },
  paper: { font: 1.2, chart: 1, widthMm: 85 },
};

// Width below which profile "auto" draws compact (CSS px of the viewport).
export const COMPACT_BELOW = 600;

const defaults = { profile: 'wide', theme: 'dark' };
let active = { profile: PROFILES.wide, theme: THEMES.dark };

// Default style for every drawing on the page: setStyle({ profile: 'auto' | 'wide' | 'compact' | 'paper', theme: 'dark' | 'light' }).
// A single drawing can override it with data-pytanks-profile / data-pytanks-theme on its container or an ancestor.
export function setStyle({ profile, theme } = {}) {
  if (profile) defaults.profile = profile;
  if (theme) defaults.theme = theme;
}

function fromDom(container, name) {
  const host = container?.closest?.(`[data-pytanks-${name}]`);
  return host?.getAttribute?.(`data-pytanks-${name}`) ?? null;
}

function pickProfile(name) {
  if (name === 'auto') return (globalThis.innerWidth ?? Infinity) < COMPACT_BELOW ? PROFILES.compact : PROFILES.wide;
  return PROFILES[name] ?? PROFILES.wide;
}

// Called at the start of every drawing: resolves profile and theme for this container and makes them active.
export function use(container) {
  active = {
    profile: pickProfile(fromDom(container, 'profile') ?? defaults.profile),
    theme: THEMES[fromDom(container, 'theme') ?? defaults.theme] ?? THEMES.dark,
  };
  return active;
}

// Colours of the active theme (inside drawings). C below stays the fixed dark palette for pages that use it directly.
export const T = new Proxy({}, { get: (_, k) => active.theme[k] });
export const C = THEMES.dark;

// Font size in the active profile (unchanged in "wide").
export const fs = (n) => (active.profile.font === 1 ? n : Math.round(n * active.profile.font * 10) / 10);

// Font size for a label that has to stay inside `room` (viewBox units): the profile size if it fits, otherwise smaller,
// but never below the wide size. Width is estimated (no DOM measuring), about 0.55 em per character, 0.6 when bold.
export function fit(n, text, room, bold = false) {
  const f = fs(n);
  if (f === n) return n;
  const em = String(text).length * (bold ? 0.6 : 0.55);
  return em * f <= room ? f : Math.max(n, Math.floor((room / em) * 10) / 10);
}

// Dark outline around chart labels (same colour as the background)
export const halo = () => ({ stroke: active.theme.bg, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke' });
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
  const mm = active.profile.widthMm;
  const size = mm ? { width: `${mm}mm`, height: `${Math.round((mm * height) / width * 10) / 10}mm` } : {};
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, ...size, role: 'img', 'aria-label': label, class: 'ch-svg' });
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
export function chart(container, { label, xMin = 0, xMax, yMin, yMax, xTitle, yTitle, height: h = 240, xTicks = 6, breakPoles = false, draw }) {
  use(container);
  const height = active.profile.chart === 1 ? h : Math.round(h * active.profile.chart);
  const W = 360;
  const m = { l: 44, r: 12, t: 12, b: 40 };
  const svg = svgRoot(container, W, height, label);
  const px = (x) => m.l + ((x - xMin) / (xMax - xMin)) * (W - m.l - m.r);
  const py = (v) => height - m.b - ((v - yMin) / (yMax - yMin)) * (height - m.t - m.b);
  for (const t of niceTicks(yMin, yMax)) {
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: py(t), y2: py(t), stroke: T.grid }));
    svg.append(el('text', { x: m.l - 6, y: py(t), fill: T.muted, 'font-size': fs(10), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, t));
  }
  for (const t of niceTicks(xMin, xMax, xTicks)) {
    svg.append(el('text', { x: px(t), y: height - m.b + 14, fill: T.muted, 'font-size': fs(10), 'text-anchor': 'middle' }, t));
  }
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: height - 6, fill: T.text, 'font-size': fs(11), 'text-anchor': 'middle' }, xTitle));
  svg.append(el('text', { x: 12, y: (m.t + height - m.b) / 2, fill: T.text, 'font-size': fs(11), 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + height - m.b) / 2})` }, yTitle));
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
      if (text) svg.append(el('text', { x: W - m.r - 4, y: py(v) - 4, fill: color, 'font-size': fs(10), 'text-anchor': 'end', ...halo() }, text));
    },
    band(x0, x1, color) {
      g.append(el('rect', { x: px(x0), y: m.t, width: Math.max(0, px(x1) - px(x0)), height: height - m.t - m.b, fill: color }));
    },
    vline(x, v0, v1, color) {
      g.append(el('line', { x1: px(x), x2: px(x), y1: py(v0), y2: py(v1), stroke: color, 'stroke-width': 1.5 }));
    },
    dot(x, v, color) {
      g.append(el('circle', { cx: px(x), cy: py(v), r: 4.5, fill: color, stroke: T.bg, 'stroke-width': 1.5 }));
    },
    label(x, v, text, color, anchor = 'start') {
      svg.append(el('text', { x: px(x), y: py(v), fill: color, 'font-size': fs(11), 'font-weight': 600, 'text-anchor': anchor, ...halo() }, text));
    },
  });
}
