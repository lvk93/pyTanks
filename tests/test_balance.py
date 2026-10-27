import io

import numpy as np
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


def test_plot_balance_returns_editable_axes(chen):
    fig, ax = pytanks.plot_balance(chen, 0.3, lli=0.05, lam_pe=0.03)
    assert set(ax) >= {"tanks", "electrodes", "cell", "balance"}
    buf = io.BytesIO()
    fig.savefig(buf, format="svg")
    svg = buf.getvalue().decode()
    assert "cell voltage" in svg  # text stays text (svg.fonttype = none)
    buf = io.BytesIO()
    fig.savefig(buf, format="pdf")
    assert buf.getvalue()[:4] == b"%PDF"


def test_tanks_water_surface_matches_half_cells(chen):
    import matplotlib.pyplot as plt

    b = pytanks.balance(chen, soc=0.7)
    fig, ax = plt.subplots()
    info = pytanks.draw_tanks(ax, b)
    v = info["cathode"].potential(b.y) - info["anode"].potential(b.x)
    assert v == pytest.approx(float(b.v_cell(b.q)), abs=2e-3)
    assert np.isfinite(info["anode"].w).all()
