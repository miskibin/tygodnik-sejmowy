"""Unit tests for supagraf.fetch.mp_photos.

httpx + supabase mocked. Verifies:
  - HEAD 200 → photo_url stamped to URL, photo_fetched_at stamped
  - HEAD 404 → photo_url NULL, photo_fetched_at stamped
  - HEAD 405 → falls back to GET (and uses GET status)
  - transport error → photo_fetched_at NOT stamped (retry next time)
  - throttle is honored
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

import supagraf.fetch.mp_photos as mod


def _row(pk: int, mp_id: int):
    return {"id": pk, "mp_id": mp_id}


def _fake_response(status_code: int, content_type: str = "image/jpeg"):
    r = MagicMock(spec=httpx.Response)
    r.status_code = status_code
    r.headers = {"content-type": content_type}
    return r


class _DBSpy:
    """Fake supabase client capturing .update payloads."""

    def __init__(self, rows: list[dict]):
        self._rows = rows
        self.updates: list[dict] = []
        self.where: list[tuple[str, object]] = []

    # query-builder fluent API
    def table(self, name: str):
        self._table = name
        return self

    def select(self, *_a, **_kw):
        return self

    def eq(self, col, val):
        # used both for select ("term") and update ("id")
        if getattr(self, "_in_update", False):
            self.where.append((col, val))
        return self

    def is_(self, *_a, **_kw):
        return self

    def execute(self):
        out = MagicMock()
        out.data = self._rows
        return out

    def update(self, payload: dict):
        self._in_update = True
        self.updates.append(payload)
        return self


@pytest.fixture
def db_spy(monkeypatch):
    """Patch mod.supabase to return a spy. The spy returns the rows we set
    on every .select().execute() and captures every .update() payload."""
    rows: list[dict] = []
    spy = _DBSpy(rows)
    monkeypatch.setattr(mod, "supabase", lambda: spy)
    return spy


def _patched_client(*, head_responses=None, get_responses=None, head_side_effect=None):
    """Returns a context-managed httpx.Client mock."""
    client = MagicMock()
    client.__enter__ = MagicMock(return_value=client)
    client.__exit__ = MagicMock(return_value=False)
    if head_side_effect is not None:
        client.head = MagicMock(side_effect=head_side_effect)
    elif isinstance(head_responses, list):
        client.head = MagicMock(side_effect=head_responses)
    else:
        client.head = MagicMock(return_value=head_responses)
    if get_responses is not None:
        if isinstance(get_responses, list):
            client.get = MagicMock(side_effect=get_responses)
        else:
            client.get = MagicMock(return_value=get_responses)
    return client


def test_head_200_stamps_url(db_spy):
    db_spy._rows[:] = [_row(pk=1, mp_id=42)]
    fake = _patched_client(head_responses=_fake_response(200))
    with patch.object(mod.httpx, "Client", return_value=fake):
        rep = mod.fetch_mp_photos(term=10, throttle_s=0)
    assert rep.checked == 1
    assert rep.has_photo == 1
    assert rep.no_photo == 0
    assert rep.errors == 0
    # update was called once with the URL
    assert len(db_spy.updates) == 1
    payload = db_spy.updates[0]
    assert payload["photo_url"] == "https://api.sejm.gov.pl/sejm/term10/MP/42/photo"
    assert payload["photo_fetched_at"] is not None


def test_head_404_stamps_null(db_spy):
    db_spy._rows[:] = [_row(pk=1, mp_id=999)]
    fake = _patched_client(head_responses=_fake_response(404, content_type="text/plain"))
    with patch.object(mod.httpx, "Client", return_value=fake):
        rep = mod.fetch_mp_photos(term=10, throttle_s=0)
    assert rep.checked == 1
    assert rep.has_photo == 0
    assert rep.no_photo == 1
    assert rep.errors == 0
    payload = db_spy.updates[0]
    assert payload["photo_url"] is None
    assert payload["photo_fetched_at"] is not None  # stamped even on 404


def test_head_405_falls_back_to_get(db_spy):
    db_spy._rows[:] = [_row(pk=1, mp_id=7)]
    fake = _patched_client(
        head_responses=_fake_response(405, content_type="text/plain"),
        get_responses=_fake_response(200),
    )
    with patch.object(mod.httpx, "Client", return_value=fake):
        rep = mod.fetch_mp_photos(term=10, throttle_s=0)
    fake.head.assert_called_once()
    fake.get.assert_called_once()
    assert rep.has_photo == 1
    assert rep.no_photo == 0


def test_transport_error_does_not_stamp(db_spy):
    db_spy._rows[:] = [_row(pk=1, mp_id=42)]
    fake = _patched_client(head_side_effect=httpx.ConnectError("boom"))
    with patch.object(mod.httpx, "Client", return_value=fake):
        rep = mod.fetch_mp_photos(term=10, throttle_s=0)
    assert rep.errors == 1
    assert rep.checked == 0
    # No DB update — row stays pending so next run retries.
    assert db_spy.updates == []


def test_throttle_honored(db_spy, monkeypatch):
    db_spy._rows[:] = [_row(pk=1, mp_id=1), _row(pk=2, mp_id=2), _row(pk=3, mp_id=3)]
    sleeps: list[float] = []
    monkeypatch.setattr(mod.time, "sleep", lambda s: sleeps.append(s))
    fake = _patched_client(head_responses=_fake_response(200))
    with patch.object(mod.httpx, "Client", return_value=fake):
        mod.fetch_mp_photos(term=10, throttle_s=0.42)
    assert sleeps == [0.42, 0.42, 0.42]


def test_non_image_content_type_treated_as_no_photo(db_spy):
    """Some upstream errors return 200 with HTML — content-type guard."""
    db_spy._rows[:] = [_row(pk=1, mp_id=42)]
    fake = _patched_client(head_responses=_fake_response(200, content_type="text/html"))
    with patch.object(mod.httpx, "Client", return_value=fake):
        rep = mod.fetch_mp_photos(term=10, throttle_s=0)
    assert rep.has_photo == 0
    assert rep.no_photo == 1
    assert db_spy.updates[0]["photo_url"] is None
