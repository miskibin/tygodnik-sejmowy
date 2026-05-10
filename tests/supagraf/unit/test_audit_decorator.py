"""Unit tests for @with_model_run decorator (B5).

All DB calls mocked — verifies decorator semantics in isolation:
- wrap-time and call-time validation
- model_runs row insert + finish('ok'/'failed') ordering
- enrichment_failures row written with truncated error
- model_run_id injection only when fn signature accepts it
- exception passthrough (never swallowed)
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from supagraf.enrich.audit import ERROR_MAX_CHARS, with_model_run


@pytest.fixture
def mock_db():
    """Patch the three DB seams with MagicMocks; yield them for assertion."""
    with patch("supagraf.enrich.audit._insert_run") as ins, \
         patch("supagraf.enrich.audit._record_failure") as rec, \
         patch("supagraf.enrich.audit._finish_run") as fin:
        ins.return_value = 42
        yield ins, rec, fin


# ---- wrap-time validation -------------------------------------------------

def test_missing_fn_name_raises():
    with pytest.raises(ValueError, match="fn_name and model"):
        with_model_run(fn_name="", model="m")


def test_missing_model_raises():
    with pytest.raises(ValueError, match="fn_name and model"):
        with_model_run(fn_name="x", model="")


def test_decorating_fn_without_entity_type_arg_raises():
    with pytest.raises(ValueError, match="entity_type"):
        @with_model_run(fn_name="x", model="m")
        def bad(*, entity_id):
            return 1


def test_decorating_fn_without_entity_id_arg_raises():
    with pytest.raises(ValueError, match="entity_id"):
        @with_model_run(fn_name="x", model="m")
        def bad(*, entity_type):
            return 1


# ---- happy path -----------------------------------------------------------

def test_happy_path_returns_value_and_finishes_ok(mock_db):
    ins, rec, fin = mock_db

    @with_model_run(fn_name="fn1", model="m1")
    def f(*, entity_type, entity_id):
        return "result"

    out = f(entity_type="print", entity_id="p1")
    assert out == "result"
    ins.assert_called_once()
    rec.assert_not_called()
    fin.assert_called_once()
    args, _ = fin.call_args
    assert args[0] == 42
    assert args[1] == "ok"


# ---- failure path ---------------------------------------------------------

def test_failure_path_records_and_finishes_failed_and_reraises(mock_db):
    ins, rec, fin = mock_db

    class Boom(RuntimeError):
        pass

    @with_model_run(fn_name="fn2", model="m2")
    def f(*, entity_type, entity_id):
        raise Boom("kaboom")

    with pytest.raises(Boom, match="kaboom"):
        f(entity_type="act", entity_id="a1")

    rec.assert_called_once()
    args, _ = rec.call_args
    assert args[0] == 42                   # model_run_id
    assert args[1] == "act"                # entity_type
    assert args[2] == "a1"                 # entity_id
    assert args[3] == "fn2"                # fn_name
    assert "Boom" in args[4]               # error text contains type
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


# ---- model_run_id injection ----------------------------------------------

def test_run_id_injected_when_param_present(mock_db):
    ins, _, _ = mock_db
    seen = {}

    @with_model_run(fn_name="fn3", model="m3")
    def f(*, entity_type, entity_id, model_run_id=None):
        seen["mrid"] = model_run_id
        return None

    f(entity_type="print", entity_id="p2")
    assert seen["mrid"] == 42


def test_run_id_not_injected_when_absent(mock_db):
    captured_kwargs: dict = {}

    @with_model_run(fn_name="fn4", model="m4")
    def f(*, entity_type, entity_id):
        # If decorator wrongly injected model_run_id, Python TypeError would
        # fire before this body. Assert positively by capturing locals.
        captured_kwargs["entity_type"] = entity_type
        return None

    f(entity_type="print", entity_id="p3")
    assert captured_kwargs == {"entity_type": "print"}


# ---- entity_type validation ----------------------------------------------

def test_unknown_entity_type_rejected_before_insert(mock_db):
    ins, rec, fin = mock_db

    @with_model_run(fn_name="fn5", model="m5")
    def f(*, entity_type, entity_id):
        return None

    with pytest.raises(ValueError, match="unknown entity_type"):
        f(entity_type="garbage", entity_id="x")
    ins.assert_not_called()
    rec.assert_not_called()
    fin.assert_not_called()


def test_missing_entity_type_at_call_time_raises(mock_db):
    ins, rec, fin = mock_db

    @with_model_run(fn_name="fn6", model="m6")
    def f(*, entity_type=None, entity_id=None):
        return None

    with pytest.raises(ValueError, match="must be provided"):
        f(entity_id="x")  # entity_type omitted
    ins.assert_not_called()


# ---- error truncation ----------------------------------------------------

def test_long_error_truncated(mock_db):
    _, rec, _ = mock_db

    @with_model_run(fn_name="fn7", model="m7")
    def f(*, entity_type, entity_id):
        raise RuntimeError("x" * 5000)

    with pytest.raises(RuntimeError):
        f(entity_type="print", entity_id="p")
    err_arg = rec.call_args.args[4]
    assert len(err_arg) <= ERROR_MAX_CHARS


# ---- prompt fields propagation -------------------------------------------

def test_prompt_fields_propagated(mock_db):
    ins, _, _ = mock_db

    @with_model_run(fn_name="fn8", model="m8")
    def f(*, entity_type, entity_id, prompt_version=None, prompt_sha256=None):
        return None

    f(entity_type="print", entity_id="p", prompt_version="v3", prompt_sha256="abc")
    args, _ = ins.call_args
    # _insert_run(fn_name, model, prompt_version, prompt_sha256, notes)
    assert args[0] == "fn8"
    assert args[1] == "m8"
    assert args[2] == "v3"
    assert args[3] == "abc"


def test_prompt_fields_absent(mock_db):
    ins, _, _ = mock_db

    @with_model_run(fn_name="fn9", model="m9")
    def f(*, entity_type, entity_id):
        return None

    f(entity_type="print", entity_id="p")
    args, _ = ins.call_args
    assert args[2] is None
    assert args[3] is None


# ---- cascading errors ----------------------------------------------------

def test_record_failure_error_does_not_swallow_original(mock_db):
    _, rec, fin = mock_db
    rec.side_effect = RuntimeError("insert blew up")

    @with_model_run(fn_name="fnA", model="mA")
    def f(*, entity_type, entity_id):
        raise ValueError("original")

    # Original exception MUST surface even if failure logging blows up.
    with pytest.raises(ValueError, match="original"):
        f(entity_type="print", entity_id="p")
    fin.assert_called_once()
    assert fin.call_args.args[1] == "failed"


def test_finish_failure_on_success_propagates(mock_db):
    _, _, fin = mock_db
    fin.side_effect = RuntimeError("finish broken")

    @with_model_run(fn_name="fnB", model="mB")
    def f(*, entity_type, entity_id):
        return "v"

    with pytest.raises(RuntimeError, match="finish broken"):
        f(entity_type="print", entity_id="p")
