# FounderOS Context Delivery Ledger Recovery and Integrity Verification Specification v1.0

## Purpose

Define restart recovery and fail-closed integrity verification for durable Context Delivery evidence.

## Recovery Workflow

```text
Open Delivery Ledger
        |
        v
Load Committed Transactions
        |
        v
Verify Artifact Schemas and Fingerprints
        |
        v
Verify Audit-Chain Continuity
        |
        v
Reconstruct Idempotency Ownership
        |
        v
Reconstruct Original Delivery Results
        |
        v
Replay Attempt History
        |
        v
Validate Invariants
```

## Required Invariants

Recovery must verify:

- Delivery Request identities are unique.
- Idempotency ownership is unambiguous.
- Every committed transaction contains the complete required artifact set.
- Envelope, Acknowledgment, and Receipt bindings match.
- Artifact and record fingerprints recompute.
- Audit-chain links are continuous.
- Replay records reference an existing original transaction.
- Accepted replay returns the original result identity.
- Single-delivery policy has no second accepted delivery.
- Expiration and retention evidence is internally consistent.
- Derived indexes match authoritative history.

## Corruption Handling

Fail closed on:

- Missing transaction members
- Broken record fingerprints
- Broken audit-chain links
- Conflicting idempotency ownership
- Envelope or Receipt substitution
- Contradictory replay history
- Partial transactions presented as committed
- Invalid sequence ordering
- Physical-path or credential leakage in authoritative artifacts

Do not silently skip, repair, truncate, or rewrite authoritative records.

## Recovery Result

Return deterministic evidence including:

- Ledger status
- Original Delivery transaction count
- Replay Attempt count
- Active idempotency ownership count
- Expired ownership count
- Last committed ledger sequence
- Ledger integrity fingerprint
- Stable errors on failure

## Principle

Durable replay safety exists only when the original result and every later attempt can be independently reconstructed.
