# FounderOS Milestone 12 Verification Checklist v1.0

## Repository Preconditions

- [ ] Milestone 11 is merged into `main`.
- [ ] `codex/milestone-12` is based on current `origin/main`.
- [ ] The worktree contains no unrelated changes.

## Contract Verification

- [ ] Ledger, ownership, artifact, transaction, replay, recovery, and integrity contracts validate strictly.
- [ ] Unknown fields and unsupported versions are rejected.
- [ ] Canonical fingerprints recompute.
- [ ] Storage and provider details do not leak into shared contracts.

## Atomicity Verification

- [ ] Complete original delivery commits atomically.
- [ ] Pre-commit crash leaves no committed result.
- [ ] Post-commit recovery yields the complete original result.
- [ ] Partial transaction members cannot appear as committed.
- [ ] Identical transaction replay is stable.
- [ ] Conflicting transaction reuse fails.

## Idempotency Verification

- [ ] Ownership survives restart.
- [ ] Identical retry resolves to the original result.
- [ ] Conflicting key reuse fails.
- [ ] Single-delivery rejection survives restart.
- [ ] Repeatable replay survives restart.
- [ ] Expired behavior follows policy.
- [ ] Derived lookup rebuilds deterministically.

## Replay Verification

- [ ] Every Replay Attempt has separate evidence.
- [ ] Current validation evidence binds to the original result.
- [ ] Original Envelope and Receipt remain immutable.
- [ ] Replay ordering is explicit.
- [ ] Contradictory accepted replay fails.
- [ ] Evaluation-only replay is distinct.

## Integrity Verification

- [ ] Artifact tampering is detected.
- [ ] Record tampering is detected.
- [ ] Broken audit links are detected.
- [ ] Missing Envelope or Receipt fails.
- [ ] Substitution attacks fail.
- [ ] Conflicting ownership fails.
- [ ] Derived index corruption is detected and rebuildable.
- [ ] Authoritative corruption is never silently repaired.

## Filesystem Safety Verification

- [ ] Runtime root is explicit and Git-ignored.
- [ ] Canonical source trees remain immutable.
- [ ] Traversal and symlink escape are rejected.
- [ ] Runtime/source overlap in either direction is rejected.
- [ ] Nested unsafe entries are rejected before mutation.
- [ ] Resource-limit breaches fail before mutation.
- [ ] Public errors do not expose physical paths or credentials.
- [ ] Temporary and staging data is ignored during recovery.

## Regression Verification

- [ ] All Milestone 04–11 tests remain green.
- [ ] New Milestone 12 tests pass.

## Required Commands

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
git diff --check
```

## Approval Rule

Milestone 12 is `GO` only when durable Delivery, Idempotency, Replay, Recovery, Integrity, and filesystem-safety guarantees survive restart and all prior governance boundaries remain intact.
