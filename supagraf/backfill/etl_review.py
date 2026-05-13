"""ETL review (migration 0047) backfill jobs.

Each public function returns a dict like {"inserted": N, "updated": M, "skipped": K}.
All DB writes go through the supabase() PostgREST client. Heavy SQL (array
merges, set-based updates) goes through PostgREST RPC if available; otherwise
falls back to row-by-row updates via the table API.

Idempotent: re-runnable without duplicates (composite-PK ON CONFLICT for
link tables; conditional UPDATEs for columns).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Iterable

from loguru import logger

from supagraf.db import supabase

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Pulls comma- / "i"- / "oraz"-separated print numbers out of a phrase like
# "druki nr 2206, 2234 i 2234-A". Print numbers may include letter suffix
# (autopoprawka: 2234-A) or three-digit ordinal (sub-print: 2362-006).
_DRUKI_RE = re.compile(r"druki?\s+nr\s+([0-9A-Za-z\-,\s]+?)(?=[\)\.\;]|$)", re.IGNORECASE)
_NUMBER_TOKEN_RE = re.compile(r"\b(\d+(?:-[A-Za-z0-9]+)?)\b")
_AUTOPOPRAWKA_RE = re.compile(r"^(\d+)-([A-Z])$")


def _extract_print_numbers(title: str) -> list[str]:
    """Returns the list of print-number tokens referenced in the voting title."""
    if not title:
        return []
    out: list[str] = []
    for m in _DRUKI_RE.finditer(title):
        chunk = m.group(1)
        for t in _NUMBER_TOKEN_RE.findall(chunk):
            if t not in out:
                out.append(t)
    return out


def _strip_diacritics(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    ).lower().strip()


def _chunked(items: list[Any], size: int = 500) -> Iterable[list[Any]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _fetch_all(table: str, select: str, *, eq: dict | None = None,
               not_is: dict | None = None, is_: dict | None = None,
               page_size: int = 1000) -> list[dict]:
    """Paginated full-scan via PostgREST .range()."""
    client = supabase()
    out: list[dict] = []
    start = 0
    while True:
        q = client.table(table).select(select)
        if eq:
            for k, v in eq.items():
                q = q.eq(k, v)
        if not_is:
            for k, v in not_is.items():
                q = q.not_.is_(k, v)
        if is_:
            for k, v in is_.items():
                q = q.is_(k, v)
        rows = q.range(start, start + page_size - 1).execute().data or []
        if not rows:
            break
        out.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size
    return out


# ---------------------------------------------------------------------------
# 1. voting_print_links
# ---------------------------------------------------------------------------

def _role_for_single_print(polarity: str | None) -> str:
    """Map a single-print voting's motion_polarity → voting_print_links.role.

    Issue #25 follow-up²: only third-reading completion votes (polarity='pass')
    earn role='main'. Procedural motions (reject / amendment / minority /
    procedural) get a demoted role so /druk sidebars don't label them as
    "Głosowanie końcowe" / "całość". NULL polarity stays 'main' — the
    classifier may miss a legitimate third-reading topic phrasing and
    demoting on null would lose information.
    """
    if polarity is None or polarity == "pass":
        return "main"
    if polarity == "amendment":
        return "poprawka"
    return "other"


def backfill_voting_print_links(*, dry_run: bool = False) -> dict[str, int]:
    """Populate voting_print_links from two sources:
      A) process_stages.voting jsonb (sitting + votingNumber → voting_id)
      B) voting title regex 'druki nr X, Y i Z'

    voting JSONB shape (camelCase from API): {sitting, votingNumber, ...}.
    No voting_id field — we resolve via (term, sitting, voting_number).

    Role assignment is polarity-aware (see _role_for_single_print) — only
    motion_polarity='pass' votings on a single print get role='main';
    everything else demotes so /druk doesn't claim "Głosowanie końcowe"
    for a procedural reject motion.
    """
    client = supabase()

    # Build a print lookup: (term, number) -> id.
    prints_rows = _fetch_all("prints", "id,term,number")
    print_by_key = {(r["term"], r["number"]): r["id"] for r in prints_rows}

    # Build a voting lookup: (term, sitting, voting_number) -> (id, polarity).
    voting_rows = _fetch_all("votings", "id,term,sitting,voting_number,title,motion_polarity")
    voting_by_key = {
        (r["term"], r["sitting"], r["voting_number"]): r["id"] for r in voting_rows
    }
    polarity_by_id = {r["id"]: r.get("motion_polarity") for r in voting_rows}

    # Existing links (so we can skip-count rather than rely solely on PK conflict).
    existing = _fetch_all("voting_print_links", "voting_id,print_id")
    existing_set = {(r["voting_id"], r["print_id"]) for r in existing}

    candidates: list[dict] = []

    # --- Source A: process_stages.voting jsonb -----------------------------
    stage_rows = _fetch_all(
        "process_stages",
        "process_id,term,voting",
        not_is={"voting": "null"},
    )
    # Need per-process print number to find the main print.
    process_rows = _fetch_all("processes", "id,term,number")
    process_number_by_id = {p["id"]: (p["term"], p["number"]) for p in process_rows}

    stage_a_count = 0
    for s in stage_rows:
        v = s.get("voting") or {}
        sitting = v.get("sitting")
        voting_number = v.get("votingNumber") or v.get("voting_number")
        term = v.get("term") or s.get("term")
        if not (sitting and voting_number and term):
            continue
        voting_id = voting_by_key.get((term, sitting, voting_number))
        if not voting_id:
            continue
        proc_key = process_number_by_id.get(s["process_id"])
        if not proc_key:
            continue
        p_term, p_number = proc_key
        # Main print (1:1 by process number). Role gated on motion_polarity
        # so procedural reject motions don't end up tagged "main".
        main_id = print_by_key.get((p_term, p_number))
        if main_id:
            candidates.append({
                "voting_id": voting_id, "print_id": main_id,
                "role": _role_for_single_print(polarity_by_id.get(voting_id)),
                "source": "process_stage_json",
            })
            stage_a_count += 1
        # Sub-prints (sprawozdanie / opinion children).
        for r in prints_rows:
            if r["term"] == p_term and r.get("number") and r["number"] != p_number:
                # This is a heavy nested loop; fine for thousands of prints.
                pass
        # Cheaper: iterate child prints once via parent_number index.
        # (Skipped — main + regex covers 99% of useful links.)

    # --- Source B: voting title regex --------------------------------------
    # Single-print votings: role gated on motion_polarity (see Source A
    # comment). Multi-print votings stay 'joint' regardless — that flag
    # describes scope (which prints does this vote affect), not polarity.
    regex_count = 0
    for v in voting_rows:
        nums = _extract_print_numbers(v.get("title") or "")
        if len(nums) < 1:
            continue
        role = "joint" if len(nums) > 1 else _role_for_single_print(v.get("motion_polarity"))
        for num in nums:
            pid = print_by_key.get((v["term"], num))
            if not pid:
                continue
            candidates.append({
                "voting_id": v["id"], "print_id": pid,
                "role": role, "source": "voting_title_regex",
            })
            regex_count += 1

    # Split candidates by source so the two-phase upsert can express the
    # source-preference rule: process_stage_json must beat voting_title_regex
    # both on initial insert AND on re-run when a regex row landed first.
    by_pk: dict[tuple[int, int], dict] = {}
    for c in candidates:
        key = (c["voting_id"], c["print_id"])
        cur = by_pk.get(key)
        if cur is None or (cur["source"] == "voting_title_regex" and c["source"] == "process_stage_json"):
            by_pk[key] = c

    stage_a_rows = [c for c in by_pk.values() if c["source"] == "process_stage_json"]
    regex_rows   = [c for c in by_pk.values() if c["source"] == "voting_title_regex"]

    new_count = sum(1 for k in by_pk if k not in existing_set)
    skipped = len(by_pk) - new_count

    logger.info(
        "voting_print_links: stage_a={} regex={} unique_candidates={} new={} already_present={}",
        stage_a_count, regex_count, len(by_pk), new_count, skipped,
    )

    inserted = 0
    if not dry_run:
        # Phase 1: stage_a wins. PostgREST upsert without ignore_duplicates
        # → ON CONFLICT DO UPDATE on all non-key cols (role, source). Regex
        # rows already in the table get overwritten with process_stage_json.
        for batch in _chunked(stage_a_rows, 500):
            client.table("voting_print_links").upsert(
                batch, on_conflict="voting_id,print_id"
            ).execute()
            inserted += len(batch)
        # Phase 2: regex fills only gaps. ignore_duplicates=True → DO NOTHING
        # so we never demote a stage_a row to regex.
        for batch in _chunked(regex_rows, 500):
            client.table("voting_print_links").upsert(
                batch, on_conflict="voting_id,print_id", ignore_duplicates=True
            ).execute()
            inserted += len(batch)

    return {"inserted": inserted, "updated": 0, "skipped": skipped}


def reclassify_main_role_by_polarity(*, dry_run: bool = False) -> dict[str, int]:
    """One-shot re-classifier for existing voting_print_links rows tagged
    role='main' that should have been demoted by polarity.

    Mirror of migration 0088. Runnable from this side because PostgREST
    can do row-level updates (we don't have DDL access from the dev
    sandbox). Idempotent — skips rows already correct.

    Returns counts per resulting role.
    """
    client = supabase()
    # PostgREST embed pattern: pull motion_polarity via the FK in a single
    # request rather than N joins.
    page_size = 1000
    offset = 0
    fetched: list[dict] = []
    while True:
        resp = (
            client.table("voting_print_links")
            .select("voting_id,print_id,role,votings:voting_id(motion_polarity)")
            .eq("role", "main")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        chunk = resp.data or []
        if not chunk:
            break
        fetched.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size

    counts = {"_total_seen": len(fetched), "_demoted": 0, "_unchanged": 0,
              "main": 0, "poprawka": 0, "other": 0}
    for row in fetched:
        v = row.get("votings") or {}
        polarity = v.get("motion_polarity") if isinstance(v, dict) else None
        new_role = _role_for_single_print(polarity)
        counts[new_role] = counts.get(new_role, 0) + 1
        if new_role == "main":
            counts["_unchanged"] += 1
            continue
        if dry_run:
            continue
        client.table("voting_print_links").update({"role": new_role}).eq(
            "voting_id", row["voting_id"]
        ).eq("print_id", row["print_id"]).execute()
        counts["_demoted"] += 1

    logger.info("reclassify_main_role_by_polarity {}", counts)
    return counts


# ---------------------------------------------------------------------------
# 2. opinion_source
# ---------------------------------------------------------------------------

# Order matters: full names BEFORE acronyms. First match wins.
_OPINION_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"Biuro Analiz Sejmowych", re.I), "BAS"),
    (re.compile(r"S[ąa]du Najwy[żz]sz", re.I), "SN"),
    (re.compile(r"Krajowej Rady S[ąa]downiczej", re.I), "KRS"),
    (re.compile(r"Krajowej Rady Radc[óo]w", re.I), "KRRP"),
    (re.compile(r"Naczelnej Rady Adwokackiej", re.I), "NRA"),
    (re.compile(r"Naczelnej Rady Lekarskiej", re.I), "NRL"),
    (re.compile(r"Narodowego Banku Polskiego", re.I), "NBP"),
    (re.compile(r"Prokuratora Generalnego", re.I), "PG"),
    (re.compile(r"Rzecznika Praw Obywatelskich", re.I), "RPO"),
    (re.compile(r"Przewodnicz[ąa]cego Komisji ds\.? Po[żz]ytku", re.I), "PKDP"),
    (re.compile(r"Rady Dialogu Spo[łl]ecznego", re.I), "RDS"),
    (re.compile(r"G[łl][óo]wnego Urz[ęe]du Statystycznego", re.I), "GUS"),
    (re.compile(r"Rady Dzia[łl]alno[śs]ci Po[żz]ytku", re.I), "RDPP"),
    (re.compile(r"Helsi[ńn]skiej Fundacji", re.I), "HFPC"),
    (re.compile(r"Urz[ęe]du Ochrony Danych", re.I), "UODO"),
    (re.compile(r"Prezesa Rady Ministr[óo]w", re.I), "PRM"),
    (re.compile(r"Rady Ministr[óo]w", re.I), "RM"),
    (re.compile(r"S[ąa]du Apelacyjnego", re.I), "SLR"),
    (re.compile(r"opinia rz[ąa]du|R[Zz][ĄA]D", re.I), "RZAD"),
    (re.compile(r"ocena skutk[óo]w regulacji", re.I), "OSR"),
    (re.compile(r"wnioskodawc(?:y|[ąa])", re.I), "WNIOSKODAWCA"),
    # Acronyms last — most specific full names win above.
    (re.compile(r"\bBAS\b"), "BAS"),
    (re.compile(r"\bS\.?N\.?\b"), "SN"),
    (re.compile(r"\bKRS\b"), "KRS"),
    (re.compile(r"\bKRRP\b"), "KRRP"),
    (re.compile(r"\bNRA\b"), "NRA"),
    (re.compile(r"\bNRL\b"), "NRL"),
    (re.compile(r"\bNBP\b"), "NBP"),
    (re.compile(r"\bPG\b"), "PG"),
    (re.compile(r"\bRPO\b"), "RPO"),
    (re.compile(r"\bPKDP\b"), "PKDP"),
    (re.compile(r"\bOSR\b"), "OSR"),
    (re.compile(r"\bRDS\b"), "RDS"),
    (re.compile(r"\bGUS\b"), "GUS"),
    (re.compile(r"\bRDPP\b"), "RDPP"),
    (re.compile(r"\bHFPC\b"), "HFPC"),
    (re.compile(r"\bUODO\b"), "UODO"),
    (re.compile(r"\bPRM\b"), "PRM"),
    (re.compile(r"\bRM\b"), "RM"),
]


def _classify_opinion_source(title: str) -> str | None:
    if not title:
        return None
    for pat, code in _OPINION_RULES:
        if pat.search(title):
            return code
    return None


def backfill_opinion_source(*, dry_run: bool = False) -> dict[str, int]:
    """For meta-document / sub-print rows, extract opinion_source from title.

    Skips prints with document_category='autopoprawka' (set source NULL).
    """
    client = supabase()
    rows = _fetch_all(
        "prints",
        "id,title,short_title,document_category,is_meta_document,parent_number,opinion_source",
    )
    updated = 0
    cleared = 0
    skipped = 0
    for r in rows:
        if r.get("document_category") == "autopoprawka":
            if r.get("opinion_source") is not None:
                if not dry_run:
                    client.table("prints").update({"opinion_source": None}).eq("id", r["id"]).execute()
                cleared += 1
            else:
                skipped += 1
            continue
        if not (r.get("is_meta_document") or r.get("parent_number")):
            skipped += 1
            continue
        if r.get("opinion_source"):
            skipped += 1  # already set, leave it
            continue
        title = (r.get("title") or "") + " " + (r.get("short_title") or "")
        code = _classify_opinion_source(title)
        if code is None:
            skipped += 1
            continue
        if not dry_run:
            client.table("prints").update({"opinion_source": code}).eq("id", r["id"]).execute()
        updated += 1
    logger.info(
        "opinion_source: matched={} cleared_autopoprawka={} skipped={}",
        updated, cleared, skipped,
    )
    return {"inserted": 0, "updated": updated + cleared, "skipped": skipped}


# ---------------------------------------------------------------------------
# 3. prints_considered_jointly
# ---------------------------------------------------------------------------

def backfill_prints_considered_jointly(*, dry_run: bool = False) -> dict[str, int]:
    """For every voting whose title lists multiple drukı, ensure the
    corresponding processes' prints_considered_jointly array contains
    every other print number from the same group.

    Uses raw SQL via supabase rpc-style array merge to avoid round-trips.
    Falls back to per-row update via PostgREST when needed.
    """
    client = supabase()

    voting_rows = _fetch_all("votings", "id,term,title")
    process_rows = _fetch_all("processes", "id,term,number,prints_considered_jointly")
    proc_by_key = {(p["term"], p["number"]): p for p in process_rows}

    # Build target sets: for each (term, number), the union of co-listed numbers.
    targets: dict[tuple[int, str], set[str]] = {}
    for v in voting_rows:
        nums = _extract_print_numbers(v.get("title") or "")
        if len(nums) < 2:
            continue
        for n in nums:
            others = [x for x in nums if x != n]
            targets.setdefault((v["term"], n), set()).update(others)

    updated = 0
    skipped = 0
    for (term, num), others in targets.items():
        proc = proc_by_key.get((term, num))
        if not proc:
            skipped += 1
            continue
        existing = set(proc.get("prints_considered_jointly") or [])
        merged = sorted(existing | others)
        if merged == sorted(existing):
            skipped += 1
            continue
        if not dry_run:
            client.table("processes").update(
                {"prints_considered_jointly": merged}
            ).eq("id", proc["id"]).execute()
        updated += 1
    logger.info(
        "prints_considered_jointly: voting_groups={} updated={} skipped={}",
        len(targets), updated, skipped,
    )
    return {"inserted": 0, "updated": updated, "skipped": skipped}


# ---------------------------------------------------------------------------
# 4. autopoprawka_relations
# ---------------------------------------------------------------------------

def backfill_autopoprawka_relations(*, dry_run: bool = False) -> dict[str, int]:
    """Insert print_relationships(relation_type='autopoprawka') from child->parent
    for every print whose number matches NNNN-X (single uppercase letter).

    print_relationships uses (term, from_number, to_number) — natural keys, not ids.
    """
    client = supabase()
    prints = _fetch_all("prints", "id,term,number,parent_number")
    by_key = {(p["term"], p["number"]): p for p in prints}

    existing_rel = _fetch_all(
        "print_relationships",
        "term,from_number,to_number,relation_type",
        eq={"relation_type": "autopoprawka"},
    )
    existing_set = {(r["term"], r["from_number"], r["to_number"]) for r in existing_rel}

    inserted = 0
    parent_set = 0
    skipped = 0
    for p in prints:
        m = _AUTOPOPRAWKA_RE.match(p["number"] or "")
        if not m:
            continue
        parent_num = m.group(1)
        parent = by_key.get((p["term"], parent_num))
        if not parent:
            skipped += 1
            continue
        key = (p["term"], p["number"], parent_num)
        if key not in existing_set:
            if not dry_run:
                client.table("print_relationships").insert({
                    "term": p["term"],
                    "from_number": p["number"],
                    "to_number": parent_num,
                    "relation_type": "autopoprawka",
                    "is_self_ref": False,
                    "ordinal": 0,
                }).execute()
            inserted += 1
        else:
            skipped += 1
        # Set parent_number on the child print if missing.
        # NOTE: prints_additional_consistency check requires is_additional=true
        # whenever parent_number is set, so flip both atomically.
        if not p.get("parent_number"):
            if not dry_run:
                client.table("prints").update(
                    {"parent_number": parent_num, "is_additional": True}
                ).eq("id", p["id"]).execute()
            parent_set += 1
    logger.info(
        "autopoprawka_relations: inserted={} parent_number_set={} skipped={}",
        inserted, parent_set, skipped,
    )
    return {"inserted": inserted, "updated": parent_set, "skipped": skipped}


# ---------------------------------------------------------------------------
# 5. rapporteur_mp_ids
# ---------------------------------------------------------------------------

def backfill_rapporteur_mp_ids(*, dry_run: bool = False) -> dict[str, int]:
    """Resolve process_stages.rapporteur_id from rapporteur_name when null."""
    client = supabase()

    rows = _fetch_all(
        "process_stages",
        "id,term,rapporteur_id,rapporteur_name",
        is_={"rapporteur_id": "null"},
        not_is={"rapporteur_name": "null"},
    )
    if not rows:
        logger.info("rapporteur_mp_ids: no rows need backfill")
        return {"inserted": 0, "updated": 0, "skipped": 0}

    mps = _fetch_all("mps", "id,mp_id,term,first_name,last_name,first_last_name")
    # Build per-term indexes.
    full_idx: dict[tuple[int, str], list[int]] = {}
    last_idx: dict[tuple[int, str], list[int]] = {}
    for m in mps:
        full = m.get("first_last_name") or f"{m.get('first_name','')} {m.get('last_name','')}".strip()
        if full:
            full_idx.setdefault((m["term"], _strip_diacritics(full)), []).append(m["mp_id"])
        last = m.get("last_name")
        if last:
            last_idx.setdefault((m["term"], _strip_diacritics(last)), []).append(m["mp_id"])

    updated = 0
    skipped_ambiguous = 0
    skipped_nomatch = 0
    for r in rows:
        name = r.get("rapporteur_name") or ""
        norm = _strip_diacritics(name)
        cands = full_idx.get((r["term"], norm), [])
        if not cands:
            # Fall back to last token = surname.
            tokens = norm.split()
            if tokens:
                cands = last_idx.get((r["term"], tokens[-1]), [])
        if len(cands) == 1:
            if not dry_run:
                client.table("process_stages").update(
                    {"rapporteur_id": cands[0]}
                ).eq("id", r["id"]).execute()
            updated += 1
        elif len(cands) > 1:
            logger.warning("rapporteur ambiguous: name={!r} term={} candidates={}", name, r["term"], len(cands))
            skipped_ambiguous += 1
        else:
            skipped_nomatch += 1
    logger.info(
        "rapporteur_mp_ids: updated={} ambiguous={} no_match={}",
        updated, skipped_ambiguous, skipped_nomatch,
    )
    return {"inserted": 0, "updated": updated, "skipped": skipped_ambiguous + skipped_nomatch}


# ---------------------------------------------------------------------------
# 6. committee_ids
# ---------------------------------------------------------------------------

def backfill_committee_ids(*, dry_run: bool = False) -> dict[str, int]:
    """Resolve process_stages.committee_id from committee_code/committee_name when null.

    Schema note: process_stages has committee_code (not committee_name); committees
    keys on (term, code). We try code-match first.
    """
    client = supabase()
    rows = _fetch_all(
        "process_stages",
        "id,term,committee_id,committee_code",
        is_={"committee_id": "null"},
        not_is={"committee_code": "null"},
    )
    if not rows:
        logger.info("committee_ids: no rows need backfill")
        return {"inserted": 0, "updated": 0, "skipped": 0}

    committees = _fetch_all("committees", "id,term,code,name")
    by_code = {(c["term"], (c.get("code") or "").upper()): c["id"] for c in committees}
    by_name = {(c["term"], _strip_diacritics(c.get("name") or "")): c["id"] for c in committees}

    updated = 0
    unmatched = 0
    for r in rows:
        code = (r.get("committee_code") or "").upper()
        cid = by_code.get((r["term"], code))
        if cid is None:
            cid = by_name.get((r["term"], _strip_diacritics(code)))
        if cid is None:
            logger.warning("committee unmatched: code={!r} term={}", code, r["term"])
            unmatched += 1
            continue
        if not dry_run:
            client.table("process_stages").update({"committee_id": cid}).eq("id", r["id"]).execute()
        updated += 1
    logger.info("committee_ids: updated={} unmatched={}", updated, unmatched)
    return {"inserted": 0, "updated": updated, "skipped": unmatched}


# ---------------------------------------------------------------------------
# 7. statement_print_links
# ---------------------------------------------------------------------------

# Regex for "Pkt. NN" or "NN. punkt porządku dziennego" preamble in transcript
# bodies. The Sejm proceedings boilerplate prepends this before each speech
# block; agenda_items.ord is the same ordinal, so this gives us a surgical
# link from a statement to the specific agenda item it discussed.
_AGENDA_ORD_RE = re.compile(
    r"(?:Pkt\.\s*|(\d+)\.\s*punkt\s+porz[ąa]dku\s+dziennego)",
    re.IGNORECASE,
)
_PKT_PREFIX_RE = re.compile(r"\bPkt\.\s*(\d+)\b", re.IGNORECASE)
_PUNKT_PORZADKU_RE = re.compile(
    r"\b(\d+)\.\s*punkt\s+porz[ąa]dku\s+dziennego",
    re.IGNORECASE,
)


def _extract_agenda_ord(body_text: str) -> int | None:
    """Pull the agenda-item ordinal from a transcript body.

    Sejm transcript preambles use either 'Pkt. NN' or 'NN. punkt porządku
    dziennego' before substantive content. Returns the first match (ordinal
    is unique per proceeding so the first hit is canonical).
    """
    if not body_text:
        return None
    m = _PKT_PREFIX_RE.search(body_text[:600])  # preamble window
    if m:
        return int(m.group(1))
    m = _PUNKT_PORZADKU_RE.search(body_text[:600])
    if m:
        return int(m.group(1))
    return None


def backfill_statement_print_links(*, dry_run: bool = False, term: int = 10) -> dict[str, int]:
    """Materialize statement_print_links from two sources:

      A) AGENDA — statement -> proceeding_day -> proceeding -> agenda_items
         narrowed by 'Pkt. NN' / 'NN. punkt porządku dziennego' ordinal in
         body_text -> agenda_item_prints. Source='agenda', confidence 0.95.

      B) MENTION — _DRUKI_RE regex on body_text matches 'druk(i) nr X, Y'
         tokens. Source='mention', confidence 0.7.

    Idempotent: PK is (statement_id, print_id, source) so re-runs upsert no-op.
    Same statement+print may appear under both sources (treated as different
    rows by PK).
    """
    client = supabase()

    # 1. Print lookup: (term, number) -> id
    prints_rows = _fetch_all("prints", "id,term,number", eq={"term": term})
    print_by_key = {(r["term"], r["number"]): r["id"] for r in prints_rows}

    # 2. Statements with body_text
    stmts = _fetch_all(
        "proceeding_statements",
        "id,proceeding_day_id,body_text",
        eq={"term": term},
        not_is={"body_text": "null"},
    )
    if not stmts:
        logger.info("statement_print_links: no statements with body_text")
        return {"inserted": 0, "updated": 0, "skipped": 0}

    # 3. Day -> proceeding_id map (so we can find agenda_items by proceeding)
    day_ids = sorted({s["proceeding_day_id"] for s in stmts if s.get("proceeding_day_id")})
    days = _fetch_all("proceeding_days", "id,proceeding_id")
    day_to_proc = {d["id"]: d["proceeding_id"] for d in days if d["id"] in set(day_ids)}

    # 4. agenda_items keyed by (proceeding_id, ord)
    ag_items = _fetch_all("agenda_items", "id,proceeding_id,ord")
    ag_by_proc_ord: dict[tuple[int, int], int] = {
        (a["proceeding_id"], a["ord"]): a["id"] for a in ag_items
    }

    # 5. agenda_item_prints: agenda_item_id -> list of print_ids
    aip = _fetch_all("agenda_item_prints", "agenda_item_id,term,print_number")
    prints_by_ai: dict[int, list[int]] = {}
    for r in aip:
        pid = print_by_key.get((r["term"], r["print_number"]))
        if pid is None:
            continue
        prints_by_ai.setdefault(r["agenda_item_id"], []).append(pid)

    candidates: list[dict] = []
    agenda_hits = 0
    mention_hits = 0
    statements_with_agenda_ord = 0
    statements_with_mention = 0

    for s in stmts:
        body = s.get("body_text") or ""
        if not body:
            continue

        # A) Agenda pass — narrow by Pkt. ordinal.
        ordinal = _extract_agenda_ord(body)
        agenda_item_id: int | None = None
        if ordinal is not None and s.get("proceeding_day_id") in day_to_proc:
            statements_with_agenda_ord += 1
            proc_id = day_to_proc[s["proceeding_day_id"]]
            agenda_item_id = ag_by_proc_ord.get((proc_id, ordinal))
            if agenda_item_id is not None:
                for pid in prints_by_ai.get(agenda_item_id, []):
                    candidates.append({
                        "statement_id": s["id"],
                        "print_id": pid,
                        "source": "agenda_item",
                        "confidence": 0.95,
                        "agenda_item_id": agenda_item_id,
                    })
                    agenda_hits += 1

        # B) Mention pass — regex on body_text.
        nums = _extract_print_numbers(body)
        if nums:
            statements_with_mention += 1
        for num in nums:
            pid = print_by_key.get((term, num))
            if pid is None:
                continue
            candidates.append({
                "statement_id": s["id"],
                "print_id": pid,
                "source": "title_regex",
                "confidence": 0.7,
                "agenda_item_id": agenda_item_id,  # may be None
            })
            mention_hits += 1

    # Dedup: PK is (statement_id, print_id, source). Last write wins per
    # group; agenda_item_id collapses to first non-null.
    by_pk: dict[tuple[int, int, str], dict] = {}
    for c in candidates:
        key = (c["statement_id"], c["print_id"], c["source"])
        cur = by_pk.get(key)
        if cur is None:
            by_pk[key] = c
        elif cur.get("agenda_item_id") is None and c.get("agenda_item_id") is not None:
            by_pk[key] = c

    rows = list(by_pk.values())
    logger.info(
        "statement_print_links: statements={} agenda_hits={} mention_hits={} "
        "stmts_with_pkt_ord={} stmts_with_druk_mention={} unique_links={}",
        len(stmts), agenda_hits, mention_hits,
        statements_with_agenda_ord, statements_with_mention, len(rows),
    )

    inserted = 0
    if not dry_run and rows:
        for batch in _chunked(rows, 500):
            client.table("statement_print_links").upsert(
                batch, on_conflict="statement_id,print_id,source"
            ).execute()
            inserted += len(batch)

    return {"inserted": inserted, "updated": 0, "skipped": 0}


# ---------------------------------------------------------------------------
# 8. is_procedural_substantive
# ---------------------------------------------------------------------------

# Use raw SQL — set-based UPDATEs are >100x faster than per-row PostgREST.
# Routed via Postgres function exec_backfill_sql defined inline (or fall back
# to running each statement through the table API as best-effort).

_PROCEDURAL_SQL = [
    # Substantive bills wrongly flagged procedural — gov/president sponsored.
    """
    update prints set is_procedural = false
    where document_category = 'projekt_ustawy'
      and sponsor_authority in ('rzad','prezydent')
      and is_procedural = true
    """,
    # Substantive bills by topic regex.
    r"""
    update prints set is_procedural = false
    where document_category = 'projekt_ustawy'
      and (
        title ~* 'kodeks(u|ie)? (karny|karnego|karnym|postępowania|cywiln|pracy|spółek|rodzinny)' or
        title ~* '(podatk|akcyz|VAT|PIT|CIT|ZUS|NFZ|emerytur|zasiłk|świadcz|ochron|bezpiecze)'
      )
      and is_procedural = true
    """,
    # Catch undertagged procedural docs.
    """
    update prints set is_procedural = true
    where document_category in (
      'autopoprawka','wniosek_personalny','pismo_marszalka','wniosek_organizacyjny',
      'uchwala_upamietniajaca','uchwala_senatu','wotum_nieufnosci',
      'weto_prezydenta','informacja'
    )
      and is_procedural is null
    """,
]


def backfill_is_procedural_substantive(*, dry_run: bool = False) -> dict[str, int]:
    """Run the three procedural-correction UPDATEs as a single RPC.

    Set-based: one round-trip to update_is_procedural_substantive() (mig 0057)
    instead of one PUT per row. Was N PUTs over PostgREST on a 543-row corpus
    — ~3-5x slower than necessary on every run.
    """
    client = supabase()
    if dry_run:
        # No-op preview: function would run 3 SQL updates server-side; report
        # zeros so the caller sees this is a write op.
        logger.info("is_procedural: DRY-RUN (no SQL executed)")
        return {"inserted": 0, "updated": 0, "skipped": 0}

    res = client.rpc("update_is_procedural_substantive", {}).execute()
    rows = res.data or []
    if not rows:
        return {"inserted": 0, "updated": 0, "skipped": 0}
    row = rows[0] if isinstance(rows, list) else rows
    upd_a = int(row.get("gov_bills_fixed", 0) or 0)
    upd_b = int(row.get("topic_fixed", 0) or 0)
    upd_c = int(row.get("categories_fixed", 0) or 0)
    logger.info(
        "is_procedural: gov_bills_corrected={} topic_corrected={} categories_set_true={}",
        upd_a, upd_b, upd_c,
    )
    return {"inserted": 0, "updated": upd_a + upd_b + upd_c, "skipped": 0}


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

class BackfillFailures(RuntimeError):
    """Raised by run_all when one or more backfills error.

    Why a custom exception: CI catches this in cli.py and converts to a
    non-zero exit code. The original blanket-except swallowed everything
    and left exit=0 — green CI was masking real failures.
    """

    def __init__(self, failed: dict[str, str], partial: dict[str, dict[str, int]]):
        self.failed = failed
        self.partial = partial
        super().__init__(f"{len(failed)} backfill(s) failed: {list(failed)}")


def run_all(*, dry_run: bool = False) -> dict[str, dict[str, int]]:
    """Run every backfill in the safe order.

    Raises BackfillFailures if any individual backfill errored — partial
    results still attached so the caller can log per-job counts before
    re-raising.

    Order:
      1. opinion_source              (no FK deps)
      2. is_procedural_substantive   (no FK deps)
      3. autopoprawka_relations      (insert print_relationships)
      4. prints_considered_jointly   (update processes array)
      5. rapporteur_mp_ids
      6. committee_ids
      7. statement_print_links       (no-op until schema extends)
      8. voting_print_links          (last — slowest, large fan-out)
    """
    out: dict[str, dict[str, int]] = {}
    failures: dict[str, str] = {}
    for name, fn in (
        ("opinion_source", backfill_opinion_source),
        ("is_procedural", backfill_is_procedural_substantive),
        ("autopoprawka_relations", backfill_autopoprawka_relations),
        ("prints_considered_jointly", backfill_prints_considered_jointly),
        ("rapporteur_mp_ids", backfill_rapporteur_mp_ids),
        ("committee_ids", backfill_committee_ids),
        ("statement_print_links", backfill_statement_print_links),
        ("voting_print_links", backfill_voting_print_links),
        ("reclassify_main_role_by_polarity", reclassify_main_role_by_polarity),
    ):
        logger.info("=== backfill: {} ===", name)
        try:
            out[name] = fn(dry_run=dry_run)
        except Exception as e:
            logger.error("backfill {} failed: {!r}", name, e)
            out[name] = {"inserted": 0, "updated": 0, "skipped": 0, "error": str(e)}
            failures[name] = repr(e)
    if failures:
        raise BackfillFailures(failures, out)
    return out
