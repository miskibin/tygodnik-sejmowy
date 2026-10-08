begin;

alter table public.acts add column if not exists entry_into_force date;
alter table public.acts add column if not exists binding_from date;
alter table public.acts add column if not exists repeal_date date;
alter table public.acts add column if not exists expiration_date date;

create or replace function public.acts_legal_dates() returns trigger language plpgsql set search_path = public, pg_temp as $$
declare p jsonb;
begin
  select payload into p from public._stage_acts where eli_id = new.eli_id;
  if p is not null then
    new.entry_into_force := nullif(p->>'entryIntoForce','')::date;
    new.binding_from := nullif(p->>'validFrom','')::date;
    new.repeal_date := nullif(p->>'repealDate','')::date;
    new.expiration_date := nullif(p->>'expirationDate','')::date;
  end if;
  return new;
end $$;
create trigger acts_legal_dates before insert or update on public.acts for each row execute function public.acts_legal_dates();
update public.acts a set entry_into_force = nullif(s.payload->>'entryIntoForce','')::date,
  binding_from = nullif(s.payload->>'validFrom','')::date,
  repeal_date = nullif(s.payload->>'repealDate','')::date,
  expiration_date = nullif(s.payload->>'expirationDate','')::date
from public._stage_acts s where s.eli_id = a.eli_id;

create table public.law_roots (
  eli_id text primary key references public.acts(eli_id), family text not null,
  metadata_sha256 text not null, checked_at timestamptz not null default now(),
  coverage jsonb not null default '{}', last_error text
);
create table public.law_dependencies (
  root_eli_id text not null references public.law_roots(eli_id),
  dependency_eli_id text not null, category text not null,
  metadata_sha256 text, primary key(root_eli_id, dependency_eli_id, category)
);
create index law_dependencies_target on public.law_dependencies(dependency_eli_id);
create table public.law_versions (
  id text primary key check (length(id)=64), root_eli_id text not null references public.law_roots(eli_id),
  document_eli_id text not null references public.acts(eli_id), source_url text not null,
  source_sha256 text not null check(length(source_sha256)=64), source_type text not null,
  captured_at timestamptz not null, document_date date, metadata jsonb not null,
  parser_version text not null, extraction_method text not null,
  extraction_quality text not null check(extraction_quality in ('structured','needs_review')),
  warnings jsonb not null default '[]', notes text not null default '',
  unique(root_eli_id, document_eli_id, source_sha256, parser_version)
);
create table public.law_version_checks (
  version_id text primary key references public.law_versions(id),
  status text not null default 'unverified' check(status in ('unverified','verified','stale','rejected')),
  valid_from date, valid_to date, verified_at timestamptz, verified_by text,
  dependency_sha256 text not null, included_changes jsonb not null default '[]',
  unresolved_changes jsonb not null default '[]', reason text not null,
  context_verified boolean not null default false, coverage_verified boolean not null default false,
  check(valid_to is null or valid_from <= valid_to),
  check(status <> 'verified' or (valid_from is not null and verified_at is not null and verified_by is not null))
);
create table public.law_units (
  id text primary key check(length(id)=64), version_id text not null references public.law_versions(id),
  anchor text not null, label text not null, article_number text, ordinal integer not null,
  context jsonb not null default '[]', body text not null, body_sha256 text not null,
  references_json jsonb not null default '[]',
  fts tsvector generated always as (to_tsvector('public.polish_unaccent'::regconfig, label || ' ' || body)) stored,
  unique(version_id, anchor)
);
create index law_units_version on public.law_units(version_id, ordinal);
create index law_units_fts on public.law_units using gin(fts);
create table public.law_context_links (
  source_unit_id text not null references public.law_units(id),
  target_unit_id text not null references public.law_units(id),
  relation text not null check(relation in ('definition','exception','transition','reference')),
  reviewed_by text not null, reviewed_at timestamptz not null default now(), evidence_url text not null,
  primary key(source_unit_id,target_unit_id,relation), check(source_unit_id<>target_unit_id)
);
create table public.law_embedding_indexes (
  id text primary key, model text not null, model_digest text not null, dimension integer not null,
  query_prefix text not null default '', document_prefix text not null default '',
  encoder_options jsonb not null default '{}',
  active boolean not null default false, created_at timestamptz not null default now(),
  check(dimension > 0 and dimension <= 4096)
);
create unique index law_embedding_one_active on public.law_embedding_indexes(active) where active;
create table public.law_unit_embeddings (
  unit_id text not null references public.law_units(id), index_id text not null references public.law_embedding_indexes(id),
  body_sha256 text not null, vec public.vector not null, embedded_at timestamptz not null default now(),
  input_sha256 text check(input_sha256 is null or input_sha256 ~ '^[a-f0-9]{64}$'),
  primary key(unit_id, index_id)
);
create index law_embedding_input_cache on public.law_unit_embeddings(index_id,input_sha256);
create or replace function public.law_vector_dimension() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare d integer; h text;
begin
  select dimension into d from public.law_embedding_indexes where id=new.index_id;
  select body_sha256 into h from public.law_units where id=new.unit_id;
  if vector_dims(new.vec) <> d or h <> new.body_sha256 then raise exception 'Embedding model/dimension/content mismatch'; end if;
  return new;
end $$;
create trigger law_vector_dimension before insert or update on public.law_unit_embeddings for each row execute function public.law_vector_dimension();

create or replace function public.law_immutable() returns trigger language plpgsql as $$
begin raise exception 'Legal evidence is immutable; insert a new version'; end $$;
create trigger law_versions_immutable before update or delete on public.law_versions for each row execute function public.law_immutable();
create trigger law_units_immutable before update or delete on public.law_units for each row execute function public.law_immutable();
create trigger law_context_links_immutable before update or delete on public.law_context_links for each row execute function public.law_immutable();

create or replace function public.law_invalidate_dependency() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.payload is distinct from new.payload then
    update public.law_version_checks c set status='stale', reason='ELI metadata or a dependency changed; revalidation required'
    from public.law_versions v where c.version_id=v.id and c.status <> 'rejected'
      and (v.root_eli_id=new.eli_id or v.document_eli_id=new.eli_id or exists (
        select 1 from public.law_dependencies d where d.root_eli_id=v.root_eli_id and d.dependency_eli_id=new.eli_id));
  end if;
  return new;
end $$;
create trigger law_invalidate_dependency after update on public._stage_acts for each row execute function public.law_invalidate_dependency();

create view public.law_units_v with (security_invoker=true) as
select u.*, v.root_eli_id, v.document_eli_id, v.source_url, v.source_sha256, v.source_type,
 v.captured_at, v.document_date, v.extraction_quality, v.extraction_method,
 a.title as act_title, a.entry_into_force, a.repeal_date, c.status as currency_status,
 c.valid_from, c.valid_to, c.verified_at, c.reason as currency_reason,
 c.included_changes, c.unresolved_changes, c.dependency_sha256, c.context_verified, c.coverage_verified
from public.law_units u join public.law_versions v on v.id=u.version_id
join public.acts a on a.eli_id=v.root_eli_id join public.law_version_checks c on c.version_id=v.id;

create or replace function public.law_search(p_query text, p_date date default current_date,
 p_root text default null, p_article text default null, p_limit integer default 40,
 p_index text default null, p_vector text default null, p_version text default null)
returns table(unit_id text, version_id text, score double precision, retrieval text)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d integer;
begin
  if length(p_query)>1000 or p_limit<1 or p_limit>50 then raise exception 'Invalid search bounds'; end if;
  if p_vector is not null then
    select dimension into d from public.law_embedding_indexes where id=p_index;
    if d is null or vector_dims(p_vector::vector)<>d then raise exception 'Query model/index/dimension mismatch'; end if;
  end if;
  return query with documents as (
    select v.id, row_number() over(partition by v.root_eli_id order by v.document_date desc nulls last, v.captured_at desc, v.id) as newest
    from public.law_versions v join public.law_version_checks c on c.version_id=v.id
    where (p_root is null or v.root_eli_id=p_root) and c.status<>'rejected'
      and (p_version is null or v.id=p_version)
      and (p_version is not null or v.document_date is null or v.document_date<=p_date)
  ), candidates as (
    select u.* from public.law_units_v u join documents v on v.id=u.version_id
    where v.newest=1 and (p_article is null or u.article_number=p_article)
  ), lexical as (
    select id, row_number() over(order by case when p_article is not null then 1 else ts_rank_cd(fts,websearch_to_tsquery('public.polish_unaccent',p_query)) end desc,id) as rank
    from candidates where p_article is not null or fts @@ websearch_to_tsquery('public.polish_unaccent',p_query)
    limit 50
  ), semantic as (
    select e.unit_id as id, row_number() over(order by e.vec <=> p_vector::vector,e.unit_id) as rank
    from public.law_unit_embeddings e join candidates c on c.id=e.unit_id
    where p_vector is not null and e.index_id=p_index and e.body_sha256=c.body_sha256
    order by e.vec <=> p_vector::vector limit 50
  ) select c.id,c.version_id,
    (coalesce(1.0/(60+l.rank),0)+coalesce(1.0/(60+s.rank),0))::double precision,
    case when l.id is not null and s.id is not null then 'hybrid' when s.id is not null then 'semantic' else 'lexical' end
  from lexical l full outer join semantic s on l.id=s.id join candidates c on c.id=coalesce(l.id,s.id)
  order by 3 desc,c.id limit p_limit;
end $$;

create or replace function public.law_process_links(p_root text)
returns table(term integer,number text,title text,linked_eli text,relation text)
language sql stable security invoker set search_path=public,pg_temp as $$
 with related as (
   select p_root as eli_id,'Akt źródłowy'::text as category
   union all select dependency_eli_id,category from law_dependencies where root_eli_id=p_root
 ) select p.term,p.number::text,p.title::text,a.eli_id,string_agg(distinct r.category,', ' order by r.category)
 from related r join acts a on a.eli_id=r.eli_id join processes p on p.eli_act_id=a.id
 group by p.term,p.number,p.title,a.eli_id order by p.term desc,p.number desc limit 30;
$$;
revoke all on function public.law_process_links(text) from public;
grant execute on function public.law_process_links(text) to anon,authenticated,service_role;

create or replace function public.law_store_version(p_version jsonb,p_units jsonb,p_check jsonb)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
 if jsonb_array_length(p_units)=0 then raise exception 'No editorial units'; end if;
 insert into public.law_versions select * from jsonb_populate_record(null::public.law_versions,p_version) on conflict do nothing;
 insert into public.law_units(id,version_id,anchor,label,article_number,ordinal,context,body,body_sha256,references_json)
 select id,version_id,anchor,label,article_number,ordinal,context,body,body_sha256,references_json
 from jsonb_to_recordset(p_units) as x(id text,version_id text,anchor text,label text,article_number text,ordinal integer,
  context jsonb,body text,body_sha256 text,references_json jsonb) on conflict do nothing;
 get diagnostics n=row_count;
 insert into public.law_version_checks(version_id,dependency_sha256,unresolved_changes,reason)
 values(p_version->>'id',p_check->>'dependency_sha256',coalesce(p_check->'unresolved_changes','[]'::jsonb),p_check->>'reason')
 on conflict do nothing;
 return n;
end $$;

-- A document snapshot alone must never imply current applicability.
comment on table public.law_version_checks is 'Only explicit evidence can qualify applicability. Import defaults to unverified; changed dependencies invalidate checks.';
do $$ declare t text; begin
 foreach t in array array['law_roots','law_dependencies','law_versions','law_version_checks','law_units','law_context_links','law_embedding_indexes','law_unit_embeddings'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('create policy law_public_read on public.%I for select to anon,authenticated using(true)',t);
   execute format('grant select on public.%I to anon,authenticated',t);
   execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.law_units_v to anon,authenticated,service_role;
revoke all on function public.law_search(text,date,text,text,integer,text,text,text) from public;
grant execute on function public.law_search(text,date,text,text,integer,text,text,text) to anon,authenticated,service_role;
revoke all on function public.law_store_version(jsonb,jsonb,jsonb) from public;
grant execute on function public.law_store_version(jsonb,jsonb,jsonb) to service_role;
revoke all on function public.law_immutable(),public.law_vector_dimension(),public.law_invalidate_dependency(),public.acts_legal_dates() from public;

-- Replace the old event date without changing the existing view's columns.
create or replace view public.eli_inforce_events_v as
select 'eli_inforce'::text as event_type, 10 as term,
 event_bucket_sitting(10,a.entry_into_force) as sitting_num, a.entry_into_force as event_date,
 least(1.0,case when a.publisher='DU' then 0.5 else 0.3 end+least(0.5,char_length(a.title)::numeric/400.0)) as impact_score,
 jsonb_build_object('act_id',a.id,'eli_id',a.eli_id,'publisher',a.publisher,'year',a.year,'position',a.position,
 'type',a.type,'act_kind',to_jsonb(a)->>'act_kind','title',a.title,'short_title',a.short_title,'in_force',a.in_force,
 'legal_status_date',a.legal_status_date,'entry_into_force',a.entry_into_force,'announcement_date',a.announcement_date,
 'promulgation_date',a.promulgation_date,'display_address',a.display_address,'keywords',a.keywords) as payload,
 a.source_url,a.id::text as sort_key from public.acts a
where a.entry_into_force is not null and event_bucket_sitting(10,a.entry_into_force) is not null;
notify pgrst,'reload schema';
commit;
