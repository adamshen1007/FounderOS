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

1. Canonical genesis complete-history commitment, genesis head, genesis marker archive, and fixed current marker
2. Registration request record
3. Permanent idempotency ownership record
4. Committed readiness evaluation transaction
5. Registration audit entry
6. Replay attempt record
7. Replay audit entry
8. Immutable event-local commit-marker archives and the fixed current marker

All authoritative event records, including archived per-event marker values, are immutable and marker bounded. The fixed current-marker file is the single intentional replacement point: its verified atomic replacement activates the byte-identical archived marker value and is the sole authoritative visibility boundary (`M15-TXN-001`, `M15-TXN-002`).

## Ledger Head

The canonical ledger head is exactly the signed `ReadinessLedgerHeadUnsignedV1` field set from `M15-COMMIT-001` plus `ledgerHeadFingerprint`:

- `headContractVersion`;
- `headGeneration`;
- `committedRegistrationCount`;
- `committedReplayAttemptCount`;
- `totalAuthoritativeEventCount`;
- `lastCommittedLedgerSequence`;
- `latestAuditEntryId` and `latestAuditEntryFingerprint`;
- `latestSemanticEventId` and `latestSemanticEventFingerprint`;
- `latestSubjectTransactionId` and `latestSubjectTransactionFingerprint`;
- `completeHistoryFingerprint`;
- `ledgerHeadFingerprint`.

The initialized empty ledger uses the separate `ReadinessGenesisLedgerHeadUnsignedV1` domain with this identical key set. Its generation, counts, and sequence are zero, and all six latest-coordinate fields are exactly `null`. Registration and replay heads require every latest-coordinate field to be non-null and to identify the just-committed audit entry, semantic event, and subject transaction. The phrase `last committed event` is not a schema field or authority coordinate.

The exact head object returned by `readHead()`, embedded in the installed marker, and written as any separately stored derived `HEAD` projection must be byte-identical. The separate `HEAD` file is a non-authoritative cache rebuildable from verified markers.

## Genesis Authority (`M15-GENESIS-001`)

An open/create operation returns exactly one of two valid states: `uninitialized`, with no FounderOS-created genesis component present, or `initialized-empty`, with a complete verified genesis archive and byte-identical fixed current marker. It never treats partial initialization as empty authority.

Initialization under the cooperative writer lock:

1. safely proves that the root is uninitialized;
2. constructs the exact canonical genesis complete-history commitment and genesis head from `M15-COMMIT-001`;
3. constructs deterministic marker ID `m15-genesis`, generation `0`, and the canonical genesis marker;
4. stages and synchronizes the complete genesis archive and temporary fixed-marker copy;
5. atomically installs the immutable genesis archive;
6. atomically replaces the fixed current marker with byte-identical bytes as the sole genesis visibility boundary;
7. synchronizes the marker directory where supported;
8. optionally publishes a byte-identical derived `HEAD` only after genesis authority exists.

A crash before genesis staging leaves an uninitialized root. A crash during staging leaves no authority and only a classifiable staging orphan. A crash after genesis archive installation but before fixed-marker replacement leaves incomplete genesis initialization and must not be opened as empty authority; a later locked create may remove or replace it only after proving exact canonical genesis bytes and no conflicting state. A crash after fixed-marker replacement yields a valid initialized empty ledger only when the archive and fixed copy are byte-identical and independently recompute. Missing, extra, malformed, noncanonical, or fingerprint-invalid genesis components fail closed.

The first registration requires the verified genesis head as its previous and expected head, uses ledger sequence and generation `1`, and advances every latest coordinate from `null` to the registration audit entry, registration semantic event, and original transaction.

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

Genesis uses exactly `ReadinessGenesisCommitMarkerUnsignedV1`. Registration and replay use exactly the separate `ReadinessCommitMarkerUnsignedV1` field set, category discriminator, exclusions, dependencies, and fingerprint field in the sole `M15-COMMIT-001` table. No summary in another document adds, removes, or renames a marker field.

The canonical marker value is computed last. Its immutable event-local archive preserves marker history and global marker-ID ownership. Commit occurs only when byte-identical canonical marker bytes are atomically installed at the fixed current-marker location. Installed components or an archived marker without that fixed current-marker activation are crash orphans, not committed history. Missing derived `HEAD` or index state after activation does not roll back the commit.

## Read Semantics

- Reads operate only on recovered and verified marker-bounded history.
- `readHead()` returns the exact marker-embedded head bytes, including the verified genesis head for an initialized empty ledger.
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
- duplicate or conflicting globally owned registration idempotency keys, ownership IDs, registration-request IDs, transaction IDs, Decision IDs, registration semantic-event IDs, registration audit-entry IDs, registration marker IDs, replay idempotency keys, replay-request IDs, replay-attempt IDs, replay semantic-event IDs, replay audit-entry IDs, or replay marker IDs;
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
