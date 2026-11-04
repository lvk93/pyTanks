// Linear tanks (constant cross-section) of the lithium-balance chapter: every electrode is a straight line
// between "empty" and "full" (potential vs Li/Li+). Real curves plug in as { U }. No DOM, so it can be tested.
//
// Quantities in Ah:
//   qCath  reversible capacity of the cathode (room in the cathode tank)
//   qAnode capacity of the anode (room in the anode tank)
//   li     cyclable lithium (the water that takes part)
// Running variable x = lithium in the anode. Discharged means small x, charged means large x.

// The full anode reaches up to the ceiling (0 V): once it is full, the water overflows (plating) without a jump in
// the cell voltage. The cathode starts at 4.25 V, so that at Vmax = 4.2 V: N/P 1.1 is limited at the top by the empty
// cathode (N/P_cap = N/P_fill), from N/P ~0.92 the anode reaches the ceiling, and the aging quiz loses 2 %.
export const LINEAR_CATHODE = { empty: 4.25, full: 3.6 };
export const LINEAR_ANODE = { empty: 0.6, full: 0 };

// Potential vs Li/Li+ at fill 0..1 (straight line: slope = 1/cross-section)
export function potential(tank, fill) {
  return tank.empty - (tank.empty - tank.full) * fill;
}

function bisect(f, lo, hi, target) {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 60; i += 1) {
    const m = (a + b) / 2;
    if (f(m) < target) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

// Electrode as a function fill -> potential: linear straight line (object with empty/full) or real curve ({ U })
export function electrodeU(electrode) {
  return typeof electrode.U === 'function' ? electrode.U : (fill) => potential(electrode, fill);
}

// Real half-cell curve from material data (SoL_prac -> OCV, linearly interpolated, held at the ends)
export function realElectrode(material, direction = 'cha') {
  const pairs = Array.from(material.data.SoL_prac, (s, i) => [s, material.data[`OCV_${direction}`][i]])
    .sort((a, b) => a[0] - b[0]);
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const U = (f) => {
    if (f <= xs[0]) return ys[0];
    if (f >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= f) lo = mid;
      else hi = mid;
    }
    const t = (f - xs[lo]) / (xs[hi] - xs[lo] || 1);
    return ys[lo] + t * (ys[hi] - ys[lo]);
  };
  return { name: material.name, U };
}

export function linearCell({ qCath, qAnode, li, vMin, vMax, cathode = LINEAR_CATHODE, anode = LINEAR_ANODE }) {
  const cathodeU = electrodeU(cathode);
  const anodeU = electrodeU(anode);
  // Physical range: the cathode takes at most qCath, the anode gets at most li
  const xLo = Math.max(0, li - qCath);
  const xHi = li;
  const fillCath = (x) => (li - x) / qCath;
  const fillAnode = (x) => x / qAnode;
  const uCath = (x) => cathodeU(fillCath(x));
  // Above the rim of the anode tank the level sticks to the ceiling (0 V): lithium plating
  const uAnode = (x) => (fillAnode(x) > 1 + 1e-12 ? 0 : Math.max(0, anodeU(fillAnode(x))));
  const vCell = (x) => uCath(x) - uAnode(x);
  const plated = (x) => Math.max(0, x - qAnode);

  // vCell rises monotonically with x (the cathode empties, the anode fills)
  const xMin = vCell(xLo) >= vMin ? xLo : vCell(xHi) < vMin ? xHi : bisect(vCell, xLo, xHi, vMin);
  const xMax = vCell(xHi) <= vMax ? xHi : vCell(xLo) > vMax ? xLo : bisect(vCell, xLo, xHi, vMax);
  const capacity = Math.max(0, xMax - xMin);

  // What limits at the bottom and at the top (for labels)
  const lowLimit = xMin > xLo + 1e-9 ? 'vmin' : li > qCath ? 'cathode-full' : 'anode-empty';
  const highLimit = xMax < xHi - 1e-9 ? 'vmax' : 'cathode-empty';

  return {
    qCath, qAnode, li, vMin, vMax, xLo, xHi, xMin, xMax, capacity, lowLimit, highLimit,
    fillCath, fillAnode, uCath, uAnode, vCell, plated, cathodeU, anodeU,
    real: typeof cathode.U === 'function',
    npCap: qAnode / qCath,
    // Anode at Vmax: how much room is left up to the ceiling?
    npFill: xMax > 0 ? qAnode / xMax : Infinity,
    platedAtVmax: plated(xMax),
    // The anode level reaches the ceiling before Vmax: from here on lithium is plated as metal
    ceilingAtVmax: fillAnode(xMax) >= 1 - 1e-6,
    // Room in the cathode that stays empty on discharge
    cathodeGap: Math.max(0, qCath - (li - xMin)),
  };
}

// Lithium account of the formation (N/Li tab). bonus and seiRate as fractions (0..1), prelith in Ah.
//   First charge of the cathode = qCathRev * (1 + bonus); the SEI takes seiRate * qAnode;
//   prelithiation pays in prelith Ah on top.
export function lithiumAccount({ qCathRev, npRatio, bonus, seiRate, prelith = 0 }) {
  const qAnode = npRatio * qCathRev;
  const bonusAh = qCathRev * bonus;
  const firstCharge = qCathRev + bonusAh;
  const sei = seiRate * qAnode;
  const li = firstCharge + prelith - sei;
  return {
    qCathRev, qAnode, bonusAh, firstCharge, prelith, sei, li, nLi: qAnode / li,
    // Lithium is the scarcest item as long as the SEI takes more than bonus and prelithiation pay in
    lithiumLimits: sei >= bonusAh + prelith,
  };
}

// Degradation modes (aging tab): losses as fractions (0..1). Aged quantities and the scarcest item.
export function agedBalance({ qCath, qAnode, li, lamCath = 0, lamAnode = 0, lli = 0 }) {
  const out = {
    qCath: (1 - lamCath) * qCath,
    qAnode: (1 - lamAnode) * qAnode,
    li: (1 - lli) * li,
  };
  const items = [['lithium', out.li], ['cathode', out.qCath], ['anode', out.qAnode]];
  out.scarcest = items.reduce((a, b) => (b[1] < a[1] - 1e-9 ? b : a))[0];
  out.np = out.qAnode / out.qCath;
  out.nLi = out.qAnode / out.li;
  return out;
}
