"""Render the README figures: python examples/make_figures.py [out_dir]"""

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import pybamm

import pytanks

out = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/img")
out.mkdir(parents=True, exist_ok=True)
pv = pybamm.ParameterValues("Chen2020")


def save(fig, name):
    for ext in ("png", "pdf"):
        fig.savefig(out / f"{name}.{ext}", dpi=300)
    print(out / f"{name}.png")


# Stage 1: lithium balance, fresh and aged
fig, _ = pytanks.plot_balance(pv, soc=0.5)
save(fig, "balance")
fig, _ = pytanks.plot_balance(pv, soc=0.9, lli=0.10, lam_pe=0.05)
save(fig, "balance_aged")

# Stage 2: the ladder during discharge, rest and charge (DFN)
exp = pybamm.Experiment(["Discharge at 2C for 15 minutes", "Rest for 15 minutes", "Charge at 1C for 10 minutes"])
sim = pybamm.Simulation(pybamm.lithium_ion.DFN(), parameter_values=pv, experiment=exp)
sim.solve()
for t, name in ((600, "ladder_discharge"), (1200, "ladder_rest"), (2300, "ladder_charge")):
    fig, _ = pytanks.plot_ladder(sim, t)
    save(fig, name)
