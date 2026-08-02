# FounderOS Readiness Evaluation Registration and Idempotency Contract v1.0

## Status

**Specified — not implemented**

## Purpose

Define the governed registration workflow and permanent ownership rules for durable production-provider readiness evaluations.

## Registration Preconditions

Before any mutation, the application boundary must:

1. Capture the complete request as exact plain own data without invoking accessors.
2. Reject hidden fields, symbols, custom prototypes, executable values, credentials, endpoints, and low-level ledger capabilities.
3. Recover the readiness ledger and verify authoritative integrity.
4. Resolve existing ownership coordinates from authoritative history, but do not return through a lookup-only shortcut.
5. Recover and verify the supplied Milestone 12 Delivery Ledger.
6. Resolve the exact current Milestone 13 Delivery and Invocation authority.
7. Reconstruct and verify the evaluator configuration projection.
8. Evaluate the canonical Milestone 14 input with the approved configured evaluator exactly once.
9. Verify the Decision with that same evaluator and its exact retention evidence.
10. Reconstruct the canonical registration request and evaluation package and require exact equality with any permanent ownership and original transaction already found.
11. Require byte-equivalent canonical package equality when the caller supplies an expected package.
12. Verify the expected readiness-ledger head for a first claim; for an exact owned retry, verify the original expected-head coordinate embedded in the owned request without requiring it to equal the later current head.

No idempotency ownership or filesystem mutation may occur before these checks pass.

## Registration Request Identity

The canonical registration request fingerprint binds:

- request contract version and request ID;
- proposed transaction ID;
- idempotency key;
- complete Delivery and Invocation identity projection;
- evaluator configuration projection;
- canonical readiness-input fingerprint;
- optional complete expected evaluation package and its fingerprint, when supplied;
- submitted-at evidence;
- expected ledger-head fingerprint.

## Idempotency Ownership Record

The durable ownership record contains (`M15-IDEM-001`):

- ownership contract version;
- globally unique ownership ID;
- idempotency key;
- registration request ID and fingerprint;
- transaction ID;
- Readiness Decision ID and fingerprint;
- canonical evaluation-package fingerprint;
- Delivery transaction ID and fingerprint;
- Invocation Request ID and fingerprint;
- Adapter ID and fingerprint;
- evaluator configuration projection fingerprint;
- durable authority projection fingerprint;
- ownership ledger sequence;
- ownership creation timestamp;
- canonical ownership fingerprint.

The ownership fingerprint covers only this semantic ownership payload. The enclosing registration event binds ownership and transaction fingerprints to the audit sequence and heads, avoiding circular fingerprints.

## Ownership Rules

- The first valid registration atomically and permanently owns an unused idempotency key, registration request ID, requested transaction ID, and Readiness Decision ID.
- Identical registration retry is not a lookup-only shortcut. It performs readiness-ledger verification, current governed authority resolution, approved evaluation, same-instance Decision verification, and canonical request/package reconstruction exactly once before returning the exact original committed transaction.
- Identical replay does not append a duplicate transaction or refresh ownership ordering.
- Exact replay compares the original canonical request bytes, including the original submitted-at and expected-head evidence; an already-owned exact request returns the original even if later replay events advanced the current ledger head.
- Exact return requires the same key, request ID/fingerprint, requested transaction ID, Decision ID/fingerprint, authority projection, evaluator configuration projection, and complete evaluation package.
- The same Decision ID under a different key or request ID is a conflict even when bytes are otherwise identical.
- The same transaction ID under a different key or request is a conflict.
- The same request ID under a different key is a conflict.
- The same key with a different request fingerprint is a conflict.
- No second original transaction may exist for one Readiness Decision ID.
- A partial ownership record without its marker-bounded transaction is authoritative corruption.
- A transaction without its required ownership is authoritative corruption.
- Expiration of Authorization or readiness evidence never frees an idempotency key.
- Derived lookup eviction or deletion never frees authoritative ownership.

## Canonical Package Rule

The configured evaluator is the only source of registration-time package authority. A caller may supply an expected package solely for equality checking. Missing, extra, reordered, or substituted package members fail before ownership.

## Atomic Claim and Commit

Ownership and the complete registration transaction commit as one marker-bounded event. There must be no committed state in which only one exists.

The operation must use:

1. a cooperative writer lock;
2. expected-head compare-and-swap;
3. revalidation of existing IDs and ownership under the lock;
4. one complete staged event envelope;
5. canonical serialization and fingerprinting;
6. atomic installation and synchronization;
7. atomic commit-head replacement as the commit point.

## Registration Outcomes

The application result is one of:

- `committed` with the immutable original transaction;
- `idempotent-original-returned` with the exact previously committed transaction after the mandated resolver and evaluator checks;
- `rejected` with stable, redacted reason codes;
- `integrity-failed` with stable, redacted failure evidence.

Rejected and integrity-failed results commit no registration record.

## Required Conflict Detection

Fail closed on:

- `idempotency-key-conflict`;
- `ownership-id-conflict`;
- `registration-request-id-conflict`;
- `transaction-id-conflict`;
- `decision-id-conflict`;
- stale expected head;
- concurrent writer state change;
- mismatched Delivery or Invocation identity;
- evaluator configuration mismatch;
- stale or forged fingerprint;
- coherent re-signing under substituted authority;
- altered gate order or retention evidence;
- missing transaction component;
- prohibited material or unsafe input shape.

## Ordering

Ledger sequence, not timestamp, defines ownership order. Timestamps must be explicit canonical UTC evidence and may not be used as implicit clocks.

## Principle

Idempotency is permanent durable governance evidence. It is neither a process-local cache nor a renewable execution lease.
