from supagraf.backfill.sitting_links import heading_print_numbers, link_candidates


def body(refs="100 i 200", text="Dotyczy również druku nr 999."):
    return ("10. kadencja, 64. posiedzenie, 1. dzień (02-09-2026) "
            f"2. punkt porządku dziennego: Projekt (druki nr {refs}). Poseł Jan Kowalski: {text}")


PRINTS = [
    {"id": 10, "number": "100", "document_category": "projekt_ustawy"},
    {"id": 20, "number": "200", "document_category": "sprawozdanie_komisji", "is_meta_document": True},
    {"id": 99, "number": "999", "document_category": "projekt_ustawy"},
]


def test_references_only_from_actual_heading_not_planned_ordinal_or_mentions():
    assert heading_print_numbers(body()) == ["100", "200"]
    assert heading_print_numbers("Poseł X: 2. punkt porządku dziennego: druk nr 999.") == []
    assert heading_print_numbers(body("100 oraz nr 200-A")) == ["100", "200-A"]


def test_report_is_not_a_rival_project_and_existing_primary_is_preserved():
    plan = link_candidates([{"id": 1, "body_text": body()}, {"id": 2, "body_text": body(), "primary_print_id": 88}], [], PRINTS)
    assert plan["primary"] == {10: [1]}
    assert {r["print_id"] for r in plan["statement_links"]} == {10, 20}
    assert all(r["agenda_item_id"] is None for r in plan["statement_links"])


def test_joint_debate_links_both_without_guessing_primary():
    plan = link_candidates([{"id": 1, "body_text": body("100 i 999")}], [], PRINTS)
    assert len(plan["statement_links"]) == 2
    assert plan["primary"] == {}


def test_rejection_motion_never_becomes_main_final_vote():
    votes = [{"id": 1, "title": "Pkt. 2 Projekt (druki nr 100 i 200)", "motion_polarity": "reject"},
             {"id": 2, "title": "Pkt. 2 Projekt (druki nr 100 i 200)", "motion_polarity": "pass"}]
    links = link_candidates([], votes, PRINTS)["vote_links"]
    assert [r["role"] for r in links] == ["other", "sprawozdanie", "main", "sprawozdanie"]
