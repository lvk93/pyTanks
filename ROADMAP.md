# Roadmap

## 0.2 (now): one drawing for the website and the package
- [x] The drawings of the lithium-balance chapter on chargetanks.com (tanks, electrode potentials, cell voltage, lithium account, blends, dQ/dV) live here as one JavaScript module (`src/pytanks/js/`); the website installs pytanks and draws with it
- [x] Python computes the lithium balance from a PyBaMM parameter set (`balance`), no model logic of its own
- [ ] Basic picture: tanks with a SOC slider, from a PyBaMM parameter set, as a Jupyter widget and as a standalone HTML file
- [ ] Aging picture: the same with sliders for lost lithium, anode and cathode (or cycle number from an aging simulation)

## Later
- [ ] Export without a browser (SVG/PDF for papers)
- [ ] Kinetics: the first prototype (matplotlib, "ladder") is parked on the branch `archive/kinetics-prototype`
- [ ] Release on PyPI with a Zenodo DOI
