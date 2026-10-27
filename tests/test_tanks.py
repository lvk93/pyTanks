import json

import matplotlib.pyplot as plt
import numpy as np
import pytest

import pytanks
from pytanks.tanks import water_polygon


def ideal(empty, full):
    return lambda f: empty - (empty - full) * np.asarray(f)


def area(poly):
    x, y = poly[:, 0], poly[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def test_tokens_and_style_load():
    t = pytanks.tokens()
    for key in ("anode", "cathode", "water", "ceiling"):
        assert t["colors"][key].startswith("#")
    for theme in ("site", "paper"):
        for key in ("background", "ink", "muted", "warn", "valve"):
            assert t["themes"][theme][key].startswith("#")
    with pytanks.style_context("paper"):
        assert plt.rcParams["figure.facecolor"] == "#ffffff"
    with pytanks.style_context():
        assert plt.rcParams["pdf.fonttype"] == 42
        assert plt.rcParams["svg.fonttype"] == "none"
    assert json.loads(json.dumps(t)) == t


def test_figsize_presets():
    assert pytanks.figsize("single")[0] == pytest.approx(85 / 25.4)
    assert pytanks.figsize("double")[0] == pytest.approx(170 / 25.4)
    assert pytanks.figsize(120)[0] == pytest.approx(120 / 25.4)


def test_ideal_tank_has_constant_width():
    # ideal cathode of the website: 4.3 V empty, 3.6 V full, 10 Ah -> 10 Ah / 0.7 V
    p = pytanks.tank_profile(ideal(4.3, 3.6), 10.0)
    assert np.allclose(p.w, 10 / 0.7, rtol=1e-6)


@pytest.mark.parametrize("fill", [0.1, 0.5, 0.93])
def test_water_volume_equals_lithium(fill):
    # area of the water polygon in (Ah/V x V) = lithium in Ah
    p = pytanks.tank_profile(ideal(0.6, 0.08), 16.0)
    assert area(water_polygon(p, 0.0, fill)) == pytest.approx(16.0 * fill, rel=1e-3)


def test_plateaus_are_capped():
    flat = lambda f: 0.1 + 0.0 * np.asarray(f) + 0.2 * (np.asarray(f) < 0.05)
    p = pytanks.tank_profile(flat, 5.0)
    assert np.isfinite(p.w).all() and p.max_width < 1e3
