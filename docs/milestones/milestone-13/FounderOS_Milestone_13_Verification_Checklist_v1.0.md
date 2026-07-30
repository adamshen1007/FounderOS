# FounderOS Milestone 13 Verification Checklist v1.0

## Repository Preconditions

- [ ] Milestone 12 is merged into `main`.
- [ ] `codex/milestone-13` is based on current `origin/main`.
- [ ] The worktree contains no unrelated changes.

## Contract Verification

- [ ] Invocation, Capability, Input, Policy, Result, Evidence, and Consumption schemas validate strictly.
- [ ] Unknown fields and unsupported versions are rejected.
- [ ] Accessor-backed and noncanonical inputs are rejected.
- [ ] Canonical fingerprints independently recompute.
- [ ] Provider-specific fields are absent from shared contracts.

## Delivery Binding Verification

- [ ] Durable Delivery transaction verifies.
- [ ] Delivery Envelope and Receipt verify.
- [ ] Context Package and Consumer bindings are preserved.
- [ ] Invocation cannot use raw knowledge, Query Results, or hidden context.
- [ ] Substitution and re-signed semantic changes fail.

## Capability and Policy Verification

- [ ] Contract versions match.
- [ ] Content types match.
- [ ] Input and output limits match.
- [ ] Timeout, retry, cancellation, and evidence support match.
- [ ] Stable mismatch reasons are deterministic.
- [ ] Execution does not begin after capability failure.

## Execution Verification

- [ ] Fake-provider success is deterministic.
- [ ] Fake-provider failure is deterministic.
- [ ] Timeout and cancellation are deterministic.
- [ ] No network, environment credential, random, or implicit wall-clock dependency exists.
- [ ] Output budgets are enforced.
- [ ] Malformed outcomes fail closed.

## Idempotency, Retry, and Attempt Verification

- [ ] Identical invocation returns the original finalized result.
- [ ] Conflicting key reuse fails.
- [ ] Retries create distinct ordered attempts.
- [ ] Attempt limits are enforced.
- [ ] Previous attempts remain immutable.
- [ ] Finalization is idempotent.

## Evidence Verification

- [ ] Execution Receipt verifies.
- [ ] Usage Evidence verifies.
- [ ] Cost Evidence verifies.
- [ ] Failure Evidence verifies.
- [ ] Timeout Evidence verifies.
- [ ] Cancellation Evidence verifies.
- [ ] Result Envelope verifies.
- [ ] Consumption Evidence verifies.
- [ ] Tampering and reordering are detected.
- [ ] Physical paths, credentials, and provider secrets are absent.

## Durability Verification

- [ ] Execution Evidence uses a governed storage-independent port.
- [ ] Append-only finalization records survive restart where implemented.
- [ ] Derived state is non-authoritative.
- [ ] Authoritative corruption fails closed.
- [ ] No arbitrary record-insertion API is exported.

## Regression Verification

- [ ] All Milestone 04–12 tests remain green.
- [ ] New Milestone 13 tests pass.

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

Milestone 13 is `GO` only when Reasoning Invocation, provider capability matching, fake-provider execution, attempt lifecycle, result evidence, durable Consumption Evidence finalization, and no-provider-bypass guarantees are deterministic, independently verifiable, and fully compatible with prior milestones.
