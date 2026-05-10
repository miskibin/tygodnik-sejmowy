-- 0071_impact_punch_check_280.sql
--
-- Bump prints_impact_punch_length CHECK from 200 to 280 chars to match
-- Pydantic max_length and prompt v2. Citizen review (2026-05-08) flagged
-- mid-sentence truncation when LLM filled to the 200-char ceiling
-- (e.g. "...attach ur" cut from "...załącznik urbanistyczny").
--
-- Idempotent: drop-if-exists then recreate at 280.

alter table prints drop constraint if exists prints_impact_punch_length;
alter table prints add constraint prints_impact_punch_length check (
  impact_punch is null or char_length(impact_punch) <= 280
);
