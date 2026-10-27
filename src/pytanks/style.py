"""Design tokens and matplotlib style in the chargetanks.com look."""

from __future__ import annotations

import contextlib
import json
from functools import lru_cache
from importlib import resources

import matplotlib.pyplot as plt

MM = 1 / 25.4  # inch per mm


@lru_cache(maxsize=1)
def tokens() -> dict:
    """Design tokens (colors, line widths, geometry) shared with chargetanks.com."""
    with resources.files("pytanks.styles").joinpath("tokens.json").open(encoding="utf-8") as fh:
        return json.load(fh)


def color(name: str) -> str:
    return tokens()["colors"][name]


def style_path() -> str:
    """Path of ``chargetanks.mplstyle``, usable with ``plt.style.use``."""
    return str(resources.files("pytanks.styles").joinpath("chargetanks.mplstyle"))


def use_style() -> None:
    """Apply the chargetanks style globally."""
    plt.style.use(style_path())


@contextlib.contextmanager
def style_context():
    """Apply the chargetanks style inside a ``with`` block only."""
    with plt.style.context(style_path()):
        yield


def figsize(width: str | float = "double", aspect: float = 0.62) -> tuple[float, float]:
    """Figure size in inches for journal layouts.

    ``width`` is ``"single"`` (85 mm), ``"double"`` (170 mm) or a width in mm.
    """
    mm = tokens()["figure_mm"].get(width, width) if isinstance(width, str) else width
    return mm * MM, mm * MM * aspect
