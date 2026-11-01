import pybamm
import pytest


@pytest.fixture(scope="session")
def chen():
    return pybamm.ParameterValues("Chen2020")
