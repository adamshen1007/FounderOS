# FounderOS Milestone 09 Verification Checklist v1.0

## Repository Preconditions

- [ ] Milestone 08 is merged into `main`.
- [ ] The Milestone 09 branch is based on current `main`.
- [ ] The worktree contains no unrelated changes.

## Contract Verification

- [ ] Registry, transition, decision, and activation records validate strictly.
- [ ] Unknown fields are rejected.
- [ ] Canonical serialization is stable.
- [ ] Storage details do not leak into shared contracts.

## Durability Verification

- [ ] Registered snapshots survive adapter restart.
- [ ] Lifecycle history survives restart.
- [ ] Approval and rejection decisions survive restart.
- [ ] Activation history survives restart.
- [ ] Recovered active snapshot matches committed transaction history.

## Atomicity Verification

- [ ] Activation commits all required effects together.
- [ ] Precondition failure commits nothing.
- [ ] Crash simulation before commit recovers the old active state.
- [ ] Crash simulation after commit recovers the new active state.
- [ ] Replayed identical transaction is idempotent.
- [ ] Conflicting transaction-ID reuse fails.
- [ ] Concurrent stale activation attempt fails compare-and-swap validation.

## Integrity Verification

- [ ] Record fingerprint tampering is detected.
- [ ] Broken audit-chain links are detected.
- [ ] Missing referenced evidence is detected.
- [ ] Contradictory activation records are rejected.
- [ ] More than one active state cannot be recovered.
- [ ] Derived index corruption can be repaired by rebuild.
- [ ] Authoritative record corruption fails closed.

## Filesystem Safety Verification

- [ ] Runtime root is explicit and Git-ignored.
- [ ] Canonical docs and knowledge sources remain unchanged.
- [ ] Traversal outside runtime root is rejected.
- [ ] Symlink escape is rejected.
- [ ] Arbitrary file overwrite is prevented.
- [ ] Temporary files are not interpreted as committed records.

## Regression Verification

- [ ] All Milestone 04–08 tests remain green.
- [ ] New Milestone 09 tests pass.

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

Milestone 09 is `GO` only when durability, atomicity, integrity, safety, and all prior milestone regressions pass.
