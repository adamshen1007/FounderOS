# FounderOS Durable Readiness Evaluation Ledger Contract v1.0

## Status

**Specified — not implemented**

## Purpose

Define the storage-independent application contract for immutable readiness evaluation registrations, permanent idempotency ownership, and append-only replay verification evidence.

## Ledger Responsibilities

The governed ledger must support capabilities equivalent to:

- `verifyIntegrity()`;
- `recover()`;
- `registerVerifiedReadinessEvaluation(...)`;
- `readOriginalReadinessEvaluation(transactionId)`;
- `listCommittedReadinessEvaluations()`;
- `submitReadinessReplayAttempt(...)`;
- `listReadinessReplayAttempts(transactionId)`;
- `readHead()`;
- `verifyDerivedIndexes()`;
- `rebuildDerivedIndexes()`.

The exact interface names may change during implementation. The authority separation may not.

## Authoritative Record Categories

1. Registration request record
2. Permanent idempotency ownership record
3. Committed readiness evaluation transaction
4. Registration audit entry
5. Replay attempt record
6. Replay audit entry
7. Immutable event-local commit-marker archives and the fixed current marker

All authoritative event records, including archived per-event marker values, are immutable and marker bounded. The fixed current-marker file is the single intentional replacement point: its verified atomic replacement activates the byte-identical archived marker value and is the sole authoritative visibility boundary (`M15-TXN-001`, `M15-TXN-002`).

## Ledger Head

The canonical ledger head contains:

- head contract version;
- committed registration count;
- committed replay-attempt count;
- total authoritative event count;
- last committed ledger sequence;
- last audit-entry fingerprint;
- last committed event ID and fingerprint;
- complete-history fingerprint;
- head generation or coordinate;
- `ledgerHeadFingerprint`.

An empty ledger has an explicit versioned genesis head rather than an absent or inferred head.

Any separately stored `HEAD` file is a non-authoritative cache of this projection and is rebuildable from verified markers.

## Audit Entry

Every registration or replay event has one audit entry containing:

- audit contract version;
- ledger sequence;
- event category;
- globally unique audit-entry ID;
- semantic event ID and fingerprint;
- subject transaction ID and fingerprint;
- explicit recorded-at timestamp;
- previous ledger-head fingerprint;
- `auditEntryFingerprint`.

Registration and replay events share one monotonically increasing sequence.

The audit entry binds the previous ledger head, not the resulting head. Complete history and the resulting ledger head are computed after the audit-entry fingerprint. Exact fields and ordering are governed solely by `M15-COMMIT-001` in the Durable Readiness Evaluation Transaction Contract.

## Commit Marker

The commit marker uses exactly the `ReadinessCommitMarkerUnsignedV1` field set, category discriminator, exclusions, dependencies, and fingerprint field in the sole `M15-COMMIT-001` table. No summary in another document adds, removes, or renames a marker field.

The canonical marker value is computed last. Its immutable event-local archive preserves marker history and global marker-ID ownership. Commit occurs only when byte-identical canonical marker bytes are atomically installed at the fixed current-marker location. Installed components or an archived marker without that fixed current-marker activation are crash orphans, not committed history. Missing derived `HEAD` or index state after activation does not roll back the commit.

## Read Semantics

- Reads operate only on recovered and verified marker-bounded history.
- Lists use explicit ledger sequence and deterministic tie-free ordering.
- Returned values are deeply immutable or defensive copies.
- Missing IDs return a stable absent result; corrupt state returns an integrity failure.
- Derived indexes may locate candidates but never establish authority.

## Write Semantics

- Every write requires a clean recovery and integrity result.
- Every write uses expected-head compare-and-swap under the writer lock.
- Registration writes one complete transaction, ownership, and audit event atomically.
- Replay writes one complete replay attempt and audit event atomically.
- Identical registration retry performs the mandated resolver/evaluator checks exactly once and returns the original without a new event or head advancement.
- Every distinct replay submission is a new explicitly identified audit event. An exact replay-submission retry is the sole exception: after verifying the current ledger, the permanent replay ownership tuple, the original attempt, and its activating marker, it returns that original attempt without append or head advancement (`M15-REPLAY-003`).
- No operation may mutate an original transaction or earlier replay attempt.

## Integrity Expectations

The ledger must detect:

- broken sequence or audit-chain continuity;
- missing marker-bounded events;
- extra ambiguous installed records;
- record, transaction, request, package, ownership, or marker fingerprint failure;
- duplicate or conflicting globally owned idempotency, registration-request, transaction, Decision, replay-request, replay-attempt, semantic-event, audit-entry, or marker IDs;
- mismatched Delivery, Invocation, configuration, gate, retention, or package bindings;
- replay references to missing original transactions;
- authoritative records containing prohibited material;
- derived indexes that disagree with authoritative replay.

## Derived Index Model

Permitted indexes include transaction ID, registration request ID, idempotency key, Decision ID, Invocation ID, Adapter ID, and per-transaction replay sequence.

Each derived index snapshot contains:

- index contract version and kind;
- source ledger-head fingerprint;
- deterministic ordered entries;
- entry count;
- generated-at evidence where operationally needed but excluded from semantic content identity;
- ordered derived-entry fingerprints;
- `derivedIndexFingerprint`.

Every entry has `derivedIndexEntryFingerprint` over canonical lookup coordinates plus authoritative transaction and marker fingerprints. Indexes are non-authoritative. A corrupt or missing index is reported, discarded, and explicitly rebuildable only from verified history.

## Storage Independence

Shared ledger contracts must not expose filesystem paths, SQL concepts, provider SDKs, credentials, network clients, locks, file descriptors, or adapter-specific commit mechanics.

## Principle

The ledger preserves readiness evaluation evidence and replay history. It does not execute reasoning, decide authorization, resolve credentials, or send provider traffic.
