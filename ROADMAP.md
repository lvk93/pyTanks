# Roadmap

## 0.1 (now)
- [x] Lithium balance from a parameter set (`plot_balance`), ageing via LLI / LAM
- [x] Ladder from SPMe/DFN results (`plot_ladder`): slice tanks, surface notch, pipe-level markers, valves, electrolyte pipe
- [x] Physics tests: arrows downhill, water volume = lithium, no overlapping tanks
- [x] Style file, design tokens, fixtures for chargetanks.com

## Next
- [ ] Overview inset: whole tank with the zoomed band marked
- [ ] Stage 3: diffusion zoom - one tank resolved into radial shells (`Positive particle concentration`), shells sized by volume, valve on the outer shell; animation over time
- [ ] Animation helper for the ladder (`animate_ladder(sim, times)`)
- [ ] Blends (graphite + silicon): two connected tanks per slice
- [ ] Double layer as a small buffer vessel at each valve (needed for the impedance chapter)
- [ ] Impedance: single tank + valve = R-RC; ladder = transmission line
- [ ] Release on PyPI with a Zenodo DOI; JOSS paper
- [ ] Ask the PyBaMM team to list pytanks among community extensions
