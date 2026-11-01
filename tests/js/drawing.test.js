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
