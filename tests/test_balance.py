import pybamm
import pytest

import pytanks


def test_balance_matches_pybamm_esoh(chen):
    b = pytanks.balance(chen, soc=0.5)
    sol = pybamm.lithium_ion.ElectrodeSOHSolver(chen, pybamm.LithiumIonParameters()).solve(
        {"Q_n": b.Q_n, "Q_p": b.Q_p, "Q_Li": b.Q_Li})
    assert b.capacity == pytest.approx(float(sol["Capacity [A.h]"]), rel=1e-6)
    # cell voltage at 0 % and 100 % SOC sits on Vmin / Vmax
    assert b.v_cell(b.x_0 * b.Q_n) == pytest.approx(b.v_min, abs=5e-3)
    assert b.v_cell(b.x_100 * b.Q_n) == pytest.approx(b.v_max, abs=5e-3)


def test_lli_shrinks_capacity(chen):
    fresh = pytanks.balance(chen)
    aged = pytanks.balance(chen, lli=0.1)
    assert aged.Q_Li == pytest.approx(0.9 * fresh.Q_Li)
    assert aged.capacity < fresh.capacity
