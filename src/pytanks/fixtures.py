"""Reference fixtures for chargetanks.com.

pytanks is the single source of truth. The website draws in JavaScript and tests its drawing code
against these files:

    python -m pytanks.fixtures out_dir

writes ``tokens.json`` and ``fixtures/ideal_tanks.json`` (the ideal tanks used in the
lithium-balance chapter: profile widths, water surfaces and cell voltages).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from . import __version__
from .style import tokens
from .tanks import tank_profile

# Ideal tanks of the lithium-balance chapter (assets/js/model/idealCell.js)
IDEAL_CATHODE = {"empty": 4.3, "full": 3.6}
IDEAL_ANODE = {"empty": 0.6, "full": 0.08}


def _line(t):
    return lambda f: t["empty"] - (t["empty"] - t["full"]) * np.asarray(f)


def ideal_tanks() -> dict:
    cases = []
    for q_cath, q_anode, fills in ((10.0, 11.0, (0.0, 0.25, 0.5, 0.75, 1.0)), (10.0, 16.0, (0.1, 0.6))):
        pc = tank_profile(_line(IDEAL_CATHODE), q_cath)
        pa = tank_profile(_line(IDEAL_ANODE), q_anode)
        for f in fills:
            cases.append({
                "qCath": q_cath, "qAnode": q_anode, "fill": f,
                "cathode": {"width": float(pc.w.mean()), "surface": pc.potential(f)},
                "anode": {"width": float(pa.w.mean()), "surface": pa.potential(f)},
            })
    return {"pytanks": __version__, "tolerance": 1e-6, "cathode": IDEAL_CATHODE, "anode": IDEAL_ANODE,
            "cases": cases}


def export(out_dir: str | Path) -> list[Path]:
    out = Path(out_dir)
    (out / "fixtures").mkdir(parents=True, exist_ok=True)
    files = [out / "tokens.json", out / "fixtures" / "ideal_tanks.json"]
    files[0].write_text(json.dumps(tokens(), indent=2) + "\n", encoding="utf-8")
    files[1].write_text(json.dumps(ideal_tanks(), indent=2) + "\n", encoding="utf-8")
    return files


if __name__ == "__main__":
    for p in export(sys.argv[1] if len(sys.argv) > 1 else "."):
        print(p)
