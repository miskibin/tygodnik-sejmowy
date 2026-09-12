import pytest
from postgrest.exceptions import APIError
from supagraf.load import _rpc_int
from supagraf.sync import loaders


def test_gateway_timeout_does_not_replay_a_still_running_load(monkeypatch):
    import supagraf.load as mod
    calls=[]
    def timeout(*args):
        calls.append(args)
        raise APIError({"code":"504","message":"gateway timeout","details":None,"hint":None})
    monkeypatch.setattr(mod,"call_rpc_scalar",timeout)
    with pytest.raises(APIError):
        _rpc_int("load_questions",10)
    assert len(calls)==1


def test_daily_uses_incremental_questions_but_full_keeps_full_loader(monkeypatch):
    calls=[]
    monkeypatch.setattr(loaders,"_rpc_int",lambda fn,term: calls.append(fn) or 0)
    monkeypatch.setattr(loaders,"LOAD_CHAIN",(loaders.Loader("load_questions",frozenset({"questions"})),))
    loaders.run_loaders(10,{"questions"},full=False)
    loaders.run_loaders(10,{"questions"},full=True)
    assert calls==["load_questions_changed","load_questions"]
