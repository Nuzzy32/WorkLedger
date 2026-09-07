# Data model

## Rule

Before adding a field, ask whether a person would want it deleted one day. If yes,
it goes in Postgres. Chain data is permanent.

## On chain

### PlatformRegistry

```solidity
struct Platform {
    address signer;      // key that signs job attestations
    bytes32 nameHash;    // keccak256 of the platform name
    uint64  registeredAt;
    bool    active;
}
```

Mapped by platform id. The name itself lives in Postgres. Hashing it keeps the
chain record small and lets anyone verify the name they were shown.

### WorkerRegistry

```solidity
struct Worker {
    uint64 registeredAt;
    uint32 ratingCount;
    uint32 scoreSum;      // sum of scores, 1..5 each
    bool   exists;
}
```

No name, no email, no ID. Wallet address is the key.

`scoreSum` and `ratingCount` together give the average without storing every
rating in a growable array, which would make reads cost more over time.

### RatingRegistry

```solidity
struct Rating {
    address worker;
    address client;
    uint32  platformId;
    uint8   score;          // 1..5
    uint64  submittedAt;
    bytes32 contentHash;    // keccak256 of the off-chain comment, 0 if none
}
```

Keyed by `jobId`, a `bytes32`. Using `jobId` as the key makes duplicate submission
impossible at the storage level rather than through a separate check.

### Events

```solidity
event PlatformRegistered(uint32 indexed platformId, address indexed signer);
event PlatformDeactivated(uint32 indexed platformId);
event WorkerRegistered(address indexed worker, uint64 registeredAt);
event RatingSubmitted(
    bytes32 indexed jobId,
    address indexed worker,
    address indexed client,
    uint32 platformId,
    uint8 score
);
```

Index `worker` so the app queries one worker's history cheaply. Do not index
`score`, nobody filters on it.

## Postgres

```sql
create table platforms (
  id            integer primary key,      -- matches on-chain platformId
  name          text not null,
  logo_url      text,
  created_at    timestamptz default now()
);

create table workers (
  address           text primary key,     -- lowercase hex, 0x-prefixed
  display_name      text,
  headline          text,
  avatar_url        text,
  cached_score      numeric(4,2),
  cached_count      integer default 0,
  cached_at         timestamptz,
  created_at        timestamptz default now()
);

create table ratings (
  job_id        text primary key,         -- matches on-chain jobId
  worker        text not null references workers(address),
  client        text not null,
  platform_id   integer not null references platforms(id),
  score         smallint not null check (score between 1 and 5),
  comment       text,
  job_title     text,
  submitted_at  timestamptz not null,
  tx_hash       text not null
);

create index ratings_worker_idx on ratings (worker, submitted_at desc);

create table sync_state (
  contract      text primary key,
  last_block    bigint not null
);
```

`sync_state` tracks how far the indexer job has read so a restart does not replay
from block zero.

## Consistency

The chain wins. Postgres is a cache and a place for text.

If the two disagree, the app trusts the chain and flags the row for resync. The
profile page shows a small notice when `cached_at` is older than five minutes and
the RPC read disagrees with the cache.

Never write a rating to Postgres without a confirmed transaction hash. A row with
no `tx_hash` is a rating that does not exist.

## Address format

Store addresses lowercase everywhere in Postgres. Checksummed and lowercase forms
of the same address will silently create two rows otherwise, and you will lose an
afternoon to it.

## Seeding the demo

The demo needs a history that looks lived-in. Seed:

- 3 platforms with different names
- 40 workers
- 600 ratings spread unevenly across workers, weighted toward 4 and 5
- 2 workers with deliberately mixed histories, so the profile page has something
  interesting to show
- 1 worker registered yesterday with 2 ratings, to demonstrate the new-account
  warning

Use fictional names. Never use a real person's data, not even your own.
