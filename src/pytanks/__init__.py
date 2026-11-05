"""pytanks: lithium-ion cells drawn as tanks - the chargetanks.com picture language for PyBaMM.

Python computes from PyBaMM, one JavaScript module draws (``js_dir()``); chargetanks.com draws with the same module.
"""

from importlib import resources
from pathlib import Path

from .balance import Balance, balance

__version__ = "0.4.0"

__all__ = ["Balance", "balance", "js_dir"]


def js_dir() -> Path:
    """Folder of the JavaScript drawing module shipped with the package (``index.js``, ``kit.js``, ...)."""
    return Path(str(resources.files("pytanks") / "js"))
