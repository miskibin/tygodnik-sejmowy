import pytest
from supagraf.enrich.print_unified import PrintUnifiedOutput, apply_scoped_postvalidation


def output(**overrides):
    data = dict(summary="Projekt zmienia zasady rozliczeń dla przedsiębiorców.",
        short_title="Zasady rozliczeń podatkowych", stance="FOR", stance_confidence=0.8,
        stance_rationale="Treść projektu", persona_rationale="Adresaci zmian",
        citizen_action_rationale="Brak obowiązującego działania",
        summary_plain="Projekt dotyczy przedsiębiorców prowadzących działalność gospodarczą. Proponowane zasady opisują sposób rozliczania należności i obowiązki związane z dokumentowaniem transakcji w kolejnym okresie rozliczeniowym.",
        iso24495_class="B1", impact_punch="Zmiana zasad rozliczeń",
        persona_tags=["podatnik-pit", "podatnik-vat"],
        affected_groups=[{"tag":"podatnik-pit","severity":"low"},{"tag":"podatnik-vat","severity":"low"}])
    data.update(overrides)
    return PrintUnifiedOutput.model_validate(data)


def test_procedural_document_does_not_create_citizen_actions_or_audiences():
    result=apply_scoped_postvalidation(output(is_procedural=True,citizen_action="Złóż wniosek w urzędzie"),document_category="weto_prezydenta",body_text="Opłaty PIT i VAT")
    assert result.persona_tags == []
    assert result.affected_groups == []
    assert result.citizen_action is None


@pytest.mark.parametrize("wording", ["Ustawa ma wejść w życie", "Ustawa ma zacząć obowiązywać"])
def test_project_keeps_source_duration_but_marks_it_as_proposed(wording):
    sentence=f"{wording} po trzech miesiącach od ogłoszenia."
    result=apply_scoped_postvalidation(output(summary=sentence),document_category="projekt_ustawy",body_text="Treść projektu")
    assert result.summary == "Projekt przewiduje wejście w życie po trzech miesiącach od ogłoszenia."


def test_non_project_entry_date_is_not_rewritten():
    sentence="Ustawa wejdzie w życie po trzech miesiącach od ogłoszenia."
    result=apply_scoped_postvalidation(output(summary=sentence),document_category="informacja",body_text="Treść informacji")
    assert result.summary == sentence


@pytest.mark.parametrize("source,expected", [
    ("Podatek dochodowy od osób fizycznych", ["podatnik-pit"]),
    ("Zmiana podatku dochodowego od osób fizycznych", ["podatnik-pit"]),
    ("Zmiana podatku od towarów i usług", ["podatnik-vat"]),
    ("Stawki VAT i PIT", ["podatnik-pit","podatnik-vat"]),
    ("Nadzór nad reklamą polityczną", []),
])
def test_tax_audience_requires_tax_terms_in_source(source,expected):
    result=apply_scoped_postvalidation(output(),document_category="projekt_ustawy",body_text=source)
    assert result.persona_tags == expected
    assert [g.tag for g in result.affected_groups] == expected
