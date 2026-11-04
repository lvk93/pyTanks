# Changelog

Versions follow [semantic versioning](https://semver.org/). Before 1.0 the interface can still change between minor versions.

## 0.3.0 (2026-11)

- Size profiles for every drawing: `wide` (default, unchanged look), `compact` (phones and single-column figures), `paper` (85 mm wide), `auto` (compact below 600 px).
- Colour themes: `dark` (default) and `light` (white background).
- `setStyle()`, `data-pytanks-profile` / `data-pytanks-theme`, `fit()` for labels near the edge.

## 0.2.0

- One drawing module shared with chargetanks.com (lithium-balance and materials chapters); the Python side only calculates (PyBaMM).
