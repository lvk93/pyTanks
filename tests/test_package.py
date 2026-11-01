import json
import re
from pathlib import Path

import pytanks

ROOT = Path(__file__).parents[1]


def test_drawing_module_ships_with_the_package():
    names = {p.relative_to(pytanks.js_dir()).as_posix() for p in pytanks.js_dir().rglob("*.js")}
    assert {"index.js", "kit.js", "balance.js", "blend.js", "model/idealCell.js", "model/blendTanks.js"} <= names


def test_versions_agree():
    py = re.search(r'^version = "([^"]+)"', (ROOT / "pyproject.toml").read_text(), re.M).group(1)
    js = json.loads((ROOT / "package.json").read_text())["version"]
    assert pytanks.__version__ == py
    assert js == py.replace(".dev", "-dev.")
