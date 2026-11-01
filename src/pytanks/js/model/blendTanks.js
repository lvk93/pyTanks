// Blended electrode of two materials (blends tab): two tanks connected at the bottom by a pipe.
// Both materials sit at the same potential; each takes up as much lithium as its curve gives at
// that potential. No DOM, so it can be tested.
//
// Material: function fill (0..1) -> potential vs Li/Li+ (falls with the fill), plus a share
// of the capacity (share, sum 1).

// Ideal tanks (straight lines): silicon starts taking up lithium much earlier (hangs lower, further from the ceiling)
export const IDEAL_SILICON = { empty: 0.6, full: 0.05 };
export const IDEAL_GRAPHITE = { empty: 0.25, full: 0.08 };

export function lineU(tank) {
  return (f) => tank.empty - (tank.empty - tank.full) * f;
}

// Fill at a potential (the curve falls monotonically); 0 above the empty tank, 1 below the full one
export function fillAt(U, u) {
  if (u >= U(0)) return 0;
  if (u <= U(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i += 1) {
    const m = (lo + hi) / 2;
    if (U(m) > u) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// parts: [{ name, share, U }]. Result: potential of the blended electrode over the total fill, and the split.
export function blendElectrode(parts, n = 600) {
  const uTop = Math.max(...parts.map((p) => p.U(0)));
  const uBot = Math.min(...parts.map((p) => p.U(1)));
  const table = [];
  for (let i = 0; i <= n; i += 1) {
    const u = uTop - ((uTop - uBot) * i) / n;
    const fills = parts.map((p) => fillAt(p.U, u));
    const q = parts.reduce((sum, p, k) => sum + p.share * fills[k], 0);
    table.push({ u, q, fills });
  }
  const find = (q) => {
    if (q <= table[0].q) return 0;
    for (let i = 1; i < table.length; i += 1) if (table[i].q >= q) return i;
    return table.length - 1;
  };
  const at = (q) => {
    const i = find(q);
    if (i === 0) return { u: table[0].u, fills: table[0].fills };
    const a = table[i - 1];
    const b = table[i];
    const t = b.q > a.q ? (q - a.q) / (b.q - a.q) : 0;
    return { u: a.u + t * (b.u - a.u), fills: a.fills.map((fa, k) => fa + t * (b.fills[k] - fa)) };
  };
  return {
    parts,
    U: (q) => at(Math.min(1, Math.max(0, q))).u,
    split: (q) => at(Math.min(1, Math.max(0, q))).fills,
  };
}

// dQ/dV of a curve (capacity per volt, positive) on a potential grid, from the histogram of charge
// over potential with Gaussian smoothing: so flat plateaus stay finite too.
export function dqdv(U, capacity, grid, sigma = 0.006, n = 4000) {
  const du = grid[1] - grid[0];
  const hist = new Float64Array(grid.length);
  for (let i = 0; i < n; i += 1) {
    const u = U((i + 0.5) / n);
    const k = Math.round((u - grid[0]) / du);
    if (k >= 0 && k < grid.length) hist[k] += capacity / n;
  }
  const r = Math.ceil((3 * sigma) / du);
  const kernel = [];
  for (let j = -r; j <= r; j += 1) kernel.push(Math.exp(-0.5 * ((j * du) / sigma) ** 2));
  const norm = kernel.reduce((a, b) => a + b, 0);
  return Array.from(grid, (_, i) => {
    let s = 0;
    for (let j = -r; j <= r; j += 1) {
      const k = i + j;
      if (k >= 0 && k < grid.length) s += hist[k] * kernel[j + r];
    }
    return s / norm / du;
  });
}
