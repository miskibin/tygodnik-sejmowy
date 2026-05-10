-- 0052_prints_topic.sql
-- Atlas A7: prints.topic — coarse 9-bucket classifier so module 03 (timeline
-- + topic filter) can SELECT WHERE topic = $X without a full-text scan.
-- NULL allowed until backfill (A8 in supagraf/backfill/topic.py) populates.
--
-- Why 9 buckets and not full taxonomy: Atlas spec puts ~9 categories on the
-- top-level filter; deeper specialisation lives in persona_tags + opinion_source.

alter table prints add column if not exists topic text;

alter table prints drop constraint if exists prints_topic_check;
alter table prints add constraint prints_topic_check
  check (topic is null or topic in (
    'mieszkania', 'zdrowie', 'energetyka', 'obrona', 'rolnictwo',
    'edukacja', 'sprawiedliwosc', 'podatki', 'inne'
  ));

-- Composite (term, topic) — Atlas filter is always term-scoped.
create index if not exists prints_term_topic_idx
  on prints (term, topic) where topic is not null;
