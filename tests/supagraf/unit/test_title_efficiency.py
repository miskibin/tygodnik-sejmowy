from types import SimpleNamespace
import pytest
from supagraf.enrich import voting_short_title, act_short_title

class Query:
    def __init__(self):
        self.filters = []
    def __getattr__(self, name):
        if name == "not_":
            return self
        def call(*args, **kwargs):
            self.filters.append((name, args))
            return SimpleNamespace(data=[]) if name == "execute" else self
        return call

@pytest.mark.parametrize("module", [voting_short_title, act_short_title])
@pytest.mark.parametrize("force", [False, True])
@pytest.mark.parametrize("days", [None, 14])
def test_completed_titles_do_not_expire_without_explicit_force(monkeypatch, module, force, days):
    query = Query()
    monkeypatch.setattr(module, "supabase", lambda: query)
    args = dict(limit=0, days=days, force=force)
    if module is voting_short_title:
        module.fetch_pending_votings(term=10, **args)
    else:
        module.fetch_pending_acts(**args)
    assert (("is_", ("short_title", "null")) in query.filters) is (not force)
    assert not any(name == "or_" for name, _ in query.filters)
