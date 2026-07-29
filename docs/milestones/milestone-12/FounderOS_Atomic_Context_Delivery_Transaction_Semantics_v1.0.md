# FounderOS Atomic Context Delivery Transaction Semantics v1.0

## Purpose

Define all-or-nothing persistence for the original governed Context Delivery result.

## Transaction Inputs

A first-delivery transaction requires:

- Verified Delivery Request
- Verified Context Package
- Verified Consumer Descriptor
- Verified Policy Decision Evidence
- Verified capability and freshness results
- Governed Delivery Envelope
- Consumer Acknowledgment
- Delivery Receipt
- Idempotency key
- Expected ledger state
- Explicit transaction timestamp evidence

## Atomic Effects

A successful transaction must commit together:

1. Delivery Request registration
2. Idempotency ownership
3. Delivery Envelope record
4. Acknowledgment record
5. Receipt record
6. Audit-chain advancement
7. Derived index eligibility

No partial subset may be visible as committed.

## Concurrency Rule

Use explicit single-writer protection and compare-and-swap semantics for the expected ledger head and idempotency-key ownership.

## Idempotency Rule

Replaying the same transaction ID and identical canonical payload returns the original committed transaction.

Reusing the transaction ID with different content fails.

## Crash Safety

- Failure before the authoritative commit point leaves no committed delivery.
- Recovery after the commit point reconstructs the complete original result.
- Partial staging files are ignored.
- No idempotency key may point to a missing Envelope or Receipt.

## Principle

A delivery exists only when its complete governed artifact set is durably committed.
