import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "../.tmp_supagraf/sql-test/node_modules/@electric-sql/pglite/dist/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = async (name) => readFile(join(root, "supabase", "migrations", name), "utf8");
const db = new PGlite();

async function rejectsSql(sql, pattern) {
  let error;
  try {
    await db.exec(sql);
  } catch (caught) {
    error = caught;
  }
  assert(error, `expected SQL to fail: ${sql}`);
  assert.match(String(error.message), pattern);
}

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;

  create type public.vote_choice as enum
    ('YES','NO','ABSTAIN','ABSENT','PRESENT','VOTE_VALID');
  create type public.voting_kind as enum ('ELECTRONIC','ON_LIST','TRADITIONAL');
  create table public.clubs (
    id bigint primary key, term integer not null, club_id text not null,
    unique (term, club_id)
  );
  create table public.mps (term integer not null, mp_id integer not null,
    primary key (term, mp_id));
  create table public.votings (
    id bigint primary key, term integer not null, date timestamptz not null,
    kind public.voting_kind not null
  );
  create table public.votes (
    voting_id bigint not null references public.votings(id), term integer not null,
    mp_id integer not null, club_ref text, vote public.vote_choice not null
  );
  create table public._stage_votings (
    term integer not null, natural_id text not null, payload jsonb not null
  );
  create table public.mp_club_membership (
    term integer not null, mp_id integer not null, club_id bigint not null
  );

  create view public.mp_vote_discipline as
  select v.voting_id, v.mp_id, v.term, c.id as club_id_at_vote,
         v.vote as club_modal_choice, v.vote as mp_choice, true as aligned
  from public.votes v join public.clubs c
    on c.term = v.term and c.club_id = v.club_ref
  where false;
`);

await db.exec(await migration("20260910063533_politician_network_snapshots.sql"));
await db.exec(await migration("20260910063557_fix_vote_club_history.sql"));

await db.exec(`
  insert into public._stage_votings values
    (10, '1__1', '{"totalVoted":2,"notParticipating":0,"votes":[{"vote":"YES"}]}'::jsonb),
    (10, '1__2', '{"totalVoted":1,"notParticipating":1,"votes":[{"vote":"YES"},{"vote":"ABSENT"}]}'::jsonb);
`);
assert.deepEqual(
  (await db.query("select natural_id from public.incomplete_staged_votings(10) order by natural_id")).rows,
  [{ natural_id: "1__1" }],
);
await db.exec("set role service_role");
assert.deepEqual(
  (await db.query("select natural_id from public.incomplete_staged_votings(10) order by natural_id")).rows,
  [{ natural_id: "1__1" }],
);
await db.exec("reset role");

await db.exec(`
  insert into public.clubs values (1,10,'A'),(2,10,'B'),(3,10,'C'),(4,10,'D');
  insert into public.votings values
    (1,10,'2026-01-01','ELECTRONIC'), (2,10,'2026-01-02','ELECTRONIC'),
    (10,10,'2026-02-01','ELECTRONIC'), (11,10,'2026-02-02','ELECTRONIC'),
    (12,10,'2026-02-03','ELECTRONIC'), (20,10,'2026-03-01','ON_LIST');
  insert into public.votes values
    (1,10,1,'A','NO'), (1,10,2,'A','YES'), (1,10,3,'A','YES'),
    (1,10,4,'A','YES'), (1,10,5,'A','YES'),
    (1,10,10,'B','YES'), (1,10,11,'B','YES'), (1,10,12,'B','YES'), (1,10,13,'B','YES'),
    (1,10,20,'C','YES'), (1,10,21,'C','YES'), (1,10,22,'C','YES'),
    (1,10,23,'C','NO'), (1,10,24,'C','NO'), (1,10,25,'C','NO'),
    (2,10,30,'D','PRESENT'), (2,10,31,'D','PRESENT'), (2,10,32,'D','PRESENT'),
    (2,10,33,'D','PRESENT'), (2,10,34,'D','PRESENT'),
    (20,10,40,'A','YES'), (20,10,41,'A','YES'), (20,10,42,'A','YES'),
    (20,10,43,'A','YES'), (20,10,44,'A','YES'),
    (10,10,99,'A','YES'), (11,10,99,'B','YES'), (12,10,99,'A','YES');
  insert into public.mp_club_membership values (10,1,2);
`);

const discipline = await db.query(`
  select mp_id, club_id_at_vote, club_modal_choice::text, mp_choice::text, aligned
  from public.mp_vote_discipline order by mp_id
`);
assert.equal(discipline.rows.length, 5, "only the five eligible club A roll-call rows remain");
assert.deepEqual(discipline.rows[0], {
  mp_id: 1, club_id_at_vote: 1, club_modal_choice: "YES", mp_choice: "NO", aligned: false,
});
assert.deepEqual(discipline.rows.map((row) => row.mp_id), [1, 2, 3, 4, 5]);

const transitions = await db.query(`
  select mp_id, change_date::text, from_club_short, to_club_short
  from public.detect_mp_club_transitions(10) where mp_id = 99 order by change_date
`);
assert.deepEqual(transitions.rows, [
  { mp_id: 99, change_date: "2026-02-01", from_club_short: null, to_club_short: "A" },
  { mp_id: 99, change_date: "2026-02-02", from_club_short: "A", to_club_short: "B" },
  { mp_id: 99, change_date: "2026-02-03", from_club_short: "B", to_club_short: "A" },
]);

await db.exec("set role anon");
assert.deepEqual((await db.query("select * from public.politician_network_snapshots")).rows, []);
await rejectsSql(
  `insert into public.politician_network_snapshots values
   (10, now(), '{"schema_version":"1","term":10}'::jsonb)`,
  /permission denied|row-level security/i,
);
await db.exec("reset role; set role service_role");
await db.exec(`
  insert into public.politician_network_snapshots values
    (10, now(), '{"schema_version":"1","term":10,"nodes":[]}'::jsonb)
  on conflict (term) do update set generated_at=excluded.generated_at, payload=excluded.payload;
`);
await db.exec(`
  insert into public.politician_network_snapshots values
    (10, now(), '{"schema_version":"1","term":10,"nodes":[1]}'::jsonb)
  on conflict (term) do update set generated_at=excluded.generated_at, payload=excluded.payload;
`);
assert.equal((await db.query("select payload->'nodes' as nodes from public.politician_network_snapshots")).rows[0].nodes[0], 1);
await rejectsSql(
  `insert into public.politician_network_snapshots values
   (11, now(), '{"schema_version":"2","term":11}'::jsonb)`,
  /check constraint/i,
);
await rejectsSql(
  `insert into public.politician_network_snapshots values
   (11, now(), '{"schema_version":"1","term":12}'::jsonb)`,
  /check constraint/i,
);
await rejectsSql(
  `insert into public.politician_network_snapshots values
   (11, now(), '{"term":11}'::jsonb)`,
  /check constraint/i,
);
await rejectsSql(
  `insert into public.politician_network_snapshots values
   (11, now(), '{"schema_version":null,"term":11}'::jsonb)`,
  /check constraint/i,
);
await rejectsSql(
  `insert into public.politician_network_snapshots values
   (11, now(), '{"schema_version":"1"}'::jsonb)`,
  /check constraint/i,
);
await rejectsSql(
  `insert into public.politician_network_snapshots values
   (11, now(), '{"schema_version":"1","term":null}'::jsonb)`,
  /check constraint/i,
);

await db.close();
console.log("PGlite migration checks passed");
