"""Regression guard for the historical club SQL definitions."""
from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260910063557_fix_vote_club_history.sql"
)


def _statements() -> str:
    return "\n".join(
        line for line in MIGRATION.read_text(encoding="utf-8").splitlines()
        if not line.lstrip().startswith("--")
    )


def test_discipline_uses_club_recorded_on_vote_and_rejects_ambiguous_modal():
    sql = _statements()
    assert "cm.club_ref = v.club_ref" in sql
    assert "c.club_id = v.club_ref" in sql
    assert "having club_size >= 5" in sql
    assert "count(*) filter (where choice_count = max_count) = 1" in sql
    assert "vt.kind = 'ELECTRONIC'::public.voting_kind" in sql
    assert "'PRESENT'::public.vote_choice" not in sql
    assert "'VOTE_VALID'::public.vote_choice" not in sql
    assert "mp_club_membership" not in sql


def test_transition_function_does_not_drop_returns_to_an_old_club():
    sql = _statements()
    assert "prev_club is distinct from club_short" in sql
    assert "rn_in_club" not in sql
