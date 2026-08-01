# FounderOS Milestone 14 Verification Checklist v1.0

## Repository Preconditions

- [ ] Milestone 13 is merged into `main`.
- [ ] `codex/milestone-14` is based on current `origin/main`.
- [ ] The worktree contains no unrelated changes.

## Contract Verification

- [ ] Adapter, Authorization, Credential, Transport, Mapping, Admission, Circuit, Observability, Health, and Readiness schemas validate strictly.
- [ ] Unknown fields and unsupported versions are rejected.
- [ ] Accessor-backed and noncanonical input is rejected.
- [ ] Canonical fingerprints independently recompute.
- [ ] Real credentials and provider-specific executable payloads are absent.

## Authorization and Credential Verification

- [ ] Only `Allowed` proceeds.
- [ ] Denied, review-required, not-evaluated, missing, invalid, and expired evidence fail.
- [ ] Raw credentials and secret-like values fail.
- [ ] Credential References contain no secret material.
- [ ] Authorization is checked before Credential and Transport planning.

## Transport Verification

- [ ] HTTPS and allowlisted hosts are enforced.
- [ ] Arbitrary URLs, redirects, private, loopback, link-local, metadata, and reserved targets are rejected.
- [ ] Unsafe TLS policy is rejected.
- [ ] Request, response, timeout, and retry limits verify.
- [ ] No socket, DNS lookup, or network request occurs.

## Mapping Verification

- [ ] Request Plan is deterministic and redacted.
- [ ] Response Mapping fixtures produce portable evidence.
- [ ] Mapping tampering is detected.
- [ ] Hidden context and provider-specific bypass payloads are rejected.

## Admission and Containment Verification

- [ ] Rate and Capacity limits are deterministic.
- [ ] Cost ceiling and pricing availability are enforced.
- [ ] Circuit state transitions verify.
- [ ] Disabled, Open, and Quarantined reject.
- [ ] Half-open probe policy is bounded.
- [ ] Health and Readiness state derives from verified evidence.

## Observability Verification

- [ ] Logs, Metrics, and Traces are redacted before emission.
- [ ] Credentials, Authorization headers, Context content, provider bodies, physical paths, and environment data are absent.
- [ ] Metric labels and trace attributes are bounded.
- [ ] Public errors use logical identifiers.

## Disabled Harness Verification

- [ ] Enabled-state configuration is impossible or rejected.
- [ ] Harness uses deterministic fixtures and explicit time.
- [ ] No network, credentials, environment, or randomness dependency exists.
- [ ] Readiness Decision never claims live-traffic readiness.
- [ ] Repeated valid evaluation is byte stable.

## Regression Verification

- [ ] All Milestone 04–13 tests remain green.
- [ ] New Milestone 14 tests pass.

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

Milestone 14 is `GO` only when all readiness controls are implemented and independently verifiable, every bypass attempt fails closed, and real provider execution remains structurally impossible.
