"""Stage 2: the ladder - each electrode as a row of tanks through its thickness.

Picture language (chargetanks.com, kinetics chapter):

* tank   = storage in one slice of the electrode. Shape from the OCP (width = dQ/dU),
           water surface = mean lithiation of the slice (equilibrium level of the particle bulk).
* notch  = equilibrium level at the particle *surface* (OCP of the surface concentration).
           Notch vs. water surface = how far solid diffusion lags behind ("sloshing").
* riser  = standpipe next to each tank, rising from the electrolyte pipe. Its water level is
           phi_s - phi_e there, i.e. what a lithium reference electrode sitting in the electrolyte
           at that position would read. Riser level vs. notch = reaction overpotential.
* arrow  = valve (charge transfer) between riser and particle surface. It shows where lithium
           crosses the interface, in which direction, and how much: width ~ local interfacial
           current density, slope = overpotential. It always runs downhill.
* pipe   = electrolyte below the tanks. Shade = salt concentration (pale = drained),
           thickness = effective conductivity kappa(c_e) * transport efficiency.

The potential axis points down (depth below the Li/Li+ ceiling), as for the balance tanks. Anode
and cathode get two windows on the *same* scale (mV per cm), with the axis broken in between, so
the cathode hangs below the anode as in the balance picture.

Everything comes from a PyBaMM solution; pytanks only averages it over slices and draws it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap, Normalize, to_rgb
from matplotlib.lines import Line2D
from matplotlib.patches import Patch, Rectangle

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


def potential_band(e: Electrode, *, span=None, min_span=None, margin=None) -> tuple[float, float]:
    """Zoom window (low, high) in V around all levels of one electrode; ``span`` fixes its width."""
    g = tokens()["geometry"]
    min_span = g["zoom_min_span_V"] if min_span is None else min_span
    margin = g["zoom_margin"] if margin is None else margin
    lv = np.concatenate([e.u_water, e.u_notch, e.u_pipe])
    lo, hi = float(lv.min()), float(lv.max())
    width = max(hi - lo, min_span) * (1 + 2 * margin)
    if span is not None:
        width = max(width, span)
    mid = (lo + hi) / 2
    return mid - width / 2, mid + width / 2


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


def riser_x(e: Electrode, i: int) -> float:
    """Standpipe of slice i: on the slot boundary towards the separator."""
    return float(e.centers[i] + e.separator_side * e.widths[i] / 2)


def valve_geometry(e: Electrode, i: int, scale: float):
    """(riser point, notch point, lithium into particle?) for slice i, in data coordinates."""
    cx = e.centers[i]
    side = e.separator_side
    rw = tokens()["geometry"]["riser_width"] * e.widths[i]
    x_riser = riser_x(e, i) - side * rw / 2
    w = e.slice_profile(i).scaled(scale).width_at(e.u_notch[i])
    x_wall = cx + side * w / 2
    into = e.j[i] < 0
    return (x_riser, e.u_pipe[i]), (x_wall, e.u_notch[i]), into


def salt_cmap():
    """Pale (drained) to full water colour, blended into the current background."""
    bg = np.array(to_rgb(color("background")))
    water = np.array(to_rgb(color("water")))
    return LinearSegmentedColormap.from_list("salt", [bg + 0.25 * (water - bg), water])


def draw_riser(ax, x, width, level, bottom, face):
    """Standpipe: water column from ``bottom`` up to ``level`` (potential axis points down)."""
    ax.add_patch(Rectangle((x - width / 2, level), width, bottom - level, facecolor=face, lw=0, zorder=1.5))
    for xx in (x - width / 2, x + width / 2):
        ax.plot([xx, xx], [bottom, level - 0.02 * abs(bottom - level) - 1e-4], color=color("muted"), lw=0.5,
                zorder=1.6)


def draw_electrode(ax, e: Electrode, *, band=None, j_max=None, notch=True, valves=True, risers=True,
                   water=True, show_zero=True, salt=None):
    """Draw one electrode as a row of slice tanks on ``ax`` (x = position [um], y = potential, down)."""
    tk = tokens()
    band = potential_band(e) if band is None else band
    scale = tank_scale(e, band)
    edge_color = color("anode" if e.side == "negative" else "cathode")
    j_max = float(np.max(np.abs(e.j))) if j_max is None else j_max
    lw_min, lw_max = tk["linewidth"]["valve_min"], tk["linewidth"]["valve_max"]
    cmap, norm = salt if salt is not None else (salt_cmap(), Normalize(0, max(e.c_e.max(), 1)))
    rw = tk["geometry"]["riser_width"]
    for i, cx in enumerate(e.centers):
        p = e.slice_profile(i).scaled(scale)
        draw_tank(ax, p, cx, e.fill[i] if water else None, edge_color, lw=tk["linewidth"]["tank"])
        if risers:
            draw_riser(ax, riser_x(e, i), rw * e.widths[i], e.u_pipe[i], band[1] + 1, cmap(norm(e.c_e[i])))
        if notch:
            w = p.width_at(e.u_notch[i])
            xn = cx + e.separator_side * w / 2
            ax.plot(xn + e.separator_side * 0.035 * e.widths[i], e.u_notch[i],
                    marker="<" if e.separator_side > 0 else ">", ms=4.5, color=color("cell"), mew=0, zorder=5)
        if valves and j_max > 0 and abs(e.j[i]) > 0.02 * j_max:
            (xp, up), (xw, un), into = valve_geometry(e, i, scale)
            if abs(up - un) < 0.02 * (band[1] - band[0]):  # overpotential too small to draw an arrow
                continue
            start, end = ((xp, up), (xw, un)) if into else ((xw, un), (xp, up))
            lw = lw_min + (lw_max - lw_min) * abs(e.j[i]) / j_max
            ax.annotate("", xy=end, xytext=start, zorder=6,
                        arrowprops=dict(arrowstyle="-|>", lw=lw, color=color("valve"), shrinkA=1, shrinkB=2,
                                        mutation_scale=4 + 1.5 * lw))
    if show_zero and band[0] < 0 < band[1]:
        ax.axhline(0, color=color("warn"), lw=0.8, ls=(0, (4, 3)), zorder=1)
    ax.set_ylim(band[1], band[0])  # potential points down
    return {"band": band, "scale": scale}


def draw_pipe(ax, x0, x1, c_e, kappa_eff, kappa_ref, cmap, norm):
    h = 0.25 + 0.75 * kappa_eff / kappa_ref
    ax.add_patch(Rectangle((x0, -h / 2), x1 - x0, h, facecolor=cmap(norm(c_e)), lw=0, zorder=1))
    for y in (-h / 2, h / 2):
        ax.plot([x0, x1], [y, y], color=color("muted"), lw=0.6, zorder=2, solid_capstyle="butt")
    return h


def _break_marks(ax_top, ax_bottom):
    d = 0.012
    kw = dict(color=color("muted"), lw=0.8, clip_on=False)
    for ax, y in ((ax_top, 0), (ax_bottom, 1)):
        for x in (0, 1):
            ax.plot([x - d, x + d], [y - 2 * d, y + 2 * d], transform=ax.transAxes, **kw)


def plot_ladder(sim_or_solution, t: float | None = None, *, parameter_values=None, n_slices: int = 5,
                notch: bool = True, valves: bool = True, risers: bool = True, pipe: bool = True,
                legend: bool = True, width="double", title: str | None = None, theme: str | None = None,
                markers: bool | None = None):
    """Full-cell ladder at time ``t``: anode and cathode as rows of tanks, electrolyte pipe below.

    Anode (top) and cathode (bottom) share one potential scale with the axis broken in between.
    Returns ``(fig, axes)`` with ``axes = {"negative", "positive", "pipe", "ladder"}``.
    Every layer can be switched off to keep paper figures lean.
    """
    if markers is not None:  # old name of the risers
        risers = markers
    L = ladder(sim_or_solution, t, parameter_values=parameter_values, n_slices=n_slices)
    n, p = L.negative, L.positive
    s0, s1 = L.separator_edges
    x_end = float(p.edges[-1])
    j_max = float(max(np.abs(n.j).max(), np.abs(p.j).max()))
    span = max(np.diff(potential_band(n))[0], np.diff(potential_band(p))[0])
    bn, bp = potential_band(n, span=span), potential_band(p, span=span)
    k_ref = float(max(n.kappa_eff.max(), p.kappa_eff.max(), L.separator_kappa_eff))
    c_top = float(max(n.c_e.max(), p.c_e.max(), L.separator_c_e, L.c_e0))

    with style_context(theme):
        cmap, norm = salt_cmap(), Normalize(0, c_top)
        fig = plt.figure(figsize=figsize(width, 0.78))
        rows = [1, 1, 0.3] if pipe else [1, 1]
        gs = fig.add_gridspec(len(rows), 1, height_ratios=rows, hspace=0.06)
        ax_n = fig.add_subplot(gs[0])
        ax_p = fig.add_subplot(gs[1], sharex=ax_n)
        for ax in (ax_n, ax_p):
            ax.axvspan(s0, s1, color=color("grid"), alpha=0.5, lw=0, zorder=0)
            for sp in ("top", "right", "bottom"):
                ax.spines[sp].set_visible(False)
            ax.tick_params(axis="x", bottom=False, labelbottom=False)
        kw = dict(j_max=j_max, notch=notch, valves=valves, risers=risers, salt=(cmap, norm))
        draw_electrode(ax_n, n, band=bn, **kw)
        draw_electrode(ax_p, p, band=bp, **kw)
        if risers:  # anode standpipes run on through the cathode window (they are full there)
            rw = tokens()["geometry"]["riser_width"]
            for i in range(len(n.centers)):
                draw_riser(ax_p, riser_x(n, i), rw * n.widths[i], bp[0] - 1, bp[1] + 1, cmap(norm(n.c_e[i])))
        ax_n.set_xlim(0, x_end)
        _break_marks(ax_n, ax_p)
        ax_n.set_title("Anode", loc="left", color=color("anode"), fontweight="bold", fontsize=9, pad=3)
        ax_p.text(0.005, 0.97, "Cathode  \u2198", transform=ax_p.transAxes, color=color("cathode"),
                  fontweight="bold", va="top", fontsize=9)
        ax_n.text((s0 + s1) / 2, 0.99, "sep.", transform=ax_n.get_xaxis_transform(), ha="center", va="top",
                  fontsize=6.5, color=color("muted"))
        fig.supylabel("potential vs Li/Li$^+$ [V]   (same scale, axis broken)", fontsize=8, color=color("ink"))
        if L.plating_potential < 0:
            ax_n.text(0.99, 0.03, f"plating: {L.plating_potential * 1e3:.0f} mV at separator",
                      transform=ax_n.transAxes, ha="right", va="bottom", color=color("warn"), fontsize=7)
        axes = {"negative": ax_n, "positive": ax_p, "ladder": L}
        if legend:
            handles = [
                Patch(facecolor=color("water"), alpha=0.85, label="lithium in the particles"),
                Line2D([], [], ls="", marker="<", ms=5, color=color("cell"), label="level at the particle surface"),
                Patch(facecolor=cmap(0.85), edgecolor=color("muted"), label=r"standpipe: level in the electrolyte"),
                Line2D([], [], color=color("valve"), lw=1.6, marker=">", markevery=[1], ms=4,
                       label="valve: reaction current, runs downhill"),
            ]
            ax_n.legend(handles=handles, loc="upper right", fontsize=6.5, handlelength=1.4, borderaxespad=0.2)
        if pipe:
            ax_e = fig.add_subplot(gs[2], sharex=ax_n)
            heights = {}
            for e in (n, p):
                for i in range(len(e.c_e)):
                    heights[(e.side, i)] = draw_pipe(ax_e, e.edges[i], e.edges[i + 1], e.c_e[i], e.kappa_eff[i],
                                                     k_ref, cmap, norm)
            draw_pipe(ax_e, s0, s1, L.separator_c_e, L.separator_kappa_eff, k_ref, cmap, norm)
            if risers:
                rw = tokens()["geometry"]["riser_width"]
                for e in (n, p):
                    for i in range(len(e.c_e)):
                        h = heights[(e.side, i)]
                        ax_e.add_patch(Rectangle((riser_x(e, i) - rw * e.widths[i] / 2, h / 2 - 0.01),
                                                 rw * e.widths[i], 0.6 - h / 2, facecolor=cmap(norm(e.c_e[i])),
                                                 lw=0, zorder=1, clip_on=False))
            ax_e.set_ylim(-0.6, 0.6)
            ax_e.set_yticks([])
            for sp in ("top", "right", "left"):
                ax_e.spines[sp].set_visible(False)
            ax_e.set_xlabel("position from the anode current collector [µm]")
            ax_e.text(0.0, -0.58, "electrolyte: faint = drained of salt, thin = poor conductivity",
                      fontsize=6.5, color=color("muted"), va="bottom")
            axes["pipe"] = ax_e
        else:
            ax_p.tick_params(axis="x", bottom=True, labelbottom=True)
            ax_p.set_xlabel("position from the anode current collector [µm]")
        if title is None:
            mode = "charge" if L.current < -1e-9 else "discharge" if L.current > 1e-9 else "rest"
            title = (f"{L.model + ', ' if L.model else ''}t = {L.t:.0f} s ({mode}), I = {L.current:.2f} A, "
                     f"V = {L.voltage:.3f} V")
        if title:
            fig.suptitle(title, fontsize=8, color=color("ink"))
    return fig, axes
