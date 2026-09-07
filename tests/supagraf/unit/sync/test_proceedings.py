from __future__ import annotations

from datetime import date

from supagraf.sync.resources import proceedings as pr

B = "/sejm/term10"
TODAY = date(2026, 9, 7)


def test_in_scope_rules():
    stored = {"60", "63"}
    kw = dict(stored=stored, gaps={60}, today=TODAY, window_days=14, full=False)
    assert pr.in_scope({"number": 64, "dates": ["2026-08-01"]}, **kw)            # not staged
    assert pr.in_scope({"number": 63, "dates": ["2026-08-01"], "current": True}, **kw)
    assert pr.in_scope({"number": 63, "dates": ["2026-09-01"]}, **kw)            # inside window
    assert not pr.in_scope({"number": 63, "dates": ["2026-07-01"]}, **kw)        # old, complete
    assert pr.in_scope({"number": 60, "dates": ["2026-05-01"]}, **kw)            # DB gap
    assert pr.in_scope({"number": 63, "dates": ["2026-07-01"]}, **{**kw, "full": True})
    assert not pr.in_scope({"number": 0, "dates": ["2026-09-01"], "current": True}, **kw)  # placeholder


def _stmt(num, name="Poseł X"):
    return {"num": num, "memberID": 1, "name": name, "function": "", "rapporteur": False,
            "secretary": False, "unspoken": False}


def test_compose_reuses_db_bodies_and_fetches_only_new(routes, ctx, fake_stage, monkeypatch):
    routes.add(f"{B}/proceedings/64/2026-09-03/transcripts",
               {"date": "2026-09-03", "proceedingNum": 64, "statements": [_stmt(1), _stmt(2)]})
    routes.add(f"{B}/proceedings/64/2026-09-03/transcripts/2", "<p>nowy</p>")
    monkeypatch.setattr(pr, "_day_ids", lambda term, number: {"2026-09-03": 500})
    monkeypatch.setattr(pr, "_existing_bodies", lambda day_id: {1: ("<p>old</p>", "old")})
    detail = {"number": 64, "title": "64. posiedzenie", "current": False,
              "dates": ["2026-09-03", "2026-09-30"], "agenda": "<ol><li>Pkt 1</li></ol>"}
    res = pr.SyncResult(resource="proceedings")
    payload = pr.compose(ctx, detail, res)
    assert routes.count("/transcripts/1") == 0 and routes.count("/transcripts/2") == 1
    assert routes.count("2026-09-30") == 0                       # future day not requested
    day = payload["days"][0]
    assert day["statements"][0]["body_html"] == "<p>old</p>"
    assert day["statements"][1]["body_text"] == "nowy"
    assert day["source_path"].endswith("/proceedings/64/2026-09-03/transcripts")
    assert res.notes["bodies_fetched"] == 1
    assert payload["agenda_items"]


def test_sync_skips_identical_payload_and_writes_changed(routes, ctx, fake_stage, monkeypatch):
    routes.add(f"{B}/proceedings", [
        {"number": 64, "title": "t", "current": True, "dates": ["2026-09-03"]},
        {"number": 50, "title": "t", "current": False, "dates": ["2026-03-03"]},
    ])
    routes.add(f"{B}/proceedings/64", {"number": 64, "title": "t", "current": True,
                                       "dates": ["2026-09-03"], "agenda": ""})
    routes.add(f"{B}/proceedings/64/2026-09-03/transcripts",
               {"date": "2026-09-03", "proceedingNum": 64, "statements": []})
    monkeypatch.setattr(pr, "db_gaps", lambda term: set())
    monkeypatch.setattr(pr, "_day_ids", lambda term, number: {})
    fake_stage.seed("_stage_proceedings", {"50": {"number": 50}})
    res = pr.sync(ctx)
    assert res.notes["touched"] == [64]
    assert res.upserted == 1 and "proceedings" in ctx.dirty
    assert ctx.changed_keys["proceedings"] == {64}
    # second run: identical payload → no write
    ctx.dirty.clear()
    res2 = pr.sync(ctx)
    assert res2.upserted == 0 and "proceedings" not in ctx.dirty


def test_one_broken_sitting_does_not_sink_the_rest(routes, ctx, fake_stage, monkeypatch):
    routes.add(f"{B}/proceedings", [{"number": 1, "dates": ["2026-09-03"]}, {"number": 2, "dates": ["2026-09-03"]}])
    routes.add(f"{B}/proceedings/1", {"number": 1, "title": "t", "current": False, "dates": ["2026-09-03"], "agenda": ""})
    routes.add(f"{B}/proceedings/1/2026-09-03/transcripts", {"date": "2026-09-03", "proceedingNum": 1, "statements": []})
    # proceeding 2 detail is malformed for the schema
    routes.add(f"{B}/proceedings/2", {"number": 2, "unexpected": 1})
    monkeypatch.setattr(pr, "db_gaps", lambda term: set())
    monkeypatch.setattr(pr, "_day_ids", lambda term, number: {})
    res = pr.sync(ctx)
    assert res.upserted == 1 and len(res.errors) == 1 and res.errors[0][0] == "2"
