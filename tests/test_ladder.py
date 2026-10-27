"""The ladder must carry the right physics. These tests guard sign and axis conventions."""

import numpy as np
import pytest

import pytanks
from pytanks.ladder import potential_band, tank_scale, valve_geometry

from .conftest import INSTANTS

SIDES = ("negative", "positive")


@pytest.mark.parametrize("case", INSTANTS)
@pytest.mark.parametrize("which", ["cycle", "cycle_dfn"])
def test_valves_run_downhill(case, which, request):
    """Water runs downhill: every valve arrow goes from the higher drawn level to the lower one.

    The potential axis points down, so "higher in the picture" means "lower potential".
    """
    L = pytanks.ladder(request.getfixturevalue(which), INSTANTS[case])
    for side in SIDES:
        e = getattr(L, side)
        tol = 1e-3 * max(np.abs(e.j).max(), 1e-12)
        for i in range(len(e.j)):
            if abs(e.j[i]) < tol:
                continue
            (xp, up), (xn, un), into = valve_geometry(e, i, tank_scale(e, potential_band(e)))
            start, end = (up, un) if into else (un, up)
            assert start < end, f"{case} {side} slice {i}: arrow runs uphill"


@pytest.mark.parametrize("case", INSTANTS)
def test_current_sign_matches_mode(cycle, case):
    L = pytanks.ladder(cycle, INSTANTS[case])
    if case == "discharge":
        assert L.current > 0 and (L.negative.j > 0).all() and (L.positive.j < 0).all()
    if case == "charge":
        assert L.current < 0 and (L.negative.j < 0).all() and (L.positive.j > 0).all()
    if case == "rest":
        assert abs(L.current) < 1e-9


@pytest.mark.parametrize("case", INSTANTS)
def test_water_volume_is_lithium_in_slices(cycle_dfn, chen, case):
    """Water in the slice tanks adds up to the lithium PyBaMM has in that electrode."""
    sol = cycle_dfn.solution
    t = INSTANTS[case]
    L = pytanks.ladder(cycle_dfn, t)
    for side in SIDES:
        e = getattr(L, side)
        c_max = chen[f"Maximum concentration in {side} electrode [mol.m-3]"]
        name = f"{side.capitalize()} electrode volume-averaged concentration [mol.m-3]"
        sto = np.interp(t, sol["Time [s]"].entries, sol[name].entries) / c_max
        assert e.lithium.sum() == pytest.approx(e.q_slice.sum() * sto, rel=2e-3)


@pytest.mark.parametrize("case", INSTANTS)
def test_tanks_never_touch(cycle_dfn, case):
    L = pytanks.ladder(cycle_dfn, INSTANTS[case])
    fill = pytanks.tokens()["geometry"]["slot_fill"]
    for side in SIDES:
        e = getattr(L, side)
        band = potential_band(e)
        k = tank_scale(e, band)
        for i in range(len(e.q_slice)):
            p = e.slice_profile(i).scaled(k)
            w = p.w[(p.u >= band[0]) & (p.u <= band[1])]
            assert w.max() <= fill * e.widths[i] * (1 + 1e-9)


def test_slices_cover_the_electrode(cycle):
    L = pytanks.ladder(cycle, 300, n_slices=4)
    for side in SIDES:
        e = getattr(L, side)
        assert len(e.centers) == 4
        assert np.all(np.diff(e.edges) > 0)
    assert L.negative.edges[-1] <= L.positive.edges[0]
    with pytest.raises(ValueError):
        pytanks.ladder(cycle, 300, n_slices=12)


def test_plating_potential_is_reported(cycle_dfn):
    _, ax = pytanks.plot_ladder(cycle_dfn, INSTANTS["charge"])
    sol = cycle_dfn.solution
    name = "Negative electrode surface potential difference at separator interface [V]"
    expected = float(np.interp(INSTANTS["charge"], sol["Time [s]"].entries, sol[name].entries))
    assert ax["ladder"].plating_potential == pytest.approx(expected)


@pytest.mark.parametrize("flags", [{}, {"notch": False, "valves": False, "markers": False, "pipe": False}])
def test_plot_ladder_layers_switch_off(cycle, flags):
    fig, ax = pytanks.plot_ladder(cycle, INSTANTS["discharge"], **flags)
    assert ("pipe_negative" in ax) == flags.get("pipe", True)
