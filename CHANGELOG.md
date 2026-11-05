# Changelog

Versions follow [semantic versioning](https://semver.org/). Before 1.0 the interface can still change between minor versions.

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
