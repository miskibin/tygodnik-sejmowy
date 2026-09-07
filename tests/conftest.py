"""Root pytest conftest.

Eagerly import the supagraf subpackages that tests target with
`unittest.mock.patch("supagraf.X.Y.Z")`. Without this, `mock._dot_lookup`
fails with `AttributeError: module 'supagraf' has no attribute 'X'` in
large batch runs.

Workaround (pytest_runtest_setup): pytest sometimes replaces
`sys.modules["supagraf"]` between conftest load and individual test
execution (root cause not pinned — possibly conftest re-instantiation
across nested package roots `unit/`/`contract/`/`e2e/`). The replacement
object lacks the submodule attributes that `import supagraf.X` would
normally set on the parent. We re-attach every `supagraf.*` submodule
that's already in sys.modules before each test runs, which is cheap and
robust.
"""
from __future__ import annotations

import sys

import supagraf  # noqa: F401
import supagraf.cli  # noqa: F401
import supagraf.enrich  # noqa: F401
import supagraf.enrich.audit  # noqa: F401
import supagraf.enrich.embed  # noqa: F401
import supagraf.enrich.embed_print  # noqa: F401
import supagraf.enrich.llm  # noqa: F401
import supagraf.enrich.pdf  # noqa: F401
import supagraf.enrich.pdf_fetch  # noqa: F401
import supagraf.fetch  # noqa: F401
import supagraf.fetch.acts  # noqa: F401
import supagraf.fetch.mp_photos  # noqa: F401
import supagraf.stage  # noqa: F401


def pytest_runtest_setup(item):
    sm = sys.modules.get("supagraf")
    if sm is None:
        return
    # Re-attach any supagraf.* submodule that lives in sys.modules but isn't
    # bound on `sm`. Walks once per test; negligible cost vs. mock.patch failure.
    for name, module in list(sys.modules.items()):
        if not name.startswith("supagraf.") or module is None:
            continue
        parts = name.split(".")
        parent = sm
        for part in parts[1:-1]:
            parent = getattr(parent, part, None)
            if parent is None:
                break
        if parent is not None and not hasattr(parent, parts[-1]):
            setattr(parent, parts[-1], module)
