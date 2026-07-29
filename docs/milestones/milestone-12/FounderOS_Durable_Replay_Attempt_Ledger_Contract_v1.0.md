# FounderOS Durable Replay Attempt Ledger Contract v1.0

## Purpose

Define append-only evidence for every governed replay attempt.

## Replay Attempt Record

Each record should include:

- Contract version
- Replay Attempt ID
- Original Delivery transaction ID
- Idempotency key
- Canonical replay request fingerprint
- Original Envelope ID and fingerprint
- Original Receipt ID and fingerprint
- Current Policy Decision Evidence fingerprint
- Current Freshness evaluation fingerprint
- Current Active Snapshot evidence
- Replay mode
- Replay classification
- Outcome
- Stable reason codes
- Attempt timestamp evidence
- Attempt sequence
- Previous audit fingerprint
- Canonical replay-attempt fingerprint

## Outcomes

Initial outcomes may include:

- Accepted original-result replay
- Rejected single-delivery replay
- Rejected expired replay
- Rejected policy replay
- Rejected freshness replay
- Rejected conflicting idempotency reuse
- Evaluation-only replay
- Integrity failure

## Rules

- Replay records are immutable and append-only.
- A replay record never modifies the original Envelope or Receipt.
- Accepted replay returns the exact original canonical result.
- Current validation evidence is recorded separately.
- Stable ordering must use explicit sequence rather than timestamps alone.

## Principle

Replay is a new governed event that references, but never rewrites, the original delivery.
