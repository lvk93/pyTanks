import pybamm

import pytanks

pv = pybamm.ParameterValues("Chen2020")

# Equilibrium: one line, one figure
fig, ax = pytanks.plot_balance(pv, soc=0.5)
fig.savefig("balance.pdf")

# Aged: lost lithium inventory and cathode active material
fig, ax = pytanks.plot_balance(pv, soc=0.9, lli=0.1, lam_pe=0.05)

# Kinetics: run any PyBaMM simulation, then draw the ladder at a time [s]
sim = pybamm.Simulation(pybamm.lithium_ion.DFN(), parameter_values=pv,
                        experiment=pybamm.Experiment(["Discharge at 2C for 15 minutes"]))
sim.solve()
fig, ax = pytanks.plot_ladder(sim, t=600)
ax["negative"].set_title("anode at 2C")  # everything stays editable
fig.savefig("ladder.svg")

# Use the look for your own plots
pytanks.use_style()
