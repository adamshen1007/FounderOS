# FounderOS Durable Context Delivery Evaluation Framework v1.0

## Purpose

Define deterministic scenarios for durable Delivery, Replay, Idempotency, Recovery, and Integrity behavior.

## Evaluation Dimensions

### Atomicity

- Complete first delivery commits.
- Pre-commit failure leaves no delivery.
- Post-commit recovery returns the complete result.

### Idempotency

- Identical retry resolves to the original result.
- Conflicting key reuse fails.
- Ownership survives restart.

### Replay

- Single-delivery rejection survives restart.
- Repeatable replay returns original artifacts.
- Expiring replay revalidates current evidence.
- Replay Attempts are recorded separately.

### Integrity

- Artifact tampering fails.
- Audit-chain tampering fails.
- Missing transaction members fail.
- Contradictory replay history fails.

### Recovery

- Derived indexes rebuild.
- Original result identity remains byte stable.
- Expired state remains auditable.
- Recovery is independent of directory enumeration order.

## Required Fixtures

- First successful delivery
- Restart and original-result lookup
- Identical retry after restart
- Conflicting key reuse after restart
- Single-delivery retry after restart
- Repeatable replay after restart
- Replay until expiration
- Expired replay rejection
- Evaluation-only replay
- Pre-commit crash
- Post-commit crash
- Abandoned staging data
- Missing Envelope
- Missing Receipt
- Receipt substitution
- Broken artifact fingerprint
- Broken audit-chain link
- Conflicting ownership
- Contradictory accepted replay
- Derived index missing
- Derived index corrupted
- Deterministic rebuild
- Path traversal
- Symlink escape
- Runtime/source overlap
- Resource-limit preflight
- Physical-path privacy
- Credential privacy

## Principle

Durable delivery governance must be proven under restart and corruption, not only during one process lifetime.
