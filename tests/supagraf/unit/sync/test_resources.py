"""Per-resource change detection against the fake stage + mocked API."""
from __future__ import annotations

from datetime import date

import pytest

from supagraf.sync.resources import (
    acts, bills, clubs, committee_sittings, committees, mps, prints, processes, questions, videos, votings,
)

B = "/sejm/term10"


# ---- prints ------------------------------------------------------------------

def _print(num, cd="2026-09-01T10:00:00"):
    return {"term": 10, "number": num, "title": f"t{num}", "attachments": [f"{num}.pdf"],
            "changeDate": cd, "documentDate": "2026-09-01", "deliveryDate": "2026-09-01"}


def test_prints_fetches_only_new_or_advanced(routes, ctx, fake_stage):
    fake_stage.seed("_stage_prints", {"1": _print("1"), "2": _print("2")})
    routes.add(f"{B}/prints", [
        {"number": "1", "changeDate": "2026-09-01T10:00:00"},   # unchanged
        {"number": "2", "changeDate": "2026-09-05T10:00:00"},   # advanced
        {"number": "3", "changeDate": "2026-09-06T10:00:00"},   # new
    ])
    routes.add(f"{B}/prints/2", _print("2", "2026-09-05T10:00:00"))
    routes.add(f"{B}/prints/3", _print("3", "2026-09-06T10:00:00"))
    res = prints.sync(ctx)
    assert res.listed == 3 and res.fetched == 2 and res.upserted == 2 and res.skipped == 1
    assert routes.count("/prints/1") == 0
    assert "prints" in ctx.dirty
    assert fake_stage.tables["_stage_prints"]["2"]["changeDate"] == "2026-09-05T10:00:00"
    assert fake_stage.written[0][1]["source_path"].endswith("/prints/2")


def test_prints_quiet_day_writes_nothing(routes, ctx, fake_stage):
    fake_stage.seed("_stage_prints", {"1": _print("1")})
    routes.add(f"{B}/prints", [{"number": "1", "changeDate": "2026-09-01T10:00:00"}])
    res = prints.sync(ctx)
    assert res.upserted == 0 and not res.dirty and "prints" not in ctx.dirty


def test_prints_schema_violation_is_recorded_not_written(routes, ctx, fake_stage):
    routes.add(f"{B}/prints", [{"number": "9", "changeDate": "2026-09-01T10:00:00"}])
    routes.add(f"{B}/prints/9", {"number": "9", "bogus": 1})
    res = prints.sync(ctx)
    assert res.upserted == 0 and res.errors and res.errors[0][0] == "9"


def test_prints_gone_upstream_counted(routes, ctx, fake_stage):
    routes.add(f"{B}/prints", [{"number": "9", "changeDate": "2026-09-01T10:00:00"}])
    res = prints.sync(ctx)
    assert res.notes.get("gone") == 1 and res.upserted == 0


# ---- processes -------------------------------------------------------------------

def _proc(num, cd="2026-09-05T10:00:00", stages=None):
    return {"term": 10, "number": num, "title": "x", "changeDate": cd, "stages": stages or []}


def test_processes_uses_cursor_and_skips_identical_detail(routes, ctx, fake_stage, monkeypatch):
    fake_stage.cursors["processes.term10"] = "2026-09-06T12:00:00"
    fake_stage.seed("_stage_processes", {"5": _proc("5")})
    seen = {}

    def listing(request):
        seen["since"] = request.url.params.get("modifiedSince")
        import httpx
        return httpx.Response(200, json=[{"number": "5", "changeDate": "2026-09-05T10:00:00"},
                                         {"number": "6", "changeDate": "2026-09-06T13:00:00"}],
                              headers={"X-Total-Count": "2"})

    routes.add(f"{B}/processes", listing)
    routes.add(f"{B}/processes/5", _proc("5"))
    routes.add(f"{B}/processes/6", _proc("6", "2026-09-06T13:00:00"))
    monkeypatch.setattr(processes, "Process", type("P", (), {"model_validate": staticmethod(lambda p: p)}))
    res = processes.sync(ctx)
    assert seen["since"] == "2026-09-06T10:00:00"       # cursor minus 2h overlap
    assert res.fetched == 2 and res.upserted == 1 and res.skipped == 1
    assert fake_stage.cursors["processes.term10"] > "2026-09-06T12:00:00"


def test_processes_cursor_not_advanced_on_errors(routes, ctx, fake_stage, monkeypatch):
    fake_stage.cursors["processes.term10"] = "2026-09-06T12:00:00"
    routes.add(f"{B}/processes", [{"number": "7"}])
    routes.add(f"{B}/processes/7", {"number": "7", "bogus": True})  # fails Process schema
    res = processes.sync(ctx)
    assert res.errors
    assert fake_stage.cursors["processes.term10"] == "2026-09-06T12:00:00"


# ---- votings -------------------------------------------------------------------

def test_votings_plan_sittings():
    index = [{"date": "2026-09-03", "proceeding": 64, "votingsNum": 2},
             {"date": "2026-09-04", "proceeding": 64, "votingsNum": 1},
             {"date": "2026-08-01", "proceeding": 63, "votingsNum": 1}]
    stored = {"63__1", "64__1", "64__2"}
    sealed = {"term10__63__1", "term10__64__1", "term10__64__2"}
    assert votings.plan_sittings(index, stored, sealed, 10, False) == [64]     # 3 expected, 2 held
    stored |= {"64__3"}
    assert votings.plan_sittings(index, stored, sealed, 10, False) == [64]     # 64__3 unsealed
    sealed |= {"term10__64__3"}
    assert votings.plan_sittings(index, stored, sealed, 10, False) == []
    assert votings.plan_sittings(index, stored, sealed, 10, True) == [63, 64]


def test_votings_sync_fetches_missing_detail_only(routes, ctx, fake_stage, monkeypatch):
    fake_stage.seed("_stage_votings", {"64__1": {"votingNumber": 1}})
    monkeypatch.setattr(votings, "load_sealed", lambda e: {"term10__64__1"})
    sealed_now = []
    monkeypatch.setattr(votings, "bulk_seal", lambda e, keys, source: sealed_now.extend(keys))
    monkeypatch.setattr(votings, "Voting", type("V", (), {"model_validate": staticmethod(lambda p: p)}))
    routes.add(f"{B}/votings", [{"date": "2026-09-03", "proceeding": 64, "votingsNum": 2}])
    routes.add(f"{B}/votings/64", [{"votingNumber": 1}, {"votingNumber": 2}])
    routes.add(f"{B}/votings/64/2", {"sitting": 64, "votingNumber": 2, "votes": [{"MP": 1}]})
    res = votings.sync(ctx)
    assert res.fetched == 1 and res.upserted == 1 and res.skipped == 1
    assert routes.count("/votings/64/1") == 0
    assert sealed_now == ["term10__64__2"]
    assert "votings" in ctx.dirty


# ---- mps / clubs / committees ------------------------------------------------

def test_mps_refetches_only_disagreeing_rows(routes, ctx, fake_stage, monkeypatch):
    fake_stage.seed("_stage_mps", {"1": {"id": 1, "firstName": "A", "club": "KO", "extra": 1},
                                   "2": {"id": 2, "firstName": "B", "club": "KO"}})
    routes.add(f"{B}/MP", [{"id": 1, "firstName": "A", "club": "KO"},
                           {"id": 2, "firstName": "B", "club": "PSL"},    # club changed
                           {"id": 3, "firstName": "C", "club": "KO"}])     # new
    routes.add(f"{B}/MP/2", {"id": 2, "firstName": "B", "club": "PSL"})
    routes.add(f"{B}/MP/3", {"id": 3, "firstName": "C", "club": "KO"})
    monkeypatch.setattr(mps, "MP", type("M", (), {"model_validate": staticmethod(lambda p: p)}))
    res = mps.sync(ctx)
    assert res.fetched == 2 and res.upserted == 2 and res.skipped == 1
    assert routes.count("/MP/1") == 0


def test_clubs_only_writes_changes(routes, ctx, fake_stage, monkeypatch):
    fake_stage.seed("_stage_clubs", {"KO": {"id": "KO", "name": "x"}})
    routes.add(f"{B}/clubs", [{"id": "KO"}, {"id": "PiS"}])
    routes.add(f"{B}/clubs/KO", {"id": "KO", "name": "x"})
    routes.add(f"{B}/clubs/PiS", {"id": "PiS", "name": "y"})
    monkeypatch.setattr(clubs, "Club", type("C", (), {"model_validate": staticmethod(lambda p: p)}))
    res = clubs.sync(ctx)
    assert res.fetched == 2 and res.upserted == 1 and res.skipped == 1


def test_committees_rejects_bad_codes(routes, ctx, fake_stage, monkeypatch):
    routes.add(f"{B}/committees", [{"code": "ENM"}, {"code": "../x"}])
    routes.add(f"{B}/committees/ENM", {"code": "ENM", "name": "n"})
    monkeypatch.setattr(committees, "Committee", type("C", (), {"model_validate": staticmethod(lambda p: p)}))
    res = committees.sync(ctx)
    assert res.listed == 1 and res.upserted == 1


# ---- committee sittings ---------------------------------------------------------

def test_committee_sittings_merge_keeps_history():
    existing = {"code": "ENM", "sittings": [{"num": 1, "status": "FINISHED"}, {"num": 2, "status": "PLANNED"}]}
    merged = committee_sittings._merge(existing, "ENM", [{"num": 2, "status": "FINISHED"}, {"num": 3, "status": "PLANNED"}])
    assert [s["num"] for s in merged["sittings"]] == [1, 2, 3]
    assert merged["sittings"][1]["status"] == "FINISHED"


def test_committee_sittings_uses_per_date_endpoint(routes, ctx, fake_stage, monkeypatch):
    ctx.window_days, ctx.horizon_days = 1, 1
    fake_stage.seed("_stage_committee_sittings", {"ENM": {"code": "ENM", "sittings": [{"num": 1, "status": "FINISHED"}]}})
    routes.add(f"{B}/committees/sittings/2026-09-06", [])
    routes.add(f"{B}/committees/sittings/2026-09-07", [{"code": "ENM", "num": 2, "status": "ONGOING"}])
    routes.add(f"{B}/committees/sittings/2026-09-08", [{"code": "ENM", "num": 3, "status": "PLANNED"}])
    monkeypatch.setattr(committee_sittings, "CommitteeSittingsBundle",
                        type("B", (), {"model_validate": staticmethod(lambda p: p)}))
    res = committee_sittings.sync(ctx)
    assert res.fetched == 3 and res.upserted == 1
    assert [s["num"] for s in fake_stage.tables["_stage_committee_sittings"]["ENM"]["sittings"]] == [1, 2, 3]
    assert routes.count("/committees/ENM/sittings") == 0


# ---- bills / videos / questions / acts ----------------------------------------

def test_bills_diff_full_list(routes, ctx, fake_stage, monkeypatch):
    fake_stage.seed("_stage_bills", {"RPW/1/2026": {"number": "RPW/1/2026", "status": "a"}})
    routes.add(f"{B}/bills", [{"number": "RPW/1/2026", "status": "a"}, {"number": "RPW/2/2026", "status": "b"}])
    monkeypatch.setattr(bills, "Bill", type("B", (), {"model_validate": staticmethod(lambda p: p)}))
    res = bills.sync(ctx)
    assert res.upserted == 1 and res.skipped == 1


def test_videos_window_from_cursor(routes, ctx, fake_stage, monkeypatch):
    fake_stage.cursors["videos.term10"] = "2026-09-06"
    seen = {}

    def listing(request):
        import httpx
        seen.update(request.url.params)
        return httpx.Response(200, json=[{"unid": "U1"}])

    routes.add(f"{B}/videos", listing)
    monkeypatch.setattr(videos, "Video", type("V", (), {"model_validate": staticmethod(lambda p: p)}))
    res = videos.sync(ctx)
    assert seen["since"] == "2026-09-03" and seen["till"] == "2026-10-07"
    assert res.upserted == 1 and fake_stage.cursors["videos.term10"] == "2026-09-07"


def test_questions_two_kinds_with_kind_column(routes, ctx, fake_stage, monkeypatch):
    routes.add(f"{B}/interpellations", [{"num": 1, "title": "i"}])
    routes.add(f"{B}/writtenQuestions", [{"num": 1, "title": "w"}])
    monkeypatch.setattr(questions, "Question", type("Q", (), {"model_validate": staticmethod(lambda p: p)}))
    res = questions.sync(ctx)
    assert res.upserted == 2
    kinds = {r["natural_id"]: r["kind"] for _, r in fake_stage.written}
    assert kinds == {"interpellation:1": "interpellation", "written:1": "written"}
    assert set(fake_stage.cursors) == {"questions.interpellation.term10", "questions.written.term10"}


def test_acts_changes_feed_pagination_and_cursor(routes, ctx, fake_stage, monkeypatch):
    fake_stage.seed("_stage_acts", {"DU/2026/1": {"ELI": "DU/2026/1", "title": "same"}})
    pages = {0: {"count": 2, "totalCount": 3, "items": [{"ELI": "DU/2026/1", "title": "same"}, {"ELI": "DU/2026/2", "title": "n"}]},
             2: {"count": 1, "totalCount": 3, "items": [{"ELI": "MP/2026/9", "title": "m"}]}}

    def feed(request):
        import httpx
        return httpx.Response(200, json=pages[int(request.url.params.get("offset", 0))])

    routes.add("/eli/changes/acts", feed)
    monkeypatch.setattr(acts, "ActIn", type("A", (), {"model_validate": staticmethod(lambda p: p)}))
    res = acts.sync(ctx)
    assert res.listed == 3 and res.upserted == 2 and res.skipped == 1
    assert res.notes["since"] == "2026-01-01T00:00:00"
    assert "acts.changes" in fake_stage.cursors
    assert all("eli_id" in r and "term" not in r for _, r in fake_stage.written)
