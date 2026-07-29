# FounderOS Durable Context Delivery Ledger Contract v1.0

## Purpose

Define the storage-independent contract for durable governed Context Delivery evidence.

## Ledger Responsibilities

The ledger must support:

- Registering immutable Delivery Requests
- Reading a Request by ID
- Resolving an idempotency key
- Reading the original committed Delivery Result
- Reading Envelope, Acknowledgment, and Receipt records
- Appending Replay Attempt records
- Listing records deterministically
- Recovering replay eligibility
- Verifying complete ledger integrity

## Authoritative Record Categories

1. Delivery Request registration
2. Idempotency ownership record
3. Delivery transaction record
4. Delivery Envelope record
5. Acknowledgment record
6. Receipt record
7. Replay Attempt record
8. Retention or expiration evidence
9. Audit-chain checkpoint record

## Contract Expectations

The ledger must:

- Reject conflicting record identity reuse
- Treat identical replay of authoritative records as idempotent
- Preserve exact canonical Milestone 11 artifacts
- Return immutable values or defensive copies
- Use explicit deterministic ordering
- Fail closed on missing, corrupt, or contradictory evidence
- Avoid storage-specific concepts in shared contracts

## Principle

The ledger persists governed delivery evidence; it does not execute reasoning or decide authorization.
