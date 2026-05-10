"""zeznania majątkowe (MP asset declarations) — research stub.

Phase 1.5 task. The Sejm public site (sejm.gov.pl/sejm10.nsf/oswiadczenia.xsp)
is CAPTCHA-gated and not part of api.sejm.gov.pl. Candidates to evaluate:

  - api.mojepanstwo.pl  (open-data project; may mirror disclosures)
  - sejm-stats.pl       (community aggregator)
  - Watchdog Polska public datasets
  - Manual download → local PDF folder ingest

Until source decided, this command is a no-op that creates the target dir
and writes a research README placeholder.
"""
from __future__ import annotations

from pathlib import Path

from ..storage import write_text


PLACEHOLDER = """# Disclosures (zeznania majątkowe)

Not yet captured — see supagraf/fixtures/sources/disclosures.py for the
list of candidate sources to evaluate. Pick one, implement a capture
function in this module, and replace this file.
"""


def capture_disclosures_stub(out_root: Path) -> None:
    dest = out_root / "disclosures"
    write_text(dest / "README.md", PLACEHOLDER)
