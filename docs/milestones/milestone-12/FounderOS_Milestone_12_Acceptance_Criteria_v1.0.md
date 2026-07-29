# FounderOS Milestone 12 Acceptance Criteria v1.0

## Contract Criteria

- [ ] Durable Delivery Ledger contracts are implemented.
- [ ] Durable Idempotency Registry contracts are implemented.
- [ ] Replay Attempt contracts are implemented.
- [ ] Durable Artifact Record contracts are implemented.
- [ ] Recovery and integrity result contracts are implemented.
- [ ] Unknown fields and unsupported versions are rejected.
- [ ] Contracts remain provider, model, agent, and storage independent.

## Atomic Delivery Criteria

- [ ] Request, Envelope, Acknowledgment, Receipt, and idempotency ownership commit atomically.
- [ ] Failure before commit leaves no committed delivery.
- [ ] Recovery after commit reconstructs the complete result.
- [ ] Partial staging files are ignored.
- [ ] Transaction replay is idempotent.
- [ ] Conflicting transaction identity reuse fails.

## Idempotency Criteria

- [ ] Idempotency ownership survives restart.
- [ ] Identical request replay returns the original result.
- [ ] Conflicting key reuse fails after restart.
- [ ] Single-delivery enforcement survives restart.
- [ ] Expiration behavior is explicit.
- [ ] Derived idempotency indexes rebuild from authoritative records.

## Replay Criteria

- [ ] Replay Attempts are durable and append-only.
- [ ] Replay returns the exact original Envelope and Receipt identity.
- [ ] Current Policy and Freshness evidence is recorded separately.
- [ ] Repeatable-until-expiration behavior survives restart.
- [ ] Evaluation-only replay is distinct.
- [ ] Contradictory replay history fails closed.

## Integrity Criteria

- [ ] Artifact fingerprints independently recompute.
- [ ] Durable record fingerprints independently recompute.
- [ ] Audit-chain continuity verifies.
- [ ] Missing transaction members fail closed.
- [ ] Envelope, Acknowledgment, and Receipt substitution is detected.
- [ ] Conflicting ownership is detected.
- [ ] Physical paths and credentials are not exposed.

## Adapter Criteria

- [ ] One replaceable local file-backed adapter is implemented.
- [ ] Runtime data is isolated and Git-ignored.
- [ ] Single-writer protection is explicit.
- [ ] Path traversal and symlink escape are rejected.
- [ ] Runtime/source overlap is rejected.
- [ ] Unsafe preflight fails before filesystem mutation.
- [ ] Temporary data is never treated as committed.

## Retention Criteria

- [ ] Authoritative history is append-only.
- [ ] Derived indexes are bounded and rebuildable.
- [ ] Expiration does not erase audit evidence.
- [ ] Idempotency-key reuse policy is explicit.
- [ ] No destructive authoritative compaction is introduced.

## Regression Criteria

- [ ] All Milestone 04–11 tests remain green.
- [ ] New Milestone 12 tests pass.
- [ ] Milestone 11 no-context-bypass guarantees remain mandatory.

## Non-Goals

Milestone 12 does not include LLM execution, provider clients, prompt execution, Agent or Hermes runtimes, authentication, authorization, MCP, external integrations, semantic retrieval, embeddings, vector databases, ranking, knowledge graphs, or UI.

## Definition of Done

FounderOS can persist, recover, and independently verify the original governed Delivery Result and every Replay Attempt while preserving idempotency and single-delivery rules across process restart.
