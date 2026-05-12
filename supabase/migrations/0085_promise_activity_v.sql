-- 0085_promise_activity_v.sql
-- Read-side view for the /obietnice hub.
--
-- Joins promises with rollup counts from promise_print_candidates so the
-- frontend can render activity buckets ("z drukami / z potwierdzonym /
-- bez ruchu") without N+1 queries. Sort key in the feed is confirmed_count
-- DESC, candidate_count DESC, title ASC.
--
-- search_tsv is passed through verbatim so PostgREST consumers can run FTS
-- against the view if needed (current FE filters substring in memory).

CREATE OR REPLACE VIEW promise_activity_v AS
SELECT
    p.id,
    p.party_code,
    p.slug,
    p.title,
    p.normalized_text,
    p.source_url,
    p.source_quote,
    p.source_year,
    p.confidence,
    p.diacritics_restored_at,
    p.search_tsv,
    COALESCE(c.confirmed_count, 0)::int AS confirmed_count,
    COALESCE(c.candidate_count, 0)::int AS candidate_count,
    c.last_reranked_at AS last_activity_at
FROM promises p
LEFT JOIN (
    SELECT
        promise_id,
        COUNT(*) FILTER (WHERE match_status = 'confirmed') AS confirmed_count,
        COUNT(*) FILTER (WHERE match_status = 'candidate') AS candidate_count,
        MAX(reranked_at) AS last_reranked_at
    FROM promise_print_candidates
    GROUP BY promise_id
) c ON c.promise_id = p.id;

COMMENT ON VIEW promise_activity_v IS
    'Promises enriched with confirmed/candidate match counts for the /obietnice hub. '
    'Sort by (confirmed_count DESC, candidate_count DESC, title ASC) for the default feed.';
