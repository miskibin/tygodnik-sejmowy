from supagraf.enrich.print_unified import UnifiedMention, _recover_spans


def test_recover_spans_drops_duplicate_span_when_model_repeats_a_name():
    text = "Poseł Bartłomiej Wróblewski złożył wniosek. Podpisali: Jan Nowak."
    mentions = [
        UnifiedMention(raw_text="Bartłomiej Wróblewski", mention_type="person"),
        UnifiedMention(raw_text="Bartłomiej Wróblewski", mention_type="person"),
        UnifiedMention(raw_text="Jan Nowak", mention_type="person"),
    ]
    rows = _recover_spans(mentions, text)
    assert [(r["raw_text"], r["span_start"]) for r in rows] == [
        ("Bartłomiej Wróblewski", 6),
        ("Jan Nowak", text.index("Jan Nowak")),
    ]


def test_recover_spans_keeps_two_real_occurrences():
    text = "Jan Nowak i ponownie Jan Nowak."
    mentions = [UnifiedMention(raw_text="Jan Nowak", mention_type="person")] * 2
    rows = _recover_spans(mentions, text)
    assert [r["span_start"] for r in rows] == [0, text.index("Jan Nowak", 1)]
