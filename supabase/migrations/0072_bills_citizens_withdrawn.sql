-- 0072: Extend bills schema for historical backfill.
--
-- Sejm API surfaces values that don't fit the original (term-10-current) CHECK
-- constraints once the 2023-2024 historical capture lands:
--   * applicant_type='CITIZENS' (~42 obywatelska initiative bills)
--   * status='WITHDRAWN' + new top-level `withdrawnDate` field (~27 bills)
--
-- Extend constraints, add the column, and replace load_bills so it populates
-- the new column. Idempotent.

ALTER TABLE bills DROP CONSTRAINT bills_applicant_type_check;
ALTER TABLE bills ADD CONSTRAINT bills_applicant_type_check
  CHECK (applicant_type = ANY (ARRAY[
    'DEPUTIES'::text, 'GOVERNMENT'::text, 'PRESIDENT'::text,
    'COMMITTEE'::text, 'PRESIDIUM'::text, 'SENATE'::text,
    'CITIZENS'::text
  ]));

ALTER TABLE bills DROP CONSTRAINT bills_status_check;
ALTER TABLE bills ADD CONSTRAINT bills_status_check
  CHECK (status = ANY (ARRAY[
    'ACTIVE'::text, 'NOT_PROCEEDED'::text, 'WITHDRAWN'::text
  ]));

ALTER TABLE bills ADD COLUMN IF NOT EXISTS withdrawn_date date;

CREATE OR REPLACE FUNCTION public.load_bills(p_term integer DEFAULT 10)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  affected integer;
begin
  insert into bills(
    term, number, title, description,
    applicant_type, submission_type, status,
    eu_related, public_consultation, consultation_results,
    date_of_receipt,
    print_number, print_id,
    senders_number,
    public_consultation_start_date, public_consultation_end_date,
    withdrawn_date,
    source_path, staged_at, loaded_at
  )
  select
    s.term,
    s.payload->>'number',
    s.payload->>'title',
    s.payload->>'description',
    s.payload->>'applicantType',
    s.payload->>'submissionType',
    s.payload->>'status',
    (s.payload->>'euRelated')::boolean,
    (s.payload->>'publicConsultation')::boolean,
    (s.payload->>'consultationResults')::boolean,
    (s.payload->>'dateOfReceipt')::date,
    s.payload->>'print',
    p.id,
    s.payload->>'sendersNumber',
    nullif(s.payload->>'publicConsultationStartDate','')::date,
    nullif(s.payload->>'publicConsultationEndDate','')::date,
    nullif(s.payload->>'withdrawnDate','')::date,
    s.source_path,
    s.staged_at,
    now()
  from _stage_bills s
  left join prints p on p.term = s.term and p.number = s.payload->>'print'
  where s.term = p_term
  on conflict (term, number) do update set
    title = excluded.title,
    description = excluded.description,
    applicant_type = excluded.applicant_type,
    submission_type = excluded.submission_type,
    status = excluded.status,
    eu_related = excluded.eu_related,
    public_consultation = excluded.public_consultation,
    consultation_results = excluded.consultation_results,
    date_of_receipt = excluded.date_of_receipt,
    print_number = excluded.print_number,
    print_id = excluded.print_id,
    senders_number = excluded.senders_number,
    public_consultation_start_date = excluded.public_consultation_start_date,
    public_consultation_end_date = excluded.public_consultation_end_date,
    withdrawn_date = excluded.withdrawn_date,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;

  delete from unresolved_bill_print_refs
  where term = p_term and resolved_at is null;

  insert into unresolved_bill_print_refs(
    term, bill_number, bill_id, raw_print_number, reason
  )
  select
    b.term,
    b.number,
    b.id,
    b.print_number,
    'print_number not in prints; cross-resource or sentinel'
  from bills b
  where b.term = p_term
    and b.print_number is not null
    and b.print_id is null
  on conflict (term, bill_number, raw_print_number) do update set
    bill_id = excluded.bill_id,
    detected_at = now(),
    resolved_at = null,
    resolution_note = null;

  return affected;
end $function$;
