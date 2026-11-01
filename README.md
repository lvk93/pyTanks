# pytanks

**Lithium-ion cells drawn as tanks.** pytanks turns [PyBaMM](https://pybamm.org) parameter sets into the picture language of [chargetanks.com](https://chargetanks.com): each electrode is a tank hanging from the Li/Li⁺ ceiling, its width is the capacity per volt (dQ/dU), the water in it is lithium, and the cell voltage is the height difference between the two water surfaces.

> Status: early development (0.2.0.dev0). The drawing module is in place and already draws every figure of the [lithium-balance chapter](https://chargetanks.com/blog/lithium-balance/). The notebook widget and the standalone HTML export are next, see [ROADMAP.md](ROADMAP.md).

## One drawing, two homes

| | where | what |
|---|---|---|
| Drawing | `src/pytanks/js/` | One JavaScript module (plain ES modules, no build step) draws every picture as SVG: tanks, electrode potentials, cell voltage, lithium account, blends. chargetanks.com installs pytanks and draws with exactly this code. |
| Calculation | `src/pytanks/*.py` | Python reads what the picture needs from PyBaMM (electrode SOH, OCP curves). No model logic of its own. |

The JavaScript ships inside the Python package (`pytanks.js_dir()`), so the notebook widget and the HTML export will show the same pictures as the website.

```python
import pybamm, pytanks

b = pytanks.balance(pybamm.ParameterValues("Chen2020"), soc=0.5, lli=0.05)
b.capacity, b.np_ratio, b.v_cell(b.q)
```

### Using the drawing module on a website

```bash
npm install github:lvk93/pytanks#<commit or tag>
```

```js
import { idealCell, drawTanks } from 'pytanks';

const cell = idealCell({ qCath: 10, qAnode: 11, li: 10, vMin: 3.0, vMax: 4.2 });
drawTanks(document.querySelector('#tanks'), cell, cell.xMin + 0.5 * cell.capacity);
```

Modules: `kit.js` (colours, SVG elements, line chart), `balance.js` (tanks, electrode potentials, cell voltage, lithium account, fill gauge), `blend.js` (blended anodes, dQ/dV), `model/idealCell.js` and `model/blendTanks.js` (ideal or real half-cell curves to a cell).

## Development

```bash
pip install -e ".[dev]" && pytest     # Python
npm test                              # drawing module (Node, no browser)
```

Changes to the drawing change chargetanks.com once the website moves to the new commit. The website repo compares every figure before and after such an update (`tests/e2e/figures.mjs`).

## Citing

See [CITATION.cff](CITATION.cff). The tank picture language comes from [chargetanks.com](https://chargetanks.com) by Lars von Kolzenberg; the drawing code is the website's own.

BSD-3-Clause, like PyBaMM.
