"""Design tokens and matplotlib style in the chargetanks.com look.

Two themes share one picture language:

* ``"site"`` (default): navy background and white lines, as on chargetanks.com.
* ``"paper"``: the same on white, for print.
"""

from __future__ import annotations

import contextlib
import json
from functools import lru_cache
from importlib import resources

import matplotlib.pyplot as plt

MM = 1 / 25.4  # inch per mm
_theme: list[str] = []  # stack of active themes


@lru_cache(maxsize=1)
def tokens() -> dict:
    """Design tokens (colors, themes, line widths, geometry) shared with chargetanks.com."""
    with resources.files("pytanks.styles").joinpath("tokens.json").open(encoding="utf-8") as fh:
        return json.load(fh)


def current_theme() -> str:
    return _theme[-1] if _theme else tokens()["default_theme"]


def color(name: str, theme: str | None = None) -> str:
    """Colour by token name: theme colours first (ink, muted, ...), then shared ones (anode, water, ...)."""
    t = tokens()
    th = t["themes"][theme or current_theme()]
    return th[name] if name in th else t["colors"][name]


def style_path() -> str:
    """Path of ``chargetanks.mplstyle``, usable with ``plt.style.use``."""
    return str(resources.files("pytanks.styles").joinpath("chargetanks.mplstyle"))


def theme_rc(theme: str | None = None) -> dict:
    th = tokens()["themes"][theme or current_theme()]
    return {
        "figure.facecolor": th["background"],
        "savefig.facecolor": th["background"],
        "axes.facecolor": th["background"],
        "text.color": th["ink"],
        "axes.labelcolor": th["ink"],
        "axes.edgecolor": th["muted"],
        "xtick.color": th["muted"],
        "ytick.color": th["muted"],
        "xtick.labelcolor": th["muted"],
        "ytick.labelcolor": th["muted"],
        "legend.labelcolor": th["ink"],
    }


def use_style(theme: str | None = None) -> None:
    """Apply the chargetanks style globally (``theme="site"`` or ``"paper"``)."""
    plt.style.use(style_path())
    plt.rcParams.update(theme_rc(theme))


@contextlib.contextmanager
def style_context(theme: str | None = None):
    """Apply the chargetanks style and a theme inside a ``with`` block only."""
    theme = theme or current_theme()
    if theme not in tokens()["themes"]:
        raise ValueError(f"theme must be one of {list(tokens()['themes'])}, got {theme!r}")
    _theme.append(theme)
    try:
        with plt.style.context(style_path()), plt.rc_context(theme_rc(theme)):
            yield
    finally:
        _theme.pop()


def figsize(width: str | float = "double", aspect: float = 0.62) -> tuple[float, float]:
    """Figure size in inches for journal layouts.

    ``width`` is ``"single"`` (85 mm), ``"double"`` (170 mm) or a width in mm.
    """
    mm = tokens()["figure_mm"].get(width, width) if isinstance(width, str) else width
    return mm * MM, mm * MM * aspect
