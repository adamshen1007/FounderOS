# FounderOS Milestone 09 Acceptance Criteria v1.0

## Contract Criteria

- [ ] Durable snapshot registry contracts are implemented.
- [ ] Lifecycle transition record contracts are implemented.
- [ ] Activation audit record contracts are implemented.
- [ ] Runtime schemas reject unknown or invalid fields.
- [ ] Storage-specific concepts do not leak into shared contracts.

## Durability Criteria

- [ ] Snapshot records survive process restart.
- [ ] Lifecycle and approval history survives restart.
- [ ] Active snapshot is recovered from committed records.
- [ ] Historical records are immutable.
- [ ] Equivalent repeated writes are idempotent.
- [ ] Conflicting identity reuse fails.

## Atomic Activation Criteria

- [ ] Approved snapshot activation commits atomically.
- [ ] Previous active snapshot becomes superseded atomically.
- [ ] Failed preconditions leave no committed partial state.
- [ ] Compare-and-swap active-snapshot protection is enforced.
- [ ] Replaying the same transaction is idempotent.
- [ ] Two active snapshots cannot be recovered.

## Integrity Criteria

- [ ] Canonical record fingerprints are verified.
- [ ] Audit-chain continuity is verified.
- [ ] Corrupted or missing records fail closed.
- [ ] Contradictory lifecycle or activation history is rejected.
- [ ] Derived indexes can be rebuilt from authoritative records.

## Adapter Criteria

- [ ] A minimal local file-backed adapter is implemented.
- [ ] Runtime data is isolated from canonical sources.
- [ ] Path traversal and symlink escape are rejected.
- [ ] Arbitrary repository file overwrite is prevented.
- [ ] Temporary or partial records are not treated as committed.

## Regression Criteria

- [ ] Milestone 04 migration tests remain green.
- [ ] Milestone 05 query tests remain green.
- [ ] Milestone 06 repository tests remain green.
- [ ] Milestone 07 corpus snapshot tests remain green.
- [ ] Milestone 08 lifecycle governance tests remain green.

## Non-Goals

Milestone 09 does not include:

- General-purpose application database infrastructure
- Distributed transactions
- Automatic synchronization
- Semantic retrieval or ranking
- Embeddings or vector databases
- Knowledge graph persistence
- Agents, Hermes, MCP, integrations, or UI

## Definition of Done

FounderOS can durably register governed snapshots, record lifecycle and activation evidence, restart, verify integrity, and recover exactly one valid active knowledge state.
