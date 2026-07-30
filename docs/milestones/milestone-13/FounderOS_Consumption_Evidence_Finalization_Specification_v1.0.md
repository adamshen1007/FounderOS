# FounderOS Consumption Evidence Finalization Specification v1.0

## Purpose

Define how Milestone 11 Consumption Evidence becomes complete after a governed Reasoning Invocation finishes.

## Finalized Consumption Evidence

The final record should bind:

- Contract version
- Consumption ID
- Delivery Receipt ID and fingerprint
- Invocation Request ID and fingerprint
- Invocation idempotency key
- Provider Capability ID and fingerprint
- Final Result Envelope ID and fingerprint
- Final outcome
- Attempt history summary
- Started-at evidence
- Completed-at evidence
- Usage Evidence fingerprint
- Cost Evidence fingerprint
- Failure, Timeout, or Cancellation Evidence fingerprint when applicable
- Durable ledger transaction reference
- Canonical Consumption Evidence fingerprint

## Finalization Rules

- Consumption cannot finalize before a terminal Result Envelope exists.
- Exactly one final Consumption Evidence record exists per finalized Invocation.
- Identical finalization replay is idempotent.
- Conflicting finalization fails.
- Finalization never modifies the Delivery Envelope or Receipt.
- Attempt history remains separately auditable.
- Finalized evidence must be append-only when persisted.

## Durable Binding

Milestone 13 should extend the existing durable governance boundary using a storage-independent execution-evidence port or a compatible versioned extension to the Milestone 12 ledger.

Do not expose arbitrary low-level record insertion.

## Principle

Consumption Evidence closes the governed chain from knowledge delivery to reasoning outcome.
