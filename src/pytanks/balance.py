"""Stage 1: the lithium balance at equilibrium ("show balancing").

Everything is computed by PyBaMM (ElectrodeSOHSolver and the OCP functions of the parameter set);
pytanks only draws it.
"""

from __future__ import annotations

from dataclasses import dataclass

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyArrowPatch

from . import _pybamm
from .style import color, figsize, style_context
from .tanks import TankProfile, draw_ceiling, draw_tank, tank_profile


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


def _profiles(b: Balance) -> tuple[TankProfile, TankProfile]:
    # Graphite-like anodes climb to >2 V when empty; the window never gets there, so the tank
    # is cut a little below the empty end of the operating window (keeps the picture compact).
    u_cut = max(0.6, float(b.Un(b.x_0)) + 0.05)
    return tank_profile(b.Un, b.Q_n, u_max=u_cut), tank_profile(b.Up, b.Q_p)


def _panel(ax):
    """Plot area as on the website: lighter panel, horizontal grid lines, no frame."""
    ax.set_facecolor(color("panel"))
    ax.grid(axis="y", color=color("grid"), lw=0.6)
    ax.set_axisbelow(True)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.tick_params(axis="y", length=0)


def draw_tanks(ax, b: Balance, *, fresh: Balance | None = None, labels: bool = True, voltage: bool = True):
    """Both tanks hanging from the Li/Li+ ceiling, water at the chosen SOC, cell voltage in between."""
    pa, pc = _profiles(b)
    gap = 0.9 * max(pa.max_width, pc.max_width)
    if fresh is not None:
        fa, fc = _profiles(fresh)
        wa, wc = max(pa.max_width, fa.max_width), max(pc.max_width, fc.max_width)
    else:
        wa, wc = pa.max_width, pc.max_width
    cxa, cxc = wa / 2, wa + gap + wc / 2
    x1 = wa + gap + wc
    draw_ceiling(ax, 0, x1)
    if fresh is not None:
        draw_tank(ax, fa, cxa, None, color("muted"), linestyle=(0, (3, 2)), lw=0.8, water=False, zorder=1)
        draw_tank(ax, fc, cxc, None, color("muted"), linestyle=(0, (3, 2)), lw=0.8, water=False, zorder=1)
    draw_tank(ax, pa, cxa, b.x, color("anode"))
    draw_tank(ax, pc, cxc, b.y, color("cathode"))

    ua, uc = pa.potential(b.x), pc.potential(b.y)
    if voltage:
        xv = wa + gap / 2
        ax.plot([cxa, xv], [ua, ua], color=color("muted"), lw=0.7, ls=(0, (3, 3)), zorder=1)
        ax.plot([xv, cxc], [uc, uc], color=color("muted"), lw=0.7, ls=(0, (3, 3)), zorder=1)
        ax.add_patch(FancyArrowPatch((xv, ua), (xv, uc), arrowstyle="<|-|>", mutation_scale=7, lw=1.0,
                                     color=color("cell"), shrinkA=0, shrinkB=0, zorder=3))
        ax.text(xv + gap * 0.06, (ua + uc) / 2, f"{uc - ua:.2f} V", va="bottom", ha="left",
                fontsize=9, fontweight="bold", color=color("cell"))
        ax.text(xv + gap * 0.06, (ua + uc) / 2, "cell voltage", va="top", ha="left", fontsize=7,
                color=color("muted"))
    if labels:
        low = max(pa.u.max(), pc.u.max())
        ax.text(cxa, pa.u.max() + 0.08, f"Anode {b.x:.0%}", ha="center", va="top", color=color("anode"),
                fontweight="bold", fontsize=8)
        ax.text(cxc, pc.u.max() + 0.08, f"Cathode {b.y:.0%}", ha="center", va="top", color=color("cathode"),
                fontweight="bold", fontsize=8)
    else:
        low = max(pa.u.max(), pc.u.max())
    ax.set_xlim(-0.05 * x1, 1.05 * x1)
    ax.set_ylim(low + 0.35, -0.3)  # potential points down: depth below the ceiling = potential
    ax.axis("off")
    return {"anode": pa, "cathode": pc, "x_anode": cxa, "x_cathode": cxc}


def draw_electrodes(ax, b: Balance, *, marker: bool = True, labels: bool = True):
    """Both half-cell potentials over the lithium in the negative electrode, operating window shaded."""
    q_lo, q_hi = b.q_range
    q = np.linspace(q_lo, q_hi, 400)
    _panel(ax)
    ax.axvspan(b.x_0 * b.Q_n, b.x_100 * b.Q_n, color=color("water"), alpha=0.12, lw=0, zorder=0)
    ax.axhline(0, color=color("ceiling"), lw=0.8, ls=(0, (2, 2)))
    ax.plot(q, b.up_q(q), color=color("cathode"))
    ax.plot(np.linspace(0, q_hi, 400), b.un_q(np.linspace(0, q_hi, 400)), color=color("anode"))
    if b.Q_n > q_hi + 1e-9:  # part of the anode that the lithium never reaches: dashed
        qq = np.linspace(q_hi, b.Q_n, 120)
        ax.plot(qq, b.un_q(qq), color=color("anode"), ls=(0, (4, 3)), alpha=0.7)
    if marker:
        ax.plot([b.q, b.q], [b.un_q(b.q), b.up_q(b.q)], color=color("cell"), lw=1.0, zorder=3)
        for v, c in ((b.up_q(b.q), "cathode"), (b.un_q(b.q), "anode")):
            ax.plot(b.q, v, "o", ms=5, mfc=color(c), mec=color("marker_edge"), mew=1.0, zorder=4)
    if labels:
        ax.text(0.02, 0.95, "cathode", transform=ax.transAxes, color=color("cathode"), fontweight="bold", va="top")
        ax.text(0.62, 0.12, "anode", transform=ax.transAxes, color=color("anode"), fontweight="bold", va="top")
        ax.text(0.99, 0.005, "ceiling Li/Li$^+$", transform=ax.transAxes, color=color("muted"), fontsize=7,
                va="bottom", ha="right")
    ax.set_xlim(0, max(b.Q_n, q_hi) * 1.02)
    ax.set_ylim(-0.1, 4.6)
    ax.set_xlabel("lithium in the anode [Ah]")
    ax.set_ylabel("potential vs Li/Li$^+$ [V]")


def draw_cell(ax, b: Balance, *, fresh: Balance | None = None, marker: bool = True):
    """Cell voltage over the lithium in the negative electrode with Vmin / Vmax."""
    q_lo, q_hi = b.q_range
    q = np.linspace(q_lo, q_hi, 400)
    _panel(ax)
    ax.axvspan(b.x_0 * b.Q_n, b.x_100 * b.Q_n, color=color("water"), alpha=0.18, lw=0, zorder=0)
    if fresh is not None:  # fresh cell, shifted to the same 0 % SOC point
        dq = fresh.x_0 * fresh.Q_n - b.x_0 * b.Q_n
        fl, fh = fresh.q_range
        qf = np.linspace(fl, fh, 400)
        ax.plot(qf - dq, fresh.v_cell(qf), color=color("muted"), ls=(0, (4, 3)), lw=1.0, label="fresh")
    ax.plot(q, b.v_cell(q), color=color("cell"))
    for v, name, xa, ha in ((b.v_max, "Vmax", 0.01, "left"), (b.v_min, "Vmin", 0.99, "right")):
        ax.axhline(v, color=color("warn"), lw=0.8, ls=(0, (4, 3)))
        ax.text(xa, v + 0.03, f"{name} {v:.2f} V", transform=ax.get_yaxis_transform(), ha=ha, va="bottom",
                fontsize=6.5, color=color("warn"))
    if marker:
        ax.plot(b.q, float(b.v_cell(b.q)), "o", ms=5, mfc=color("water"), mec=color("marker_edge"), mew=1.0,
                zorder=4)
    ax.set_ylim(b.v_min - 0.35, b.v_max + 0.25)
    ax.set_xlabel("lithium in the anode [Ah]")
    ax.set_ylabel("cell voltage [V]")


def plot_balance(parameter_values, soc: float = 0.5, *, lli: float = 0.0, lam_ne: float = 0.0,
                 lam_pe: float = 0.0, show_fresh: bool | None = None, width="double", title: str | None = None,
                 theme: str | None = None):
    """One call, one figure: tanks, electrode potentials and cell voltage of a PyBaMM parameter set.

    Returns ``(fig, axes)`` with ``axes = {"tanks", "electrodes", "cell"}`` for further editing.
    """
    b = balance(parameter_values, soc, lli=lli, lam_ne=lam_ne, lam_pe=lam_pe)
    aged = bool(lli or lam_ne or lam_pe)
    fresh = balance(parameter_values, soc) if (aged and show_fresh is not False) else None
    with style_context(theme):
        fig = plt.figure(figsize=figsize(width, 0.62))
        gs = fig.add_gridspec(2, 2, width_ratios=[1, 1.15], height_ratios=[1.55, 1])
        ax_t = fig.add_subplot(gs[:, 0])
        ax_e = fig.add_subplot(gs[0, 1])
        ax_c = fig.add_subplot(gs[1, 1], sharex=ax_e)
        draw_tanks(ax_t, b, fresh=fresh)
        draw_electrodes(ax_e, b)
        ax_e.set_xlabel("")
        plt.setp(ax_e.get_xticklabels(), visible=False)
        draw_cell(ax_c, b, fresh=fresh)
        if fresh is not None:
            ax_c.legend(loc="lower right", bbox_to_anchor=(1, 0.22))
        if title is None:
            title = f"N/P (theoretical) = {b.np_ratio:.2f}, capacity {b.capacity:.2f} Ah, SOC {soc:.0%}"
            if aged:
                title += f"  |  LLI {lli:.0%}, LAM$_{{ne}}$ {lam_ne:.0%}, LAM$_{{pe}}$ {lam_pe:.0%}"
        if title:
            fig.suptitle(title, fontsize=8, color=color("ink"))
    return fig, {"tanks": ax_t, "electrodes": ax_e, "cell": ax_c, "balance": b}
