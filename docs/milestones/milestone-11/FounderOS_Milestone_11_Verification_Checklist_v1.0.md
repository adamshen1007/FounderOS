# FounderOS Milestone 11 Verification Checklist v1.0

## Repository Preconditions

- [ ] Milestone 10 is merged into `main`.
- [ ] The Milestone 11 branch is based on current `main`.
- [ ] The worktree contains no unrelated changes.

## Contract Verification

- [ ] Consumer, request, envelope, policy, receipt, and evidence schemas validate strictly.
- [ ] Unknown fields and unsupported versions are rejected.
- [ ] Provider-specific and model-specific fields are absent.
- [ ] Canonical fingerprints independently recompute.

## Integrity and Bypass Verification

- [ ] Unverified packages cannot be delivered.
- [ ] Tampered packages fail.
- [ ] Raw Knowledge Objects cannot bypass the Context Package.
- [ ] Full Query Results cannot be injected into delivery.
- [ ] Active Snapshot and Registry bindings are preserved.

## Capability Verification

- [ ] Supported versions match correctly.
- [ ] Object and character limits match correctly.
- [ ] Truncation acceptance is enforced.
- [ ] Empty-package acceptance is enforced.
- [ ] Receipt and replay requirements are enforced.
- [ ] Capability mismatch produces stable reason codes.

## Policy Verification

- [ ] Allowed, denied, review-required, and not-evaluated outcomes are distinct.
- [ ] Missing required evidence fails.
- [ ] Expired policy evidence fails.
- [ ] Authorization is not inferred.

## Freshness, Replay, and Idempotency Verification

- [ ] Valid freshness policy succeeds.
- [ ] Expired request fails.
- [ ] Superseded-snapshot behavior follows policy.
- [ ] Identical idempotent replay is stable.
- [ ] Conflicting idempotency reuse fails.
- [ ] Single-use replay is rejected.
- [ ] Deterministic time is injected rather than read implicitly.

## Delivery and Receipt Verification

- [ ] Envelope serialization is byte stable.
- [ ] Delivery fingerprint verifies.
- [ ] Receipt fingerprint verifies.
- [ ] Receipt preserves package, request, and consumer bindings.
- [ ] Tampering and reordering are detected.
- [ ] Physical paths and secrets are not exposed.

## Regression Verification

- [ ] All Milestone 04–10 tests remain green.
- [ ] New Milestone 11 tests pass.

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

Milestone 11 is `GO` only when the Context Consumer Boundary is deterministic, provider neutral, bypass resistant, policy explicit, freshness aware, replay governed, receipt bearing, and compatible with every prior milestone.
