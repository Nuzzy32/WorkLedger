# WorkLedger seed

Populates a deployed WorkLedger chain with a deterministic 600-rating demo
dataset — 3 platforms, 40 workers, 20 clients — and, when a database is
configured, mirrors the same data into Postgres. One command:

```bash
npm run seed
```

`npm run seed` derives 64 accounts from a mnemonic, registers the demo
platforms and workers, signs and submits every rating as an EIP-712
attestation, and checks every worker's on-chain score against an independently
computed expectation before it prints success. `jobId` is
`keccak256(seedTag:index)`, so the chain itself is the resume checkpoint: every
step below is idempotent, and running `npm run seed` again submits nothing new
and reports `ratings submitted 0, already present 600`.

## Local run needs no credentials

```bash
# terminal 1
anvil

# terminal 2
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast

cd ../seed
cp .env.example .env
npm run seed
```

The private key above is anvil's own well-known first test account, printed by
anvil on every startup — not a secret, and worthless off a local chain.
`.env.example`'s `MNEMONIC` is anvil's own public test mnemonic, the same one
every anvil instance derives its first ten funded accounts from. Nothing in a
local run touches a real key.

## Base Sepolia: the exact two-line change

Everything else in `.env` stays the same. Change only these two lines:

```
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
```

Then set `MNEMONIC` to a mnemonic that controls a funded Base Sepolia
deployer (index 0) — never the anvil default — and run the deploy script
against that RPC URL before running `npm run seed`. `loadConfig` accepts only
`31337` and `84532`; anything else, mainnet or not, is rejected.

## Re-running is safe

Every setup and submission step checks on-chain state before writing:
`ensurePlatforms` reads `platformIdOf`, `ensureWorkersRegistered` reads
`isRegistered`, `submitRatings` reads `ratingOf(jobId).worker`. Interrupting a
run and re-running `npm run seed` picks up exactly where it left off, and a
run against an already-seeded chain is a no-op on the rating data — it only
tops up gas balances that transaction fees have drawn down since the last
run, which costs no transactions on anvil (`anvil_setBalance` is a free RPC
call, not a transfer).

Changing `SEED_TAG` changes every generated `jobId`, so it inserts a second,
independent dataset alongside the first rather than resuming it.

## Postgres schema

`sql/001_schema.sql` has never been run against a live Postgres from this
machine — there is no local Postgres to test it against. Apply it to a
Supabase project **twice in a row**:

```bash
psql "$DATABASE_URL" -f sql/001_schema.sql
psql "$DATABASE_URL" -f sql/001_schema.sql
```

The first apply proves the syntax is valid. The second, run without touching
anything in between, proves every statement is idempotent — every `create
table` is `if not exists`, every policy is `drop policy if exists` before
`create policy`, and the column-grant block is a no-op the second time
because `revoke` and `grant` are both safe to repeat. If the second apply
errors, the schema is not actually idempotent and that is worth knowing before
it runs against production data.

## Verifying the contracts on Basescan

Needs a Basescan API key (`BASESCAN_API_KEY`) and the three addresses from
`contracts/deployments/base-sepolia.json`, written by the deploy script.
`WorkerRegistry` takes no constructor arguments; the other two do, and a wrong
encoding is the usual reason verification fails.

```bash
cd contracts
forge verify-contract <PLATFORM_REGISTRY> src/PlatformRegistry.sol:PlatformRegistry \
  --chain base-sepolia --etherscan-api-key "$BASESCAN_API_KEY" \
  --constructor-args $(cast abi-encode "constructor(address)" <OWNER>)

forge verify-contract <WORKER_REGISTRY> src/WorkerRegistry.sol:WorkerRegistry \
  --chain base-sepolia --etherscan-api-key "$BASESCAN_API_KEY"

forge verify-contract <RATING_REGISTRY> src/RatingRegistry.sol:RatingRegistry \
  --chain base-sepolia --etherscan-api-key "$BASESCAN_API_KEY" \
  --constructor-args $(cast abi-encode "constructor(address,address,uint256,uint32)" \
    <WORKER_REGISTRY> <PLATFORM_REGISTRY> 30000 5)
```

`<OWNER>` is the address that ran the deploy script (`msg.sender` in
`DeployScript.run`), which owns the platform allowlist.

## What has and hasn't been run

Executed and proven on this machine: a full local-anvil deploy plus seed
(`all 40 worker scores match the plan`), and a second seed run against the
same chain proving idempotency (`ratings submitted 0, already present 600`).

Documented but not executed: the Base Sepolia deploy, the `forge
verify-contract` calls above, and applying `sql/001_schema.sql` to Postgres.
None of the three can run on this machine — there is no funded Base Sepolia
key, no Basescan API key, and no local Postgres. They are the project owner's
step, with credentials this environment does not hold.
