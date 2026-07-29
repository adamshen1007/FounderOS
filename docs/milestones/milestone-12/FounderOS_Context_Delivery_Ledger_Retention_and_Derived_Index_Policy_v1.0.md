# FounderOS Context Delivery Ledger Retention and Derived Index Policy v1.0

## Purpose

Define bounded operational state without erasing authoritative governance history.

## Authoritative History

The following remain append-only:

- Original Delivery transactions
- Envelope, Acknowledgment, and Receipt records
- Idempotency ownership records
- Replay Attempt records
- Expiration and retention evidence
- Audit-chain records

## Derived Indexes

Derived indexes may include:

- Active idempotency-key lookup
- Delivery Request lookup
- Original-result lookup
- Replay eligibility summary
- Expiration schedule

Derived indexes must be:

- Rebuildable
- Non-authoritative
- Integrity checked
- Replaceable
- Safe to discard and reconstruct

## Expiration

When an idempotency or replay policy expires:

- Append explicit expiration evidence if required.
- Remove the entry from active derived lookup only when policy permits.
- Preserve the original authoritative records.
- Prevent expired state from being misread as unused ownership when policy forbids key reuse.

## Reuse Policy

The specification must explicitly decide whether expired idempotency keys are permanently reserved or may be reused under a versioned policy. The safe default is permanent reservation.

## Compaction

Milestone 12 does not destructively compact authoritative history.

Future archival may move verified immutable segments while preserving chain identity.

## Principle

Operational indexes may be bounded; audit history must remain explainable.
