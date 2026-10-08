from types import SimpleNamespace

import pytest

from supagraf.enrich import utterance_enrich
from supagraf.fetch import acts


@pytest.mark.parametrize("limit, expected", [(0, 1467), (17, 17), (1100, 1100)])
def test_pending_statements_cover_all_pages(monkeypatch, limit, expected):
    rows = [{"id": i} for i in range(1467)]

    class Query:
        not_ = property(lambda self: self)

        def __getattr__(self, name):
            return lambda *args, **kwargs: self

        def order(self, key):
            assert key == "id"
            return self

        def range(self, start, end):
            self.bounds = start, end
            return self

        def execute(self):
            start, end = self.bounds
            return SimpleNamespace(data=rows[start:min(end + 1, start + 1000)])

    monkeypatch.setattr(utterance_enrich, "supabase", lambda: Query())
    monkeypatch.setattr(utterance_enrich, "_day_ids_for_sitting", lambda *args: [1])
    actual = utterance_enrich.fetch_pending_statements(term=10, sitting_num=66, limit=limit)
    assert [row["id"] for row in actual] == list(range(expected))


def test_stale_eli_deduplicates_shared_act(monkeypatch):
    class Query:
        def __getattr__(self, name):
            return lambda *args, **kwargs: self

        def execute(self):
            return SimpleNamespace(data=[{"number": "1"}, {"number": "2"}])

    class Api:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def map(self, fn, rows, **kwargs):
            return [(row, {"ELI": "DU/2026/1"}, None) for row in rows]

        def get_json(self, path):
            return {"ELI": "DU/2026/1"}

        def url(self, path):
            return "https://api.sejm.gov.pl" + path

    written = []
    monkeypatch.setattr(acts, "supabase", lambda: Query())
    monkeypatch.setattr(acts, "SejmApi", Api)
    monkeypatch.setattr(acts.stage, "validate", lambda *args: None)
    monkeypatch.setattr(acts.stage, "upsert_rows", lambda table, rows, **kwargs: written.extend(rows) or len(rows))
    monkeypatch.setattr(acts, "_rpc_int", lambda *args: 1)
    monkeypatch.setattr(acts, "call_rpc_scalar", lambda *args: 1)
    result = acts.refresh_stale_eli()
    assert len(written) == result["fetched_acts"] == 1
    assert result["duplicate_acts"] == 1
