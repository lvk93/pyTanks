"""The tank: an electrode drawn as a vessel whose width is dQ/dU.

Convention (as on chargetanks.com): tanks hang from the Li/Li+ ceiling at 0 V. Depth below the
ceiling is the potential against Li/Li+, so the potential axis points *down*. The water is lithium:
filling a tank lifts the water surface towards the ceiling (lower potential). Water always runs
downhill, i.e. from low to high potential, which is the direction lithium moves on its own.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from matplotlib.patches import Polygon

from .style import color as token_color
from .style import tokens


@dataclass
class TankProfile:
    """Tank shape sampled along the lithium fill ``f`` (stoichiometry, 0 = empty, 1 = full).

    ``u`` is the potential vs Li/Li+ at that fill, ``w`` the tank width (capacity per volt, Ah/V,
    capped on flat plateaus) and ``q`` the capacity of the tank in Ah.
    """

    f: np.ndarray
    u: np.ndarray
    w: np.ndarray
    q: float

    @property
    def max_width(self) -> float:
        return float(np.max(self.w))

    def potential(self, fill: float) -> float:
        """Potential at a given fill (interpolated along the profile)."""
        return float(np.interp(fill, self.f, self.u))

    def width_at(self, u: float) -> float:
        """Tank width at potential ``u`` (u falls with f, so interpolate on the reversed arrays)."""
        return float(np.interp(u, self.u[::-1], self.w[::-1]))

    def scaled(self, factor: float) -> TankProfile:
        """Same shape, all widths multiplied by ``factor`` (drawing scale only)."""
        return TankProfile(self.f, self.u, self.w * factor, self.q)


def tank_profile(ocp, q: float, *, n: int = 400, f_range=(0.0, 1.0), window=None, cap=None,
                 u_min=-np.inf, u_max=np.inf) -> TankProfile:
    """Build the tank profile from an open-circuit potential ``ocp(f)`` and a capacity ``q`` [Ah].

    The width is the slope df/dU over a potential window (default 25 mV), which smooths noise and
    keeps straight lines (ideal tanks) at constant width. Flat plateaus would be infinitely wide, so
    the width is capped at ``cap`` (default: ``width_cap`` x the mean width of the tank).
    """
    g = tokens()["geometry"]
    window = g["smooth_window_V"] if window is None else window
    f = np.linspace(f_range[0], f_range[1], n)
    u = np.asarray(ocp(f), dtype=float)
    keep = (u >= u_min) & (u <= u_max) & np.isfinite(u)
    f, u = f[keep], u[keep]
    # width = q * (fHi - fLo) / (uHi - uLo) over all points within +-window of u_i
    near = np.abs(u[:, None] - u[None, :]) <= window
    fh = np.where(near, f[None, :], -np.inf).max(1)
    fl = np.where(near, f[None, :], np.inf).min(1)
    uh = np.where(near, u[None, :], -np.inf).max(1)
    ul = np.where(near, u[None, :], np.inf).min(1)
    w = q * (fh - fl) / np.maximum(uh - ul, g["min_dU_V"])
    if cap is None:
        span = max(float(np.ptp(u)), g["min_dU_V"])
        cap = g["width_cap"] * q * (f[-1] - f[0]) / span
    w = np.minimum(w, cap)
    return TankProfile(f=f, u=u, w=w, q=q)


def _wall_points(p: TankProfile, cx: float, rim: float):
    """Open-top wall: down the left side from the rim, across the bottom, up the right side."""
    i_top = len(p.f) - 1  # f ascending: last point is the fullest, highest in the picture
    pts = [(cx - p.w[i_top] / 2, p.u[i_top] - rim)]
    for i in range(i_top, -1, -1):  # down the left wall
        pts.append((cx - p.w[i] / 2, p.u[i]))
    for i in range(i_top + 1):  # up the right wall
        pts.append((cx + p.w[i] / 2, p.u[i]))
    pts.append((cx + p.w[i_top] / 2, p.u[i_top] - rim))
    return pts


def water_polygon(p: TankProfile, cx: float, fill: float) -> np.ndarray | None:
    """Polygon of the water (all of the tank with f <= fill)."""
    fill = float(np.clip(fill, p.f[0], p.f[-1]))
    if fill <= p.f[0]:
        return None
    wet = p.f <= fill
    u_w, w_w = p.u[wet], p.w[wet]
    u_s = p.potential(fill)
    w_s = float(np.interp(fill, p.f, p.w))
    right = list(zip(cx + w_w / 2, u_w)) + [(cx + w_s / 2, u_s)]
    left = [(cx - w_s / 2, u_s)] + list(zip(cx - w_w[::-1] / 2, u_w[::-1]))
    return np.array(right + left)


def draw_tank(ax, p: TankProfile, cx: float, fill: float | None, color: str, *, rim: float = 0.0,
              lw: float | None = None, linestyle="-", alpha: float = 1.0, water: bool = True,
              zorder: float = 2):
    """Draw one tank centred at ``cx`` on an axis whose y is the potential (pointing down)."""
    t = tokens()
    lw = t["linewidth"]["tank"] if lw is None else lw
    artists = {}
    if water and fill is not None:
        poly = water_polygon(p, cx, fill)
        if poly is not None:
            artists["water"] = ax.add_patch(Polygon(poly, closed=True, facecolor=t["colors"]["water"],
                                                    alpha=t["alpha"]["water"] * alpha, lw=0, zorder=zorder))
    wall = np.array(_wall_points(p, cx, rim))
    (artists["wall"],) = ax.plot(wall[:, 0], wall[:, 1], color=color, lw=lw, ls=linestyle, alpha=alpha,
                                 solid_joinstyle="round", zorder=zorder + 0.5)
    return artists


def draw_ceiling(ax, x0: float, x1: float, *, label: str | None = "ceiling = Li/Li$^+$ (0 V)"):
    c = token_color("ceiling")
    ax.axhspan(-0.12, 0.0, xmin=0, xmax=1, color=c, alpha=0.5, lw=0, zorder=0)
    ax.axhline(0.0, color=c, lw=1.0, zorder=0.5)
    if label:
        ax.text((x0 + x1) / 2, -0.17, label, ha="center", va="bottom", fontsize=7, color=token_color("muted"))
