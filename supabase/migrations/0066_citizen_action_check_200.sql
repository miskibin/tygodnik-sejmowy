-- Align prints.citizen_action CHECK with Pydantic max_length=200 (raised in commit 5662c3f).
-- Idempotent: drop-if-exists then recreate at 200.

ALTER TABLE prints DROP CONSTRAINT IF EXISTS prints_citizen_action_length;

ALTER TABLE prints ADD CONSTRAINT prints_citizen_action_length
  CHECK (citizen_action IS NULL OR (char_length(citizen_action) >= 1 AND char_length(citizen_action) <= 200));
