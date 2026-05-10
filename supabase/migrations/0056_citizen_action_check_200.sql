-- 0056_citizen_action_check_200.sql
-- Pin prints_citizen_action_length CHECK at 200 chars to match Pydantic
-- max_length and prompt v3 (was 140 in 0031). Live DB was bumped ad-hoc
-- 140→200 earlier in the session to unblock a stuck v3 retry; this file
-- captures that DDL in source control so a fresh `supabase db reset`
-- doesn't regress to the old 140 limit.

alter table prints drop constraint if exists prints_citizen_action_length;
alter table prints add constraint prints_citizen_action_length check (
  citizen_action is null
  or (char_length(citizen_action) >= 1 and char_length(citizen_action) <= 200)
);
