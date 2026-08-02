# FounderOS Readiness Replay Verification Registry Contract v1.0

## Status

**Specified — not implemented**

## Purpose

Define durable, append-only evidence that a fresh approved evaluator did or did not reconstruct an original Milestone 14 readiness evaluation after restart.

## Replay Authority

Replay is a verification operation, not a renewal or execution operation. The immutable original transaction remains the sole recorded registration artifact. A replay attempt never modifies it and never grants provider-execution authority.

## Replay Request

The replay request contains:

- replay request contract version;
- globally unique replay request ID;
- replay idempotency key;
- requested globally unique replay attempt ID;
- requested globally unique replay semantic-event ID;
- requested globally unique replay audit-entry ID;
- requested globally unique replay marker ID;
- original transaction ID and expected fingerprint;
- fresh evaluator configuration projection;
- exact authoritative readiness-input fingerprint and supplied input;
- exact governed Delivery Ledger interface for verification, never persistence;
- immutable original-transaction `originalEvaluationTime` binding;
- explicit current `replayEvaluatedAt`;
- expected ledger-head fingerprint;
- replay request fingerprint.

## Replay Workflow

1. Capture the request and reject unsafe or prohibited capabilities.
2. Recover and verify the readiness ledger, replay identity ownership, and marker archive/current-marker consistency.
3. If every caller-owned replay identity coordinate and the complete canonical request fingerprint exactly match one committed replay submission, verify the original attempt and its activating marker and return `idempotent-replay-returned` without reconstruction, append, ownership refresh, or head advancement. The request's original expected-head coordinate must match the owned request but need not equal the later current head.
4. Otherwise, reject any owned-coordinate reuse and read and independently verify the original transaction.
5. Capture the newly supplied Delivery Ledger and fresh approved evaluator configuration.
6. Always attempt historical reconstruction at immutable `originalEvaluationTime`: recover and verify supplied Delivery authority, resolve exact Milestone 13 authority, require the stored configuration projection, evaluate the exact original canonical input, and verify the new Decision and retention evidence through that fresh evaluator instance.
7. Compare the complete reconstructed package with the immutable original when reconstruction verifies.
8. Independently assess the original Authorization evidence at `replayEvaluatedAt`; never alter or replace its `decidedAt`, `expiresAt`, or authority.
9. Construct one replay attempt containing both assessments.
10. Append the attempt and audit evidence only when the readiness ledger and append preconditions remain safe.
11. Return `recorded` only after the replay marker commits; otherwise return `not-recorded` with no replay attempt.
12. Stop before credential resolution or transport.

## Replay Attempt Record

Each record contains:

- replay contract version;
- replay idempotency key, replay request ID/fingerprint, and replay attempt ID;
- original transaction ID and fingerprint;
- original Decision ID and fingerprint;
- stored and supplied evaluator configuration projection fingerprints;
- stored and supplied Delivery/Invocation projection fingerprints;
- authoritative readiness-input fingerprint;
- `originalEvaluationTime` and `replayEvaluatedAt`;
- fresh evaluation-package fingerprint when one verifies;
- historical comparison evidence and fingerprint;
- current admissibility evidence and fingerprint;
- historical reconstruction status;
- current admissibility status;
- stable ordered reason codes;
- canonical replay-attempt fingerprint.

The replay-attempt fingerprint covers semantic attempt evidence only and excludes all later audit, history, head, marker, and index fields. Its exact domain and computation order are defined by the sole normative commitment-domain table in `FounderOS_Durable_Readiness_Evaluation_Transaction_Contract_v1.0.md` (`M15-COMMIT-001`).

## Historical Reconstruction Status (`M15-REPLAY-002`)

### `matched`

The fresh evaluator issues and verifies a complete canonical package at `originalEvaluationTime`, and its canonical bytes exactly equal the stored original.

### `mismatched`

Both original and fresh packages verify independently, but their canonical bytes differ. Comparison evidence identifies stable differing field paths without exposing secret or raw context values.

### `verification-failed`

Historical reconstruction cannot produce a fully verified package because supplied governed authority, configuration, evaluation, Decision verification, or retention evidence fails. Current Authorization expiration alone is not a historical reconstruction failure.

### `not-assessed`

The operation cannot safely reach historical reconstruction, for example because replay input is invalid, the readiness ledger is corrupt, or the original transaction is absent. This status is returned only in a `not-recorded` operation result and is not appended.

## Current Admissibility Status (`M15-REPLAY-002`)

The strict statuses are:

- `admissible`;
- `authorization-expired`;
- `authorization-denied`;
- `authorization-review-required`;
- `authorization-not-evaluated`;
- `authorization-invalid-evidence`;
- `authority-mismatch`;
- `not-assessed`.

Current admissibility uses only the original Authorization evidence at `replayEvaluatedAt`. It does not affect whether historical reconstruction is attempted. In particular, `historicalReconstructionStatus = matched` with `currentAdmissibilityStatus = authorization-expired` is a valid recordable result.

## Replay Append and Operation Results (`M15-REPLAY-002`)

Replay append status is exactly `appended` or `not-appended` and exists only in the ephemeral public operation result; it is not a field of `ReadinessReplayAttemptUnsignedV1` and cannot be circularly predicted before marker commit. The public submission result is:

- `recorded`: contains the immutable marker-committed replay attempt and `replayAppendStatus = appended`;
- `not-recorded`: contains no replay attempt, has `replayAppendStatus = not-appended`, and contains exactly one stable operation reason.
- `idempotent-replay-returned`: contains the exact previously committed replay attempt, has `replayAppendStatus = not-appended`, performs no authoritative mutation, and is available only through the exact-retry rule in `M15-REPLAY-003`.

The complete submission-result envelope and append status are ephemeral, non-authoritative, non-fingerprinted, and non-persisted under the sole Evidence Durability Inventory in the privacy policy. A `recorded` or `idempotent-replay-returned` result may return the one authoritative attempt already governed by its marker, but the result envelope never creates or permits a second durable copy.

Stable `not-recorded` reasons include:

- `invalid-replay-input`;
- `readiness-ledger-integrity-failure`;
- `original-transaction-not-found`;
- `stale-expected-head`;
- `concurrent-writer-conflict`;
- `lock-unavailable`;
- `operator-cleanup-required`;
- `append-conflict`;
- `replay-identity-conflict`;
- `replay-idempotency-key-conflict`;
- `replay-request-id-conflict`;
- `replay-attempt-id-conflict`;
- `replay-semantic-event-id-conflict`;
- `replay-audit-entry-id-conflict`;
- `replay-marker-id-conflict`;
- `append-failure`;
- `unsafe-filesystem-state`.

When the readiness ledger, original transaction, canonical request, and append preconditions verify, evaluator configuration mismatch, Delivery or Invocation authority mismatch, package mismatch, and all current Authorization denial states are recordable replay evidence. An append failure never reports `appended` or `recorded`.

A readiness-ledger integrity failure prevents appending a replay attempt because the ledger cannot safely commit new evidence.

## Authorization Time Rules

- Historical reconstruction always uses immutable `originalEvaluationTime`, exactly equal to the original Milestone 14 `evaluatedAt`.
- Current admissibility uses explicit `replayEvaluatedAt`.
- Stored `originalEvaluationTime`, Authorization `decidedAt`, authority, and expiration evidence remain immutable.
- Replay never refreshes, extends, or substitutes Authorization validity.
- Expired Authorization produces current status `authorization-expired` and never blocks historical reconstruction.
- Replay time is attempt evidence only and is never substituted into the historical package.
- A later valid external Authorization decision would be a different canonical readiness input and cannot rewrite the original transaction.

## Comparison Rules

Comparison covers the complete canonical evaluation package, including:

- Decision and ordered reason codes;
- exact ordered gate trace;
- complete retained non-secret evidence;
- observability retention fingerprint;
- Delivery and Invocation identity projection;
- evaluator configuration projection;
- all nested fingerprints.

Missing members, reordered gates, altered retention evidence, coherent re-signing under substituted authority, or different canonical bytes cannot be treated as a match.

## Registry Rules

- Replay attempts are immutable and append-only.
- Unsafe, credential-bearing, accessor-backed, or otherwise prohibited public input is rejected before evaluation or append and does not become replay evidence.
- The first marker-committed replay submission globally and permanently owns its replay idempotency key, replay request ID/fingerprint, replay attempt ID, replay semantic event ID, replay audit entry ID, and replay marker ID (`M15-IDEM-002`). The same key with different canonical request bytes returns `replay-idempotency-key-conflict`; the same request under a different key is not an exact retry and returns the coordinate-specific request conflict.
- Every attempt references one existing original transaction.
- Attempt ordering uses ledger sequence, not timestamps.
- An exact replay-submission retry (`M15-REPLAY-003`) returns the original replay attempt only when the replay idempotency key; replay request, attempt, semantic-event, audit-entry, and marker IDs; and complete replay-request fingerprint all match permanent history. It first verifies the current ledger and original attempt/activating marker. Its stored expected-head coordinate must match the owned request but is exempt from equality with the later current head. It performs no historical reconstruction, current-admissibility reassessment, append, ownership refresh, or head advancement. Conflicting reuse returns the coordinate-specific stable conflict reason listed above; a content or append ownership collision not reducible to one ID returns `replay-identity-conflict` or `append-conflict` respectively.
- Multiple distinct attempts may record different outcomes over time without changing the original.
- Derived per-transaction replay indexes are non-authoritative and rebuildable.

## Privacy

Replay evidence contains logical IDs, fingerprints, statuses, bounded reason codes, and redacted field paths only. It excludes raw Context, credentials, Authorization headers, provider bodies, endpoints, physical paths, clients, callbacks, and executable values.

## Principle

Fresh-evaluator replay proves reproducibility or records its failure. It never converts dry-run readiness into permission for live traffic.
