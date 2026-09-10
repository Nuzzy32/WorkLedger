-- WorkLedger off-chain store.
-- The chain is the source of truth; this holds only the text that a person
-- might one day want deleted, plus cached values for fast page loads.

create table if not exists platforms (
  id            integer primary key,      -- matches on-chain platformId
  name          text not null,
  logo_url      text,
  created_at    timestamptz default now()
);

create table if not exists workers (
  address           text primary key,     -- lowercase hex, 0x-prefixed
  display_name      text,
  headline          text,
  avatar_url        text,
  cached_score      numeric(4,2),
  cached_count      integer default 0,
  cached_at         timestamptz,
  created_at        timestamptz default now()
);

create table if not exists ratings (
  job_id        text primary key,         -- matches on-chain jobId
  worker        text not null references workers(address),
  client        text not null,
  platform_id   integer not null references platforms(id),
  score         smallint not null check (score between 1 and 5),
  comment       text,
  job_title     text,
  submitted_at  timestamptz not null,
  tx_hash       text not null             -- a row without this is a rating that does not exist
);

create index if not exists ratings_worker_idx on ratings (worker, submitted_at desc);

create table if not exists sync_state (
  contract      text primary key,
  last_block    bigint not null
);

-- Row-level security.
--
-- Public read on profile data: the verification page must work with no account,
-- so anonymous select is the intended behaviour, not an oversight.
--
-- No public write policy exists, so all writes require the service role. This is
-- narrower than docs/SECURITY.md's eventual intent ("a worker updates only their
-- own profile row") because Privy authentication arrives in M4 — until then
-- there is no per-user identity to key a write policy on.

alter table platforms enable row level security;
alter table workers   enable row level security;
alter table ratings   enable row level security;
alter table sync_state enable row level security;

drop policy if exists platforms_public_read on platforms;
create policy platforms_public_read on platforms for select using (true);

drop policy if exists workers_public_read on workers;
create policy workers_public_read on workers for select using (true);

drop policy if exists ratings_public_read on ratings;
create policy ratings_public_read on ratings for select using (true);

-- Column-scoped read for the anonymous role.
--
-- RLS is row-level, so the policy above alone would hand an anonymous reader
-- the whole row, client included, and docs/SECURITY.md says the profile must
-- not link a client to a specific comment. Column grants are the only way to
-- withhold one column.
--
-- This narrows a bulk dump; it does not make the linkage private. The chain
-- publishes it permanently: RatingRegistry.ratingOf(jobId) returns a Rating
-- struct carrying client, so jobId -> client is public and joinable against
-- job_id -> comment here. Recorded so nobody mistakes this for a privacy
-- guarantee it cannot provide.
--
-- Guarded on pg_roles: the anonymous role is a Supabase construct and does not
-- exist in a plain Postgres, where an unguarded grant would abort the script.
-- The schema has to stay re-appliable in both places.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke select on ratings from anon;
    grant select (job_id, worker, platform_id, score, comment, job_title,
                  submitted_at, tx_hash) on ratings to anon;
  end if;
end
$$;

-- sync_state is indexer bookkeeping, not public data. No read policy.
