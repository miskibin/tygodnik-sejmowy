"""Unified single-call enrichment: print -> all 7 enrichment outputs in one LLM call.

Replaces seven separate per-field enricher calls (summary, stance, mentions,
personas, citizen_action, plain_polish, impact) with one Gemini call that
emits a structured JSON containing every field at once.

Why
---
Each per-field enricher historically sent the full PDF text again as input
(~3k tokens × 7 = ~21k input tokens per print). The unified prompt sends the
text once and asks for all fields together, cutting input tokens ~5×, latency
~5×, and cost ~5×. Output tokens are roughly the same total volume but emitted
in a single response.

Compatibility
-------------
This enricher writes to **the same DB columns** as the seven legacy enrichers
and stamps the same provenance triples (prompt_version, prompt_sha256, model)
on each — so existing CHECK constraints (0014/0016/0017/0030/0031/0040/0041)
all still hold. The seven legacy per-field enrichers stay wired in CLI for
granular re-runs and as a fallback if the unified prompt regresses.

The unified enricher records ONE @with_model_run audit row under
``fn_name=print_unified``. The seven legacy fn_names remain reserved for
their respective re-runs. ``mentions`` row entries are inserted into the
``print_mentions`` table after a span recovery pass (LLM emits raw_text only;
we compute span_start/end via str.find on the original text — drops mentions
that don't substring-match).
"""
from __future__ import annotations

import re
from typing import Literal

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, field_validator

from supagraf.db import supabase
from supagraf.enrich import DEFAULT_LLM_MODEL, LLM_MODELS
from supagraf.enrich.audit import with_model_run
from supagraf.enrich.llm import call_structured
from supagraf.enrich.pdf import extract_pdf, extract_pdf_cover
from supagraf.enrich.pdf_fetch import resolve_print_pdf
from supagraf.enrich.print_personas import PERSONA_TAGS, PersonaTag

JOB_NAME = "print_unified"
PROMPT_NAME = "print_unified"

# Topic taxonomy locked v1 (mig 0061). Multi-label: a print may belong to
# multiple topics (e.g. "Kodeks pracy" -> sady-prawa + praca-zus).
# Adding/removing a value requires a migration + prompt bump.
TOPIC_TAGS = (
    "sady-prawa",
    "bezpieczenstwo-obrona",
    "biznes-podatki",
    "praca-zus",
    "zdrowie",
    "edukacja-rodzina",
    "emerytury",
    "rolnictwo-wies",
    "mieszkanie-media",
    "transport",
    "srodowisko-klimat",
)

TopicTag = Literal[
    "sady-prawa",
    "bezpieczenstwo-obrona",
    "biznes-podatki",
    "praca-zus",
    "zdrowie",
    "edukacja-rodzina",
    "emerytury",
    "rolnictwo-wies",
    "mieszkanie-media",
    "transport",
    "srodowisko-klimat",
]

# Categories that v3 prompt forces to is_procedural=true with empty
# persona_tags / null citizen_action. The Pro model's reasoning advantage
# doesn't help when fields are pre-determined by HARD-RULE — Flash is
# adequate at ~5x lower cost. See plan: hybrid-routing decision matrix.
_FLASH_CATEGORIES = frozenset({
    "opinia_organu",
    "autopoprawka",
    "pismo_marszalka",
    "uchwala_upamietniajaca",
    "uchwala_senatu",
    "wniosek_personalny",
    "informacja",
    "wotum_nieufnosci",
    "weto_prezydenta",
    "wniosek_organizacyjny",
})


def pick_model(meta_row: dict) -> str:
    """Choose pro/flash from prints metadata. ONE call per print, model varies.

    Sub-prints (opinions/OSR/etc.) and the procedural categories above route
    to flash; everything else (projekt_ustawy, sprawozdanie_komisji) routes
    to pro because that's where the citizen-facing fields actually carry
    meaningful content."""
    if meta_row.get("is_meta_document"):
        return LLM_MODELS["flash"]
    if meta_row.get("document_category") in _FLASH_CATEGORIES:
        return LLM_MODELS["flash"]
    return LLM_MODELS["pro"]
MAX_INPUT_CHARS = 8000
PLAIN_MIN_WORDS = 20
PLAIN_MAX_WORDS = 300

# Cover-page budget (issue #4): subtract from body so combined input stays
# within MAX_INPUT_CHARS. ~2 pages of plain Sejm header is ~1.5 KB; cap at 2 KB.
MAX_COVER_CHARS = 2000

# Issue #8 — banned phrases (and their paraphrases) that LLM v1 used to bypass
# the "Brak zmian dla obywateli" blacklist. Logged as warnings post-parse; no
# automatic re-prompt (cost-prohibitive at corpus scale), the warning is the
# audit trail for later corpus sweep.
BLACKLIST_RE = re.compile(
    r"nie\s+zmienia\s+praw\s+obywateli|"
    r"nie\s+ma\s+wp[łl]ywu\s+na\s+sytuacj[ęe]|"
    r"techniczn[aą]\s+zmian[aą]|"
    r"bez\s+bezpo[śs]rednich\s+skutk[oó]w|"
    r"nie\s+wp[łl]ywa\s+na\s+obywateli|"
    r"brak\s+zmian\s+dla\s+obywateli|"
    r"nie\s+wprowadza\s+zmian",
    re.IGNORECASE,
)

# Citizen-review issue #3: reject pseudo-actions that aren't actions —
# "zapoznaj się", "monitoruj", "po uchwaleniu sprawdź" etc. v3 prompt
# bans these but v4-Pro / v4-Flash slip through anyway. Post-parse
# nullification: if action matches, set citizen_action=null (frontend
# already hides the section when null). Better empty than weak.
ACTION_BANLIST_RE = re.compile(
    r"zapoznaj\s+si[ęe]\s+z|"                 # "zapoznaj się z definicjami" — to read, not act
    r"(prze)?czyt[aa]j|"                       # "przeczytaj"/"czytaj projekt"
    r"monitoru[jąk]|"                          # "monitoruj zmiany"
    r"obserwu[jąk]|"                           # "obserwuj sytuację"
    r"\b[śs]led[zź]|"                          # "śledź w mediach"
    r"b[ąa]d[zź]\s+na\s+bie[żz][ąa]co|"       # "bądź na bieżąco"
    r"po\s+uchwaleniu|po\s+wej[śs]ciu\s+w\s+[żz]ycie|"  # "po uchwaleniu zapytaj"
    r"po\s+podpisaniu\s+przez\s+prezydent|"
    r"je[śs]li\s+ustawa\s+zostanie\s+uchwalona|"
    r"po\s+og[łl]oszeniu|"
    r"skontaktuj\s+si[ęe]\s+ze?\s+(twoim\s+|swoim\s+)?pos[łl]em|"  # "skontaktuj się z/ze [swoim] posłem"
    r"napisz\s+do\s+pos[łl]a|"
    r"we[zź]\s+udzia[łl]\s+w\s+dyskusji|"
    r"podziel\s+si[ęe]\s+opini|"
    r"poinformuj\s+znajomych|"
    r"czeka[jć]\s+na",                         # "czekaj na uchwalenie"
    re.IGNORECASE,
)


Stance = Literal["FOR", "AGAINST", "NEUTRAL", "MIXED"]
MentionType = Literal["person", "committee"]
ISO24495Class = Literal["A1", "A2", "B1", "B2", "C1", "C2"]
Severity = Literal["high", "medium", "low"]


class UnifiedMention(BaseModel):
    """Mention as emitted by LLM. span_start/end recovered post-parse via
    str.find on the original input text — LLM offset accuracy is unreliable."""
    model_config = ConfigDict(extra="forbid")
    raw_text: str = Field(min_length=1, max_length=200)
    mention_type: MentionType


class UnifiedAffectedGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tag: PersonaTag
    severity: Severity
    # Issue #9: frontend supplies population from the persona_population
    # lookup table — the LLM's GUS guesses were unreliable and routinely
    # wrong by orders of magnitude. Schema still accepts whatever the LLM
    # emits to avoid a hard validation failure, but the validator forces
    # None so nothing leaks into the DB.
    est_population: int | None = Field(default=None, ge=1)

    @field_validator("est_population", mode="before")
    @classmethod
    def _force_null_population(cls, _v: int | None) -> None:
        return None


class PrintUnifiedOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 1. summary
    summary: str = Field(min_length=20, max_length=2000)
    # short_title is a headline (gazetowy nagłówek), NOT a trimmed original
    # title. ≤50 chars hard cap forces the LLM into subject+domain only,
    # never "Projekt ustawy o zmianie...". Floor low for punchy 3-word
    # headlines ("Akcyza — nowelizacja", "Weto — KRS").
    short_title: str = Field(min_length=5, max_length=60)

    # 2. stance
    stance: Stance
    stance_confidence: float = Field(ge=0.0, le=1.0)
    stance_rationale: str = Field(max_length=500)

    # 3. mentions
    mentions: list[UnifiedMention] = Field(default_factory=list, max_length=200)

    # 4. personas — issue #5: prompt v3 instructs MAX 3 with evidence rule.
    # max_length=25 (full taxonomy size) is a sanity ceiling; the trim
    # validator below clamps to 3. Why max_length=25 not 3: Pydantic's
    # Field-level max_length runs DURING type coercion, BEFORE field
    # validators (mode='after'). max_length=3 would reject 4-tag rows
    # outright instead of trimming. Loose cap + post-trim = LLM overshoot
    # is forgiven, hallucinations >25 still rejected.
    persona_tags: list[PersonaTag] = Field(default_factory=list, max_length=25)
    persona_rationale: str = Field(max_length=500)

    # 4b. topic_tags — homepage chip filter (mig 0061). Multi-label: a print
    # may belong to multiple topics. Cap at full taxonomy size (11) as sanity
    # ceiling; post-trim validator clamps to 3 dominant topics — same logic as
    # persona_tags. The prompt instructs the LLM to emit topics in priority
    # order, so the first 3 are the meaningful ones.
    topic_tags: list[TopicTag] = Field(default_factory=list, max_length=11)
    topic_rationale: str = Field(default="", max_length=400)

    # 5. citizen_action — may legitimately be null. v4 occasionally overshoots
    # the 200-char DB CHECK; schema accepts up to 240 so the LLM doesn't get
    # rejected, then we truncate at the DB boundary (see write_payload below).
    citizen_action: str | None = Field(default=None, max_length=240)
    citizen_action_rationale: str = Field(max_length=400)

    # 6. plain Polish
    summary_plain: str = Field(min_length=80, max_length=2500)
    iso24495_class: ISO24495Class

    # 6b. is_procedural — issue #8 (column added in 0045). Set true when the
    # document has no material legal effect (opinia / autopoprawka / pismo
    # marszałka / ratification / purely editorial amendment). Frontend hides
    # the plain-summary panel and shows a "dokument proceduralny" badge.
    is_procedural: bool = False

    # 7. impact
    impact_punch: str = Field(min_length=1, max_length=200)
    affected_groups: list[UnifiedAffectedGroup] = Field(default_factory=list, max_length=15)

    # 8. sponsors — list of MP names extracted from the document body when
    # the print is a "Poselski projekt" (the first page lists signing MPs).
    # Empty list for non-Poselski projects (rzad / komisja / prezydent / etc.
    # have institutional sponsors not individual signers). Club lookup is
    # done post-LLM by joining mps.full_name in a SQL view — we only store
    # the names here.
    sponsor_mps: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("persona_tags", mode="after")
    @classmethod
    def _trim_persona_tags_to_3(cls, v: list[str]) -> list[str]:
        # Post-parse trim: prompt says MAX 3, schema max_length=25 (sanity).
        # Runs after type validation so Literal-membership is enforced first.
        # Keep first 3 (LLM orders by relevance). Frontend gets exactly 3 max.
        return v[:3]

    @field_validator("topic_tags", mode="after")
    @classmethod
    def _trim_topic_tags_to_3(cls, v: list[str]) -> list[str]:
        # Same logic as persona_tags trim. Multi-topic chips work best when a
        # print is mapped to its 1-3 dominant topics, not all 11. Dedupe while
        # preserving LLM priority order.
        seen: set[str] = set()
        out: list[str] = []
        for t in v:
            if t in seen:
                continue
            seen.add(t)
            out.append(t)
            if len(out) == 3:
                break
        return out

    @field_validator("summary_plain")
    @classmethod
    def _word_count_in_range(cls, v: str) -> str:
        n = len(v.split())
        if n < PLAIN_MIN_WORDS or n > PLAIN_MAX_WORDS:
            raise ValueError(
                f"summary_plain word count {n} outside [{PLAIN_MIN_WORDS},{PLAIN_MAX_WORDS}]"
            )
        return v


def _recover_spans(mentions: list[UnifiedMention], text: str) -> list[dict]:
    """Locate each mention.raw_text in the source text via str.find.

    Returns a list of dicts ready for ``print_mentions`` insert. Drops mentions
    whose ``raw_text`` is not a substring of the input — the LLM hallucinated
    them or capitalization drifts, in which case the span is meaningless.
    Each call uses ``find`` from the previous match end to support multiple
    occurrences of the same name.
    """
    cursor = 0
    out: list[dict] = []
    for m in mentions:
        idx = text.find(m.raw_text, cursor)
        if idx == -1:
            # Try from start in case mentions aren't in document order.
            idx = text.find(m.raw_text)
        if idx == -1:
            continue
        out.append({
            "raw_text": m.raw_text,
            "mention_type": m.mention_type,
            "span_start": idx,
            "span_end": idx + len(m.raw_text),
        })
        cursor = idx + len(m.raw_text)
    return out


def _fetch_meta(term: int, entity_id: str) -> dict:
    """Single source of truth for the metadata read used by both the model
    picker and the prompt header. Two-step select tolerates older schemas
    that lack opinion_source / is_meta_document."""
    select_cols = "document_category, sponsor_authority, title"
    try:
        return (
            supabase().table("prints")
            .select(select_cols + ", opinion_source, is_meta_document")
            .eq("term", term).eq("number", entity_id)
            .single().execute().data or {}
        )
    except Exception:
        return (
            supabase().table("prints")
            .select(select_cols)
            .eq("term", term).eq("number", entity_id)
            .single().execute().data or {}
        )


def enrich_print_unified(
    *,
    entity_type: str,
    entity_id: str,
    pdf_relpath: str,
    term: int = 10,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    llm_model: str | None = None,
) -> PrintUnifiedOutput:
    """Public entry point. Resolves the model BEFORE the audit-wrapped inner
    runs so model_runs.model reflects the actually-used model (pro or flash),
    not a static default."""
    meta_row = _fetch_meta(term, entity_id)
    chosen = llm_model or pick_model(meta_row)
    return _enrich_print_unified(
        entity_type=entity_type,
        entity_id=entity_id,
        pdf_relpath=pdf_relpath,
        term=term,
        prompt_version=prompt_version,
        prompt_sha256=prompt_sha256,
        llm_model=chosen,
        meta_row=meta_row,
    )


@with_model_run(
    fn_name=JOB_NAME,
    model=DEFAULT_LLM_MODEL,
    entity_type_arg="entity_type",
    entity_id_arg="entity_id",
    prompt_version_arg="prompt_version",
    prompt_sha256_arg="prompt_sha256",
    model_arg="llm_model",
)
def _enrich_print_unified(
    *,
    entity_type: str,
    entity_id: str,
    pdf_relpath: str,
    term: int = 10,
    prompt_version: int | None = None,
    prompt_sha256: str | None = None,
    llm_model: str = DEFAULT_LLM_MODEL,
    meta_row: dict | None = None,
    model_run_id: int | None = None,
) -> PrintUnifiedOutput:
    pdf_path = resolve_print_pdf(pdf_relpath)
    extraction = extract_pdf(pdf_path)
    body_text = extraction.text

    # Issue #4 — sygnatariusze poselskich projektów są na okładce PDF, ale CLI
    # preferuje .docx (czystsze ekstrakty), w którym body często gubi listę
    # podpisów z pierwszej strony. Próbujemy znaleźć siostrzany PDF i wyciąć
    # 1-2 strony plain text — wstrzyknięte do user_input jako osobna sekcja.
    #
    # v3 (citizen-review issue #3): cover retry. Print 10/2210 (poselski) had
    # an empty 2-page cover extract — bumping to 4 pages recovers the signers
    # list when the front layout pushes them past page 2 (e.g. long preamble
    # before "Wnioskodawcy").
    cover_text = ""
    if pdf_path.suffix.lower() == ".docx":
        sibling_pdf = pdf_path.with_suffix(".pdf")
        if sibling_pdf.exists():
            try:
                cover_text = extract_pdf_cover(sibling_pdf, max_pages=2).strip()
                if not cover_text:
                    logger.warning(
                        "cover empty at max_pages=2 for {} — retrying max_pages=4",
                        sibling_pdf.name,
                    )
                    cover_text = extract_pdf_cover(sibling_pdf, max_pages=4).strip()
                if not cover_text:
                    logger.warning(
                        "cover extraction failed for {} — sponsor_mps may be empty",
                        sibling_pdf.name,
                    )
                cover_text = cover_text[:MAX_COVER_CHARS]
            except Exception as e:
                logger.warning(
                    "cover extraction failed for {}: {!r} — continuing without cover",
                    sibling_pdf.name, e,
                )
    elif pdf_path.suffix.lower() == ".pdf":
        # When the resolved file already IS a PDF, the body extract already
        # contains the cover — no need to inject it twice.
        cover_text = ""

    # meta_row is fetched once by the public `enrich_print_unified` outer (so
    # the model picker can run before the audit wrapper records the model).
    # Re-fetch only if a caller is invoking this private inner directly.
    if meta_row is None:
        meta_row = _fetch_meta(term, entity_id)
    opinion_source = meta_row.get("opinion_source")
    is_meta_document = meta_row.get("is_meta_document", False)
    logger.info(
        "print {}: model={} (category={}, meta={})",
        entity_id, llm_model,
        meta_row.get("document_category"), is_meta_document,
    )

    header = (
        "## METADATA\n"
        f"Kategoria: {meta_row.get('document_category')}\n"
        f"Autorytet: {meta_row.get('sponsor_authority')}\n"
        f"Opinion source: {opinion_source or 'N/A'}\n"
        f"Tytuł oryginalny: {meta_row.get('title')}\n\n"
    )
    cover_section = (
        f"## OKŁADKA PDF (sygnatariusze + metadata)\n{cover_text}\n\n"
        if cover_text else ""
    )

    # Trim body so combined user_input stays under ~MAX_INPUT_CHARS. Header is
    # tiny (~200 chars), cover capped at MAX_COVER_CHARS — rest goes to body.
    budget_for_body = MAX_INPUT_CHARS - len(header) - len(cover_section)
    body_section = f"## CIAŁO DOKUMENTU\n{body_text[:max(0, budget_for_body)]}"

    user_input = header + cover_section + body_section
    if not body_text.strip():
        raise ValueError(f"empty extracted text for {pdf_path.name}")

    call = call_structured(
        model=llm_model,
        prompt_name=PROMPT_NAME,
        user_input=user_input,
        output_model=PrintUnifiedOutput,
        prompt_version=prompt_version,
    )
    parsed: PrintUnifiedOutput = call.parsed  # type: ignore[assignment]

    # Issue #8 — post-parse blacklist sweep. Re-prompting on hit would double
    # latency+cost; instead we log a warning so the corpus can be swept for
    # quality regressions later.
    if BLACKLIST_RE.search(parsed.summary_plain or "") or BLACKLIST_RE.search(
        parsed.impact_punch or ""
    ):
        logger.warning(
            "blacklist regex hit on print {} — consider reprompt", entity_id
        )

    # Citizen-review issue #3: nullify weak/pseudo citizen_action. Frontend
    # already hides the "co możesz zrobić" section when null — better empty
    # than slop. If the action matches the banlist, drop it AND extend the
    # rationale so audit trail explains why.
    if parsed.citizen_action and ACTION_BANLIST_RE.search(parsed.citizen_action):
        logger.info(
            "citizen_action nullified for print {} (matched banlist): {!r}",
            entity_id, parsed.citizen_action,
        )
        nullified_original = parsed.citizen_action
        parsed.citizen_action = None
        parsed.citizen_action_rationale = (
            f"[auto-nullified weak action] {parsed.citizen_action_rationale} "
            f"(original: {nullified_original[:120]})"
        )[:400]

    pv_str = str(call.prompt.version)
    prompt_sha = call.prompt.sha256

    # Recover mention spans via substring match on the EXACT input the LLM saw.
    mention_rows = _recover_spans(parsed.mentions, user_input)

    # v3 (citizen-review issue #4): sub-print sponsor_authority correction.
    # Opinions/OSR/etc. (is_meta_document=true) historically inherited the
    # parent's sponsor_authority during ingest — so an opinia SN attached to
    # a poselski projekt looked like 'klub_poselski'. When opinion_source is
    # populated (Agent B backfill from 0047), the document's TRUE author is
    # that authority — collapse sponsor_authority to 'inne' here so the
    # frontend can rely on opinion_source as the source-of-truth and not on
    # the inherited (wrong) sponsor_authority.
    sponsor_authority_override: str | None = None
    if is_meta_document and opinion_source:
        sponsor_authority_override = "inne"

    update_payload: dict = {
        # 1. summary
        "summary": parsed.summary,
        "short_title": parsed.short_title,
        "summary_prompt_version": pv_str,
        "summary_prompt_sha256": prompt_sha,
        "summary_model": llm_model,
        # 2. stance
        "stance": parsed.stance,
        "stance_confidence": parsed.stance_confidence,
        "stance_prompt_version": pv_str,
        "stance_prompt_sha256": prompt_sha,
        "stance_model": llm_model,
        # 3. mentions provenance (rows inserted below)
        "mentions_prompt_version": pv_str,
        "mentions_prompt_sha256": prompt_sha,
        "mentions_model": llm_model,
        "mentions_extracted_at": "now()",
        # 4. personas
        "persona_tags": parsed.persona_tags,
        "persona_tags_prompt_version": pv_str,
        "persona_tags_prompt_sha256": prompt_sha,
        "persona_tags_model": llm_model,
        # 4b. topic_tags (mig 0061) - homepage chip filter. Empty list ->
        # null so the CHECK constraint stays consistent (NULL when not
        # populated, populated array + provenance otherwise).
        "topic_tags": parsed.topic_tags if parsed.topic_tags else None,
        "topic_tags_prompt_version": pv_str if parsed.topic_tags else None,
        "topic_tags_prompt_sha256": prompt_sha if parsed.topic_tags else None,
        "topic_tags_model": llm_model if parsed.topic_tags else None,
        # 5. citizen_action (may be null) — DB CHECK caps at 200 chars, schema
        # accepts up to 240 to absorb v4 overshoot. Truncate cleanly at word
        # boundary if possible, else hard cut.
        "citizen_action": (
            (parsed.citizen_action[:200].rsplit(" ", 1)[0] + "…")
            if parsed.citizen_action and len(parsed.citizen_action) > 200
            else parsed.citizen_action
        ),
        "citizen_action_prompt_version": pv_str,
        "citizen_action_prompt_sha256": prompt_sha,
        "citizen_action_model": llm_model,
        # 6. plain Polish
        "summary_plain": parsed.summary_plain,
        "iso24495_class": parsed.iso24495_class,
        "summary_plain_prompt_version": pv_str,
        "summary_plain_prompt_sha256": prompt_sha,
        "summary_plain_model": llm_model,
        # 6b. procedural flag (column added in 0045_print_meta_flags_and_score)
        "is_procedural": parsed.is_procedural,
        # 7. impact
        "impact_punch": parsed.impact_punch,
        "affected_groups": [g.model_dump() for g in parsed.affected_groups],
        "impact_prompt_version": pv_str,
        "impact_prompt_sha256": prompt_sha,
        "impact_model": llm_model,
        # 8. sponsors — column added in 0043_print_sponsor_authority. Empty
        # list collapses to NULL so non-Poselski projects don't carry an
        # empty array (frontend can `is null` cleanly).
        "sponsor_mps": parsed.sponsor_mps if parsed.sponsor_mps else None,
    }
    if sponsor_authority_override is not None:
        # v3: only set when actually correcting — avoid stomping good values
        # for non-meta prints. Frontend reads opinion_source for the granular
        # author when sponsor_authority='inne' on a meta-document.
        update_payload["sponsor_authority"] = sponsor_authority_override
    supabase().table("prints").update(update_payload).eq(
        "term", term
    ).eq("number", entity_id).execute()

    # Replace mentions for this prompt_version: delete then insert fresh batch.
    print_id_row = (
        supabase().table("prints").select("id")
        .eq("term", term).eq("number", entity_id)
        .single().execute().data
    )
    print_id = print_id_row["id"]

    supabase().table("print_mentions").delete().eq("print_id", print_id).eq(
        "prompt_version", pv_str
    ).execute()

    if mention_rows:
        supabase().table("print_mentions").insert([
            {
                "print_id": print_id,
                "mention_type": r["mention_type"],
                "raw_text": r["raw_text"],
                "span_start": r["span_start"],
                "span_end": r["span_end"],
                "prompt_version": pv_str,
                "prompt_sha256": prompt_sha,
                "model": llm_model,
            }
            for r in mention_rows
        ]).execute()

    return parsed
