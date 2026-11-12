# Changelog

Versions follow [semantic versioning](https://semver.org/). Before 1.0 the interface can still change between minor versions.

## 0.5.0 (2026-11)

- `shapes.js`: free energy of the regular solution, `gRegular()` and `drawInteractionFreeEnergy()` (double well with the common tangent above 2 kT).
- Tank-shape columns without the labels "towards the ceiling (more lithium)" and "wider ↔".
- `materials.js`: graphite staging drawing `drawStaging()` (carbon layers; every 4th, every 2nd, every gap filled).
- `drawWeir()`: the in-between states on the plateau (water spilling over, reservoir partly full) are drawn dashed in the warning colour, because a small particle does not stay there; once converted, the left neck is full up to its roof.
- `drawSCurve(container, { parts })`: draw only the S-curve (`'curve'`), only its dQ/dV (`'dqdv'`) or both (default); labels "unstable (spinodal region)" and "one particle, filled evenly".

## 0.4.0 (2026-11)

- **Breaking:** the tanks with a constant cross-section are called *linear*, not *ideal* ("ideal" means the ideal solution in thermodynamics, see `shapes.js`): `model/idealCell.js` → `model/linearCell.js`, `idealCell()` → `linearCell()`, `IDEAL_ANODE/CATHODE/SILICON/GRAPHITE` → `LINEAR_…`. No aliases for the old names.
- `shapes.js`: where tank shapes come from. Linear tank, ideal dilute solution (horn), ideal solid solution (bell) and regular solution (one interaction term, plateau above 2 kT), drawn on a true width scale; comparison with measured curves; `span90()`, `binodal()`.
- Shelf and capacity bars: the open material stays strong, the others are drawn as a faint outline.

## 0.3.0 (2026-11)

- Size profiles for every drawing: `wide` (default, unchanged look), `compact` (phones and single-column figures), `paper` (85 mm wide), `auto` (compact below 600 px).
- Colour themes: `dark` (default) and `light` (white background).
- `setStyle()`, `data-pytanks-profile` / `data-pytanks-theme`, `fit()` for labels near the edge.

## 0.2.0

- One drawing module shared with chargetanks.com (lithium-balance and materials chapters); the Python side only calculates (PyBaMM).
