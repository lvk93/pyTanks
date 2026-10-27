import matplotlib

matplotlib.use("Agg")

import pybamm
import pytest


@pytest.fixture(scope="session")
def chen():
    return pybamm.ParameterValues("Chen2020")


@pytest.fixture(scope="session")
def cycle(chen):
    """Discharge, rest and charge with the SPMe (fast) - the three cases the ladder must get right."""
    exp = pybamm.Experiment(["Discharge at 2C for 10 minutes", "Rest for 10 minutes", "Charge at 1C for 5 minutes"])
    sim = pybamm.Simulation(pybamm.lithium_ion.SPMe(), parameter_values=chen, experiment=exp)
    sim.solve()
    return sim


@pytest.fixture(scope="session")
def cycle_dfn(chen):
    exp = pybamm.Experiment(["Discharge at 2C for 10 minutes", "Rest for 10 minutes", "Charge at 1C for 5 minutes"])
    sim = pybamm.Simulation(pybamm.lithium_ion.DFN(), parameter_values=chen, experiment=exp)
    sim.solve()
    return sim


# Instants inside the discharge, rest and charge step [s]
INSTANTS = {"discharge": 450.0, "rest": 900.0, "charge": 1380.0}
