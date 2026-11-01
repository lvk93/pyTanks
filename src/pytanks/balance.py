"""The lithium balance at equilibrium, computed by PyBaMM.

Everything comes from PyBaMM (ElectrodeSOHSolver and the OCP functions of the parameter set). pytanks adds no model
logic of its own; the drawing lives in the JavaScript module (``pytanks/js``) shared with chargetanks.com.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import _pybamm


@dataclass
class Balance:
    """Lithium balance of a cell: inventories, operating window and the two half-cell curves."""

    Q_n: float
    Q_p: float
    Q_Li: float
    x_0: float
    x_100: float
    y_0: float
    y_100: float
    v_min: float
    v_max: float
    Un: object
    Up: object
    soc: float = 0.5

    @property
    def capacity(self) -> float:
        return self.Q_n * (self.x_100 - self.x_0)

    @property
    def x(self) -> float:
        """Negative electrode stoichiometry at the chosen SOC."""
        return self.x_0 + self.soc * (self.x_100 - self.x_0)

    @property
    def y(self) -> float:
        """Positive electrode stoichiometry at the chosen SOC."""
        return self.y_0 - self.soc * (self.y_0 - self.y_100)

    @property
    def q(self) -> float:
        """Lithium in the negative electrode [Ah] at the chosen SOC."""
        return self.x * self.Q_n

    def un_q(self, q):
        return self.Un(np.asarray(q) / self.Q_n)

    def up_q(self, q):
        return self.Up((self.Q_Li - np.asarray(q)) / self.Q_p)

    def v_cell(self, q):
        return self.up_q(q) - self.un_q(q)

    @property
    def q_range(self) -> tuple[float, float]:
        """Range of lithium in the negative electrode that both tanks allow."""
        return max(0.0, self.Q_Li - self.Q_p), min(self.Q_Li, self.Q_n)

    @property
    def np_ratio(self) -> float:
        return self.Q_n / self.Q_p


def balance(parameter_values, soc: float = 0.5, *, lli: float = 0.0, lam_ne: float = 0.0,
            lam_pe: float = 0.0) -> Balance:
    """Lithium balance from a PyBaMM parameter set, optionally aged.

    ``lli``, ``lam_ne`` and ``lam_pe`` are fractions (0..1) of lost lithium inventory and lost active
    material. They are applied to the inventories Q_Li, Q_n and Q_p before PyBaMM's
    ElectrodeSOHSolver finds the operating window (the simplest reading of the degradation modes).
    """
    s = _pybamm.esoh(parameter_values)
    fresh = s["fresh"]
    if lli or lam_ne or lam_pe:
        s = _pybamm.esoh(parameter_values, Q_n=fresh["Q_n"] * (1 - lam_ne), Q_p=fresh["Q_p"] * (1 - lam_pe),
                         Q_Li=fresh["Q_Li"] * (1 - lli))
    return Balance(
        Q_n=s["Q_n"], Q_p=s["Q_p"], Q_Li=s["Q_Li"], x_0=s["x_0"], x_100=s["x_100"], y_0=s["y_0"], y_100=s["y_100"],
        v_min=float(parameter_values["Lower voltage cut-off [V]"]),
        v_max=float(parameter_values["Upper voltage cut-off [V]"]),
        Un=_pybamm.ocp_function(parameter_values, "negative"),
        Up=_pybamm.ocp_function(parameter_values, "positive"),
        soc=soc,
    )
