// Smoke tests of the drawing module without a browser: a minimal stand-in for the DOM collects the SVG elements.
// Pixel-exact checks of the figures run on chargetanks.com (tests/e2e/figures.mjs there), which draws with this module.
import assert from 'node:assert/strict';
import { test } from 'node:test';

class Node {
  constructor(name) { this.name = name; this.attrs = {}; this.children = []; this.textContent = ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  all(name) { return [...(this.name === name ? [this] : []), ...this.children.flatMap((c) => c.all?.(name) ?? [])]; }
}
globalThis.document = { createElementNS: (ns, name) => new Node(name), createElement: (name) => new Node(name) };

const { drawTanks, drawElectrodes, drawCell, drawAccount, idealCell, lithiumAccount, IDEAL_ANODE, IDEAL_CATHODE } = await import('../../src/pytanks/js/index.js');
const { drawBlendTanks, blendElectrode, lineU, IDEAL_SILICON, IDEAL_GRAPHITE } = await import('../../src/pytanks/js/index.js');

const cell = idealCell({ qCath: 10, qAnode: 11, li: 10, vMin: 3.0, vMax: 4.2 });

test('ideal cell: Vmin and Vmax cut the window, cell voltage rises with lithium in the anode', () => {
  assert.ok(Math.abs(cell.vCell(cell.xMin) - 3.0) < 1e-6);
  assert.ok(Math.abs(cell.vCell(cell.xMax) - 4.2) < 1e-6 || cell.highLimit === 'cathode-empty');
  for (let x = cell.xLo; x < cell.xHi - 0.1; x += 0.5) assert.ok(cell.vCell(x + 0.1) > cell.vCell(x));
  assert.equal(IDEAL_ANODE.full, 0);
  assert.equal(IDEAL_CATHODE.empty, 4.25);
});

test('tanks: both walls, water and the cell voltage label', () => {
  const box = new Node('div');
  drawTanks(box, cell, cell.xMin + 0.5 * cell.capacity);
  const svg = box.children[0];
  assert.equal(svg.name, 'svg');
  assert.equal(svg.all('path').length >= 4, true); // two walls, two water bodies, arrow heads
  const texts = svg.all('text').map((t) => t.textContent);
  assert.ok(texts.some((t) => t.startsWith('Anode ')) && texts.some((t) => t.startsWith('Cathode ')));
  assert.ok(texts.includes(`${cell.vCell(cell.xMin + 0.5 * cell.capacity).toFixed(2)} V`));
});

test('charts and lithium account draw an svg each', () => {
  for (const draw of [(b) => drawElectrodes(b, cell, cell.xMin, 12), (b) => drawCell(b, cell, cell.xMin, 12),
    (b) => drawAccount(b, lithiumAccount({ qCathRev: 10, npRatio: 1.1, bonus: 0.06, seiRate: 0.1 }))]) {
    const box = new Node('div');
    draw(box);
    assert.equal(box.children[0].name, 'svg');
    assert.ok(box.children[0].all('path').length + box.children[0].all('rect').length > 0);
  }
});

test('blend: two tanks share one level', () => {
  const blend = blendElectrode([{ name: 'Silicon', share: 0.25, U: lineU(IDEAL_SILICON) }, { name: 'Graphite', share: 0.75, U: lineU(IDEAL_GRAPHITE) }]);
  const box = new Node('div');
  drawBlendTanks(box, blend, 0.5);
  assert.ok(box.children[0].all('text').some((t) => t.textContent === `${blend.U(0.5).toFixed(2)} V`));
});

/* Profiles and themes ------------------------------------------------------------------------- */
const { setStyle, fit, PROFILES, THEMES } = await import('../../src/pytanks/js/index.js');
const compactH = () => Math.round(wideH * PROFILES.compact.chart);
const fontSizes = (svg) => svg.all('text').map((t) => Number(t.attrs['font-size']));
const drawWith = (style, draw) => {
  setStyle(style);
  const box = new Node('div');
  draw(box);
  setStyle({ profile: 'wide', theme: 'dark' });
  return box.children[0];
};
const wideH = Number(drawWith({}, (b) => drawCell(b, cell, cell.xMin, 12)).attrs.viewBox.split(' ')[3]);

test('wide/dark is the default and keeps the reference sizes and colours', () => {
  const svg = drawWith({}, (b) => drawCell(b, cell, cell.xMin, 12));
  assert.equal(svg.attrs.viewBox, `0 0 360 ${wideH}`);
  assert.ok(fontSizes(svg).every((f) => Number.isInteger(f) && f <= 12));
  assert.equal(svg.attrs.width, undefined);
  assert.ok(svg.all('text').some((t) => t.attrs.fill === THEMES.dark.text));
});

test('compact: larger text and a flatter chart', () => {
  const wide = drawWith({ profile: 'wide' }, (b) => drawCell(b, cell, cell.xMin, 12));
  const compact = drawWith({ profile: 'compact' }, (b) => drawCell(b, cell, cell.xMin, 12));
  assert.equal(compact.attrs.viewBox, `0 0 360 ${compactH()}`);
  assert.ok(Math.min(...fontSizes(compact)) > Math.max(...fontSizes(wide)) - 1);
  assert.ok(Math.min(...fontSizes(compact)) >= 12.5);
});

test('paper: physical size in mm', () => {
  const svg = drawWith({ profile: 'paper' }, (b) => drawCell(b, cell, cell.xMin, 12));
  assert.equal(svg.attrs.width, '85mm');
  assert.ok(svg.attrs.height.endsWith('mm'));
});

test('light theme: background-coloured halo and dark text', () => {
  const svg = drawWith({ theme: 'light' }, (b) => drawCell(b, cell, cell.xMin, 12));
  const strokes = svg.all('text').map((t) => t.attrs.stroke).filter(Boolean);
  assert.ok(strokes.length > 0 && strokes.every((s) => s === THEMES.light.bg));
  assert.ok(svg.all('text').some((t) => t.attrs.fill === THEMES.light.text));
});

test('auto picks compact on a narrow viewport', () => {
  const saved = globalThis.innerWidth;
  globalThis.innerWidth = 390;
  const svg = drawWith({ profile: 'auto' }, (b) => drawCell(b, cell, cell.xMin, 12));
  globalThis.innerWidth = saved;
  assert.equal(svg.attrs.viewBox, `0 0 360 ${compactH()}`);
});

test('container attribute overrides the page default', () => {
  const host = new Node('figure');
  host.attrs['data-pytanks-profile'] = 'compact';
  const box = new Node('div');
  box.closest = (sel) => (sel === '[data-pytanks-profile]' ? host : null);
  drawCell(box, cell, cell.xMin, 12);
  assert.equal(box.children[0].attrs.viewBox, `0 0 360 ${compactH()}`);
});

test('fit keeps long labels inside their room, never below the wide size', () => {
  setStyle({ profile: 'compact' });
  const svg = new Node('div'); drawCell(svg, cell, cell.xMin, 12); // activates compact
  assert.equal(fit(12, 'short', 300, true), Math.round(12 * PROFILES.compact.font * 10) / 10);
  assert.ok(fit(12, 'x'.repeat(50), 336, true) < 12 * PROFILES.compact.font);
  assert.equal(fit(12, 'x'.repeat(200), 50, true), 12);
  setStyle({ profile: 'wide' });
  drawCell(new Node('div'), cell, cell.xMin, 12);
  assert.equal(fit(12, 'x'.repeat(200), 50, true), 12);
});
