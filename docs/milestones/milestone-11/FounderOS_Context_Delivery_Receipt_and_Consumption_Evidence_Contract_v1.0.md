# FounderOS Context Delivery Receipt and Consumption Evidence Contract v1.0

## Purpose

Define deterministic evidence that a governed Context Package was delivered to a declared consumer boundary.

## Delivery Receipt

A receipt should include:

- Contract version
- Receipt ID
- Delivery envelope ID and fingerprint
- Context Package ID and fingerprint
- Consumer ID and descriptor fingerprint
- Delivery status
- Delivery sequence
- Received-at evidence
- Idempotency key
- Replay classification
- Consumer acknowledgment fingerprint
- Canonical receipt fingerprint

## Delivery Status

Initial statuses may include:

- Accepted
- Rejected
- Expired
- Duplicate
- Policy denied
- Capability mismatch
- Integrity failure

## Consumption Evidence Placeholder

Milestone 11 may define, but not execute, a future consumption evidence record containing:

- Consumption ID
- Receipt ID
- Consumer operation reference
- Started-at evidence
- Completed-at evidence
- Result evidence reference
- Failure reason
- Canonical fingerprint

No model output or reasoning result is generated in this milestone.

## Principle

Delivery and consumption must be observable as separate governed events.
