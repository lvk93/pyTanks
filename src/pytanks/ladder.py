"""Stage 2: the ladder - each electrode as a row of tanks through its thickness.

Picture language (chargetanks.com, kinetics chapter):

* tank   = storage in one slice of the electrode. Shape from the OCP (width = dQ/dU),
           water surface = mean lithiation of the slice (equilibrium level of the particle bulk).
* notch  = equilibrium level at the particle *surface* (OCP of the surface concentration).
           Notch vs. water surface = how far solid diffusion lags behind ("sloshing").
* marker = pipe level at that position: phi_s - phi_e, i.e. what a lithium reference electrode
           sitting in the electrolyte there would read. Marker vs. notch = reaction overpotential.
* arrow  = valve (charge transfer). Width ~ local interfacial current density. It always points
           downhill: from the higher water level to the lower one.
* pipe   = electrolyte below the tanks. Colour = salt concentration, thickness = effective
           conductivity kappa(c_e) * transport efficiency.

The potential axis points down (depth below the Li/Li+ ceiling), as for the balance tanks. Each
electrode panel is a zoom into a narrow potential band around its levels.

Everything comes from a PyBaMM solution; pytanks only averages it over slices and draws it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import TwoSlopeNorm
from matplotlib.patches import FancyArrowPatch, Rectangle

from . import _pybamm
from .style import color, figsize, style_context, tokens
from .tanks import TankProfile, draw_tank, tank_profile

# PyBaMM variable names (checked against PyBaMM 25.x / 26.x)
VAR = {
    "pipe": "{S} electrode surface potential difference [V]",
    "notch": "{S} electrode open-circuit potential [V]",
    "c_avg": "R-averaged {s} particle concentration [mol.m-3]",
    "j": "{S} electrode interfacial current density [A.m-2]",
    "c_e": "{S} electrolyte concentration [mol.m-3]",
    "eff": "{S} electrolyte transport efficiency",
    "x": "x_{c} [m]",
    "c_max": "Maximum concentration in {s} electrode [mol.m-3]",
}


PLATING = "Negative electrode surface potential difference at separator interface [V]"


def _name(key, side):
    return VAR[key].format(S=side.capitalize(), s=side, c=side[0])


@dataclass
class Electrode:
    """Slice-averaged state of one electrode at one instant."""

    side: str  # "negative" | "positive"
    edges: np.ndarray  # slice boundaries [um], measured from the negative current collector
    q_slice: np.ndarray  # capacity of each slice [Ah]
    fill: np.ndarray  # mean stoichiometry of each slice (0..1)
    u_water: np.ndarray  # U(mean stoichiometry) [V]
    u_notch: np.ndarray  # mean OCP at the particle surface [V]
    u_pipe: np.ndarray  # mean phi_s - phi_e [V]
    j: np.ndarray  # mean interfacial current density [A/m2]; < 0 = lithium goes into the particles
    c_e: np.ndarray  # mean electrolyte concentration [mol/m3]
    kappa_eff: np.ndarray  # effective electrolyte conductivity [S/m]
    profile: TankProfile = field(repr=False)  # tank shape for the whole electrode (scaled per slice)

    @property
    def centers(self) -> np.ndarray:
        return 0.5 * (self.edges[:-1] + self.edges[1:])

    @property
    def widths(self) -> np.ndarray:
        return np.diff(self.edges)

    @property
    def lithium(self) -> np.ndarray:
        """Lithium stored in each slice [Ah] (= water volume)."""
        return self.q_slice * self.fill

    @property
    def separator_side(self) -> int:
        """+1 if the separator is to the right of this electrode (anode), -1 if to the left (cathode)."""
        return 1 if self.side == "negative" else -1

    def slice_profile(self, i: int) -> TankProfile:
        return self.profile.scaled(self.q_slice[i] / self.profile.q)


@dataclass
class Ladder:
    t: float
    voltage: float
    current: float
    negative: Electrode
    positive: Electrode
    separator_edges: tuple[float, float]
    separator_c_e: float
    separator_kappa_eff: float
    c_e0: float
    plating_potential: float  # anode phi_s - phi_e at the separator; < 0 V = lithium plating possible
    model: str = ""


def _at(sol, name, t):
    """Variable at time t (linear in time), as an array over its spatial nodes."""
    var = sol[name]
    e = np.asarray(var.entries)
    ts = np.asarray(sol["Time [s]"].entries)
    if e.ndim == 1:
        return float(np.interp(t, ts, e))
    flat = e.reshape(-1, e.shape[-1])
    return np.array([np.interp(t, ts, row) for row in flat]).reshape(e.shape[:-1])


def _unpack(sim_or_solution, parameter_values):
    sol = getattr(sim_or_solution, "solution", None)
    if sol is not None:
        pv = parameter_values or sim_or_solution.parameter_values
    else:
        sol, pv = sim_or_solution, parameter_values
    if pv is None:
        raise ValueError("pass a pybamm.Simulation, or a Solution together with parameter_values=")
    return sol, pv


def ladder(sim_or_solution, t: float | None = None, *, parameter_values=None, n_slices: int = 5) -> Ladder:
    """Slice-averaged ladder state of a PyBaMM simulation at time ``t`` [s] (default: last time)."""
    if not 1 <= n_slices <= 8:
        raise ValueError("n_slices must be between 1 and 8 (more tanks stop being readable)")
    sol, pv = _unpack(sim_or_solution, parameter_values)
    ts = np.asarray(sol["Time [s]"].entries)
    t = float(ts[-1] if t is None else np.clip(t, ts[0], ts[-1]))
    try:
        T = _at(sol, "Volume-averaged cell temperature [K]", t)
    except KeyError:
        T = float(pv["Ambient temperature [K]"])
    s = _pybamm.esoh(pv)
    q_total = {"negative": s["Q_n"], "positive": s["Q_p"]}

    electrodes = {}
    for side in ("negative", "positive"):
        x = _at(sol, _name("x", side), t) * 1e6
        groups = np.array_split(np.arange(x.size), n_slices)
        dx = np.gradient(x) if x.size > 1 else np.ones(1)
        # node edges: half way between nodes, outer edges mirrored
        node_edges = np.concatenate([[x[0] - dx[0] / 2], 0.5 * (x[1:] + x[:-1]), [x[-1] + dx[-1] / 2]])
        edges = np.array([node_edges[g[0]] for g in groups] + [node_edges[-1]])
        node_w = np.diff(node_edges)

        def avg(values, groups=groups, node_w=node_w):
            v = np.asarray(values, dtype=float)
            if v.ndim == 0 or v.size == 1:
                return np.full(n_slices, float(v))
            return np.array([np.average(v[g], weights=node_w[g]) for g in groups])

        c_max = float(pv[_name("c_max", side)])
        U = _pybamm.ocp_function(pv, side)
        fill = avg(_at(sol, _name("c_avg", side), t)) / c_max
        c_e = avg(_at(sol, _name("c_e", side), t))
        eff = avg(_at(sol, _name("eff", side), t))
        frac = np.array([node_w[g].sum() for g in groups]) / node_w.sum()
        electrodes[side] = Electrode(
            side=side,
            edges=edges,
            q_slice=q_total[side] * frac,
            fill=fill,
            u_water=U(fill),
            u_notch=avg(_at(sol, _name("notch", side), t)),
            u_pipe=avg(_at(sol, _name("pipe", side), t)),
            j=avg(_at(sol, _name("j", side), t)),
            c_e=c_e,
            kappa_eff=_pybamm.electrolyte_conductivity(pv, c_e, T) * eff,
            profile=tank_profile(U, q_total[side]),
        )

    c_e_s = float(np.mean(_at(sol, "Separator electrolyte concentration [mol.m-3]", t)))
    eff_s = float(np.mean(_at(sol, "Separator electrolyte transport efficiency", t)))
    return Ladder(
        t=t,
        voltage=float(_at(sol, "Voltage [V]", t)),
        current=float(_at(sol, "Current [A]", t)),
        negative=electrodes["negative"],
        positive=electrodes["positive"],
        separator_edges=(float(electrodes["negative"].edges[-1]), float(electrodes["positive"].edges[0])),
        separator_c_e=c_e_s,
        separator_kappa_eff=float(_pybamm.electrolyte_conductivity(pv, [c_e_s], T)[0] * eff_s),
        c_e0=float(pv["Initial concentration in electrolyte [mol.m-3]"]),
        plating_potential=float(_at(sol, PLATING, t)),
        model=getattr(getattr(sol, "all_models", [None])[0], "name", ""),
    )


def potential_band(e: Electrode, *, min_span=None, margin=None) -> tuple[float, float]:
    """Zoom band (low, high) in V around all levels of one electrode."""
    g = tokens()["geometry"]
    min_span = g["zoom_min_span_V"] if min_span is None else min_span
    margin = g["zoom_margin"] if margin is None else margin
    lv = np.concatenate([e.u_water, e.u_notch, e.u_pipe])
    lo, hi = float(lv.min()), float(lv.max())
    span = hi - lo
    if span < min_span:
        mid = (lo + hi) / 2
        lo, hi, span = mid - min_span / 2, mid + min_span / 2, min_span
    return lo - margin * span, hi + margin * span


def tank_scale(e: Electrode, band) -> float:
    """Drawing scale (um per Ah/V) so that no tank is wider than ``slot_fill`` of its slot in the band."""
    lo, hi = band
    fill = tokens()["geometry"]["slot_fill"]
    best = np.inf
    for i in range(len(e.q_slice)):
        p = e.slice_profile(i)
        inband = (p.u >= lo) & (p.u <= hi)
        w = p.w[inband].max() if inband.any() else p.max_width
        best = min(best, fill * e.widths[i] / w)
    return float(best)


def valve_geometry(e: Electrode, i: int, scale: float):
    """(pipe point, notch point, lithium into particle?) for slice i, in data coordinates."""
    cx = e.centers[i]
    side = e.separator_side
    x_pipe = cx + side * e.widths[i] / 2
    w = e.slice_profile(i).scaled(scale).width_at(e.u_notch[i])
    x_wall = cx + side * w / 2
    into = e.j[i] < 0
    return (x_pipe, e.u_pipe[i]), (x_wall, e.u_notch[i]), into


def draw_electrode(ax, e: Electrode, *, band=None, j_max=None, notch=True, valves=True, markers=True,
                   water=True, show_zero=True):
    """Draw one electrode as a row of slice tanks on ``ax`` (x = position [um], y = potential, down)."""
    tk = tokens()
    band = potential_band(e) if band is None else band
    scale = tank_scale(e, band)
    edge_color = color("anode" if e.side == "negative" else "cathode")
    j_max = float(np.max(np.abs(e.j))) if j_max is None else j_max
    lw_min, lw_max = tk["linewidth"]["valve_min"], tk["linewidth"]["valve_max"]
    for i, cx in enumerate(e.centers):
        p = e.slice_profile(i).scaled(scale)
        draw_tank(ax, p, cx, e.fill[i] if water else None, edge_color, lw=1.1, rim=0)
        if notch:
            w = p.width_at(e.u_notch[i])
            xn = cx + e.separator_side * w / 2
            ax.plot(xn + e.separator_side * 0.03 * e.widths[i], e.u_notch[i],
                    marker="<" if e.separator_side > 0 else ">", ms=4, color=color("ink"), mew=0, zorder=5)
        if markers:
            ax.plot(cx + e.separator_side * e.widths[i] / 2, e.u_pipe[i], marker="v", ms=4.5,
                    color=color("navy"), mew=0, zorder=5, clip_on=False)
        if valves and j_max > 0 and abs(e.j[i]) > 0.02 * j_max:
            (xp, up), (xw, un), into = valve_geometry(e, i, scale)
            start, end = ((xp, up), (xw, un)) if into else ((xw, un), (xp, up))
            lw = lw_min + (lw_max - lw_min) * abs(e.j[i]) / j_max
            ax.add_patch(FancyArrowPatch(start, end, arrowstyle="-|>", mutation_scale=4 + 2 * lw, lw=lw,
                                         color=color("water_edge"), shrinkA=1.5, shrinkB=1.5, zorder=4))
    if show_zero and band[0] < 0 < band[1]:
        ax.axhline(0, color=color("warn"), lw=0.8, ls=(0, (4, 3)), zorder=1)
        ax.text(0.01, 0, "0 V: plating", transform=ax.get_yaxis_transform(), color=color("warn"), fontsize=6.5,
                va="bottom")
    ax.set_xlim(e.edges[0], e.edges[-1])
    ax.set_ylim(band[1], band[0])  # potential points down
    for s in ("top", "right", "bottom"):
        ax.spines[s].set_visible(False)
    ax.tick_params(axis="x", bottom=False, labelbottom=False)
    return {"band": band, "scale": scale}


def draw_pipe(ax, x0, x1, c_e, kappa_eff, kappa_ref, cmap, norm):
    h = 0.15 + 0.85 * kappa_eff / kappa_ref
    ax.add_patch(Rectangle((x0, -h / 2), x1 - x0, h, facecolor=cmap(norm(c_e)), edgecolor="none"))


def plot_ladder(sim_or_solution, t: float | None = None, *, parameter_values=None, n_slices: int = 5,
                notch: bool = True, valves: bool = True, markers: bool = True, pipe: bool = True,
                width="double", title: str | None = None):
    """Full-cell ladder at time ``t``: anode and cathode as rows of tanks, electrolyte pipe below.

    Returns ``(fig, axes)`` with ``axes = {"negative", "positive", "separator", "pipe_*", "ladder"}``.
    Every layer can be switched off to keep paper figures lean.
    """
    L = ladder(sim_or_solution, t, parameter_values=parameter_values, n_slices=n_slices)
    n, p = L.negative, L.positive
    s0, s1 = L.separator_edges
    ln, lp, ls = n.edges[-1] - n.edges[0], p.edges[-1] - p.edges[0], s1 - s0
    j_max = float(max(np.abs(n.j).max(), np.abs(p.j).max()))

    c_all = np.concatenate([n.c_e, p.c_e, [L.separator_c_e]])
    dev = max(float(np.max(np.abs(c_all - L.c_e0))), 0.05 * L.c_e0)
    norm = TwoSlopeNorm(vcenter=L.c_e0, vmin=max(0.0, L.c_e0 - dev), vmax=L.c_e0 + dev)
    cmap = plt.get_cmap("BrBG")
    k_ref = float(max(n.kappa_eff.max(), p.kappa_eff.max(), L.separator_kappa_eff))

    with style_context():
        fig = plt.figure(figsize=figsize(width, 0.55))
        rows = [1, 0.13] if pipe else [1]
        gs = fig.add_gridspec(len(rows), 3, width_ratios=[ln, max(ls, 0.18 * (ln + lp) / 2), lp],
                              height_ratios=rows, wspace=0.02, hspace=0.03)
        ax_n = fig.add_subplot(gs[0, 0])
        ax_s = fig.add_subplot(gs[0, 1])
        ax_p = fig.add_subplot(gs[0, 2])
        draw_electrode(ax_n, n, j_max=j_max, notch=notch, valves=valves, markers=markers)
        draw_electrode(ax_p, p, j_max=j_max, notch=notch, valves=valves, markers=markers)
        ax_s.axis("off")
        ax_n.set_title("anode", color=color("anode"), loc="center")
        ax_p.set_title("cathode", color=color("cathode"), loc="center")
        ax_n.set_ylabel("potential vs Li/Li$^+$ [V]  (zoom, down)")
        ax_p.yaxis.tick_right()
        ax_p.spines["left"].set_visible(False)
        ax_p.spines["right"].set_visible(True)
        if L.plating_potential < 0:
            ax_n.text(0.98, 0.02, f"plating: {L.plating_potential * 1e3:.0f} mV at separator",
                      transform=ax_n.transAxes, ha="right", va="bottom", color=color("warn"), fontsize=6.5)
        axes = {"negative": ax_n, "separator": ax_s, "positive": ax_p, "ladder": L}
        if pipe:
            pa = [fig.add_subplot(gs[1, k], sharex=a) for k, a in ((0, ax_n), (2, ax_p))]
            ps = fig.add_subplot(gs[1, 1])
            for e, ax in ((n, pa[0]), (p, pa[1])):
                for i in range(len(e.c_e)):
                    draw_pipe(ax, e.edges[i], e.edges[i + 1], e.c_e[i], e.kappa_eff[i], k_ref, cmap, norm)
            draw_pipe(ps, 0, 1, L.separator_c_e, L.separator_kappa_eff, k_ref, cmap, norm)
            ps.set_xlim(0, 1)
            for ax in (*pa, ps):
                ax.set_ylim(-0.55, 0.55)
                ax.set_yticks([])
                for sp in ("top", "right", "left"):
                    ax.spines[sp].set_visible(False)
            ps.set_xticks([])
            ps.spines["bottom"].set_visible(False)
            ps.text(0.5, -0.9, "sep.", ha="center", va="top", transform=ps.transData, fontsize=6.5,
                    color=color("muted"))
            pa[0].set_xlabel("position from current collector [µm]")
            pa[1].set_xlabel("position [µm]")
            sm = plt.cm.ScalarMappable(norm=norm, cmap=cmap)
            cb = fig.colorbar(sm, ax=[*pa, ps], orientation="horizontal", fraction=0.9, aspect=60, shrink=0.45,
                              pad=0.02)
            cb.set_label("electrolyte salt [mol/m³]  (pipe thickness = effective conductivity)", fontsize=6.5)
            cb.ax.tick_params(labelsize=6)
            cb.outline.set_linewidth(0.4)
            axes.update({"pipe_negative": pa[0], "pipe_positive": pa[1], "pipe_separator": ps, "colorbar": cb})
        if title is None:
            mode = "charge" if L.current < -1e-9 else "discharge" if L.current > 1e-9 else "rest"
            title = (f"{L.model + ', ' if L.model else ''}t = {L.t:.0f} s ({mode}), I = {L.current:.2f} A, "
                     f"V = {L.voltage:.3f} V")
        if title:
            fig.suptitle(title, fontsize=8, color=color("ink"))
    return fig, axes
