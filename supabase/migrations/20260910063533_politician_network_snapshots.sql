-- A single atomic publication per term. Readers never see a half-built graph.
create table public.politician_network_snapshots (
  term integer primary key check (term > 0),
  generated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  check (payload ? 'schema_version'
         and jsonb_typeof(payload->'schema_version') = 'string'
         and payload->>'schema_version' = '1'),
  check (payload ? 'term'
         and jsonb_typeof(payload->'term') = 'number'
         and (payload->>'term')::integer = term)
);
alter table public.politician_network_snapshots enable row level security;
create policy network_public_read on public.politician_network_snapshots
  for select to anon, authenticated using (true);
grant select on public.politician_network_snapshots to anon, authenticated;
grant select, insert, update, delete on public.politician_network_snapshots to service_role;
comment on table public.politician_network_snapshots is
  'Experimental, source-backed politician network. Published by ETL only after a complete build; methodology and coverage included in payload.';
notify pgrst, 'reload schema';
