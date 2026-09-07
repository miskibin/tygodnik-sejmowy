-- 0106 — upstream added `VOTE_VALID` for ON_LIST votings (the MP cast a valid
-- list ballot; the per-option choices are in `votes.list_votes`). Without
-- the enum value `load_votes` aborts on the first ON_LIST voting, which is
-- why sittings with such votings never fully loaded before.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that adds
-- it; apply this file on its own (db-exec / psql), then re-run the daily.
alter type public.vote_choice add value if not exists 'VOTE_VALID';
