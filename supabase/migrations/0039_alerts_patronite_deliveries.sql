-- ============================================================================
-- 0039_alerts_patronite_deliveries.sql -- schema slots for:
--   P5.1 alert subscriptions + dispatches
--   P5.2 patronite revenue + infra costs
--   P5.3 brief deliveries audit (Resend integration deferred)
--
-- These tables are written by frontend/API and operator scripts (not by ETL
-- stage builders). This migration creates the slots; data lands later.
-- ============================================================================

-- =============== P5.1: Alert subscriptions ===============
do $$ begin
  if not exists (select 1 from pg_type where typname='alert_target_type') then
    create type alert_target_type as enum (
      'phrase','mp','klub','komisja','process','druk','okreg','eli'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname='alert_channel') then
    create type alert_channel as enum (
      'email','rss','telegram','webpush','ics'
    );
  end if;
end $$;

create table if not exists alert_subscriptions (
  id              bigserial primary key,
  user_id         uuid,
  email_hash      text,
  target_type     alert_target_type not null,
  target_value    text not null,
  channel         alert_channel not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  check (user_id is not null or email_hash is not null)
);
create unique index if not exists alert_subs_uniq_idx on alert_subscriptions(
  coalesce(user_id::text, ''), coalesce(email_hash, ''), target_type, target_value, channel
);
create index if not exists alert_subs_user_idx on alert_subscriptions(user_id) where user_id is not null;
create index if not exists alert_subs_email_idx on alert_subscriptions(email_hash) where email_hash is not null;
create index if not exists alert_subs_target_idx on alert_subscriptions(target_type, target_value);

create table if not exists alert_dispatches (
  id                 bigserial primary key,
  subscription_id    bigint not null references alert_subscriptions(id) on delete cascade,
  event_type         text not null,
  payload            jsonb not null,
  channel_status     text,
  sent_at            timestamptz not null default now()
);
create index if not exists alert_dispatches_sub_idx on alert_dispatches(subscription_id, sent_at desc);

-- =============== P5.2: Patronite revenue + infra costs ===============
create table if not exists patrons_monthly (
  month            date primary key check (extract(day from month) = 1),
  n_patrons        integer not null check (n_patrons >= 0),
  total_zl         numeric(10,2) not null check (total_zl >= 0),
  source           text not null,
  imported_at      timestamptz not null default now(),
  notes            text
);

create table if not exists infra_costs (
  month            date not null check (extract(day from month) = 1),
  category         text not null,
  zl               numeric(10,2) not null check (zl >= 0),
  note             text,
  primary key (month, category)
);

-- =============== P5.3: Brief deliveries audit ===============
do $$ begin
  if not exists (select 1 from pg_type where typname='brief_channel') then
    create type brief_channel as enum ('email','rss');
  end if;
end $$;

create table if not exists brief_deliveries (
  id               bigserial primary key,
  user_id          uuid,
  email_hash       text,
  issue_no         integer not null check (issue_no > 0),
  channel          brief_channel not null,
  generated_at     timestamptz not null default now(),
  sent_at          timestamptz,
  opened_at        timestamptz,
  resend_message_id text,
  status           text,
  check (user_id is not null or email_hash is not null)
);
create unique index if not exists brief_del_uniq_idx on brief_deliveries(
  coalesce(user_id::text, ''), coalesce(email_hash, ''), issue_no, channel
);
create index if not exists brief_del_issue_idx on brief_deliveries(issue_no);
create index if not exists brief_del_status_idx on brief_deliveries(status) where status is not null;
