# FounderOS Governed Context Consumer Evaluation Framework v1.0

## Purpose

Define deterministic evaluation fixtures for the governed Context Consumer Boundary.

## Evaluation Dimensions

### Integrity

- Package fingerprints verify.
- Delivery fingerprints verify.
- Tampering fails closed.

### Compatibility

- Compatible consumer capabilities are accepted.
- Incompatible package size, contract version, truncation policy, or receipt requirements are rejected.

### Policy

- Allowed evidence permits delivery.
- Denied, review-required, expired, and not-evaluated evidence follows explicit policy.
- Missing policy evidence fails when required.

### Freshness

- Valid packages deliver within policy.
- Expired packages fail.
- Superseded-snapshot delivery follows declared replay policy.

### Idempotency and Replay

- Identical replay returns the same governed result.
- Conflicting idempotency reuse fails.
- Single-use delivery cannot be consumed twice.

### Evidence

- Every accepted or rejected request produces deterministic reason codes.
- Receipts preserve all package and consumer bindings.
- Physical paths and provider-specific secrets are never exposed.

## Required Fixtures

- Valid service consumer
- Valid future reasoning consumer
- Capability mismatch
- Unsupported Context Package version
- Truncated content not accepted
- Empty package not accepted
- Policy allowed
- Policy denied
- Policy review required
- Policy not evaluated
- Expired request
- New active snapshot invalidates delivery
- Historical replay allowed
- Identical idempotent replay
- Conflicting idempotency reuse
- Single-use replay rejection
- Package tampering
- Consumer descriptor tampering
- Delivery envelope tampering
- Receipt tampering
- Candidate attempt to bypass Context Package
- Physical path privacy

## Principle

The consumer boundary must be measurable before any model or agent is invoked.
