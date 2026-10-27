"""Thin helpers to read what pytanks needs from PyBaMM. No model logic of our own lives here."""

from __future__ import annotations

import numpy as np
import pybamm

SIDES = {"negative": "Negative", "positive": "Positive"}


def _side(electrode: str) -> str:
    key = electrode.lower()
    if key in ("n", "neg", "anode"):
        key = "negative"
    if key in ("p", "pos", "cathode"):
        key = "positive"
    if key not in SIDES:
        raise ValueError(f"electrode must be 'negative' or 'positive', got {electrode!r}")
    return key


def ocp_function(parameter_values: pybamm.ParameterValues, electrode: str, *, temperature=None, n: int = 2001):
    """Open-circuit potential U(stoichiometry) as a fast numpy callable (tabulated once)."""
    side = SIDES[_side(electrode)]
    fn = parameter_values[f"{side} electrode OCP [V]"]
    T = temperature if temperature is not None else parameter_values["Reference temperature [K]"]
    sto = np.linspace(0.0, 1.0, n)
    sto_c = np.clip(sto, 1e-6, 1 - 1e-6)  # many OCP fits are singular at the ends
    if callable(fn):
        vec = pybamm.Vector(sto_c)
        try:
            expr = fn(vec)
        except TypeError:
            expr = fn(vec, pybamm.Scalar(T))
        u = np.asarray(parameter_values.evaluate(expr), dtype=float).ravel()
    else:
        u = np.full_like(sto, float(fn))
    if u.size == 1:
        u = np.full_like(sto, float(u[0]))

    def U(f):
        return np.interp(np.asarray(f, dtype=float), sto, u)

    return U


def esoh(parameter_values: pybamm.ParameterValues, *, Q_n=None, Q_p=None, Q_Li=None) -> dict:
    """Electrode state of health from PyBaMM's ElectrodeSOHSolver (optionally with changed inventories)."""
    param = pybamm.LithiumIonParameters()
    base = {
        "Q_n": float(parameter_values.evaluate(param.n.Q_init)),
        "Q_p": float(parameter_values.evaluate(param.p.Q_init)),
        "Q_Li": float(parameter_values.evaluate(param.Q_Li_particles_init)),
    }
    inputs = dict(base)
    for k, v in (("Q_n", Q_n), ("Q_p", Q_p), ("Q_Li", Q_Li)):
        if v is not None:
            inputs[k] = float(v)
    solver = pybamm.lithium_ion.ElectrodeSOHSolver(parameter_values, param)
    sol = solver.solve(inputs)
    out = {k: float(np.asarray(v).ravel()[0]) for k, v in sol.items() if np.size(v) == 1}
    out.update(inputs)
    out["fresh"] = base
    return out


def electrolyte_conductivity(parameter_values, c_e, T):
    """kappa(c_e, T) in S/m for an array of concentrations."""
    fn = parameter_values["Electrolyte conductivity [S.m-1]"]
    if not callable(fn):
        return np.full_like(np.asarray(c_e, dtype=float), float(fn))
    out = []
    for c in np.atleast_1d(c_e):
        out.append(float(parameter_values.evaluate(fn(pybamm.Scalar(float(c)), pybamm.Scalar(float(T))))))
    return np.array(out)
