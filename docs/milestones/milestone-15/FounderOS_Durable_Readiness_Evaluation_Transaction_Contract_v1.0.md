# FounderOS Durable Readiness Evaluation Transaction Contract v1.0

## Status

**Specified — not implemented**

## Purpose

Define the complete immutable authoritative transaction that records one exact verified Milestone 14 readiness evaluation.

## Registration Request

The registration request contains:

- `contractVersion`;
- `registrationRequestId`;
- `transactionId`;
- `idempotencyKey`;
- `requestedOwnershipId`;
- `requestedRegistrationSemanticEventId`;
- `requestedRegistrationAuditEntryId`;
- `requestedRegistrationMarkerId`;
- exact durable Delivery and Invocation identity projection;
- exact evaluator configuration projection;
- canonical readiness-input fingerprint;
- `originalEvaluationTime`, exactly equal to the canonical Milestone 14 `evaluatedAt` used for the original package;
- optional caller-supplied canonical evaluation-package fingerprint and package;
- `submittedAt`;
- expected ledger-head fingerprint;
- registration-request fingerprint.

The optional package can only be compared with evaluator-produced output. It is never accepted as authority by itself.

The four caller-requested original-event IDs are the sole source of those authoritative identities. `requestedOwnershipId` becomes the ownership record's `ownershipId`; `requestedRegistrationSemanticEventId` becomes the registration event's `semanticEventId`; `requestedRegistrationAuditEntryId` becomes the registration audit entry's `auditEntryId`; and `requestedRegistrationMarkerId` becomes the registration marker's `markerId`. The request fingerprint, ownership record, transaction bindings, event, audit entry, marker, integrity and recovery verification, exact-retry comparison, and coordinate-specific conflict result all preserve these values exactly. No implementation may derive or replace them using randomness, time, process identity, filesystem state, sequence, or index state.

## Durable Delivery and Invocation Identity Projection

The projection contains at least:

- Delivery transaction ID and fingerprint;
- Delivery Request ID and fingerprint;
- Delivery Envelope ID and fingerprint;
- Delivery Receipt ID and fingerprint;
- Context Package ID and fingerprint;
- Consumer ID and descriptor fingerprint;
- Invocation Request ID and fingerprint.

The projection is derived only after complete Milestone 12 recovery and Milestone 13 authority verification. It does not persist the Delivery Ledger interface or Context Package content.

Its canonical `authorityProjectionFingerprint` commits to every listed logical ID and fingerprint.

## Evaluator Configuration Projection

The projection contains:

- configuration binding version;
- Adapter ID and fingerprint;
- provider family reference;
- Transport Policy ID, fingerprint, and version;
- observability policy version;
- readiness evaluator contract version;
- `configurationProjectionFingerprint`.

## Canonical Evaluation Package

The package binds:

- package contract version;
- canonical readiness-input fingerprint;
- exact Milestone 14 Readiness Decision;
- exact ordered gate trace;
- exact retained non-secret Evidence package;
- observability retention fingerprint;
- Delivery and Invocation identity projection fingerprint;
- evaluator configuration projection fingerprint;
- immutable `originalEvaluationTime`;
- `evaluationPackageFingerprint`.

The package must preserve the complete verified Milestone 14 artifact required for deterministic reconstruction. It must exclude runtime authority objects, sinks, registries, clients, and raw provider material.

## Committed Transaction

A committed readiness evaluation transaction contains:

- transaction contract version;
- transaction ID;
- registration request and fingerprint;
- idempotency ownership record and fingerprint;
- Delivery and Invocation identity projection;
- evaluator configuration projection;
- Adapter ID and fingerprint;
- provider family reference;
- provider capability ID and fingerprint;
- Credential Reference ID and fingerprint only;
- Transport Policy ID and fingerprint;
- canonical evaluation package;
- immutable `originalEvaluationTime`;
- `submittedAt` and `committedAt`;
- `transactionFingerprint`.

The canonical transaction fingerprint covers this semantic payload and excludes outer ledger commit coordinates.

## Normative Commitment Domains (`M15-COMMIT-001`)

This is the sole authoritative Milestone 15 commitment-domain table. Every other Milestone 15 document references this table and may not define a variant. Each fingerprint is lowercase SHA-256 over the FounderOS durable canonical JSON bytes of the named unsigned schema, prefixed by the exact domain tag and one `0x00` separator byte. An unsigned schema never contains its resulting fingerprint field. Every public operation-result envelope, transient result/status value, and validation report classified as ephemeral by the sole Evidence Durability Inventory in the privacy policy is deliberately absent from this table and may not receive a readiness-ledger fingerprint or commitment domain.

| Artifact | Domain tag | Unsigned schema | Includes | Excludes | Depends on | Fingerprint field | Authority class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Genesis complete-history commitment | `founderos.m15.genesis-history.v1` | `ReadinessGenesisCompleteHistoryUnsignedV1` | `historyContractVersion = "1.0"`, `historyGeneration = 0`, `previousCompleteHistoryFingerprint = null`, `totalAuthoritativeEventCount = 0` | own fingerprint; event, audit, head, marker, time, process, random, filesystem, or index fields | literal genesis constants | `completeHistoryFingerprint` | authoritative genesis chain coordinate |
| Genesis ledger head | `founderos.m15.genesis-head.v1` | `ReadinessGenesisLedgerHeadUnsignedV1` | exact ledger-head field set; `headContractVersion = "1.0"`; generation, counts, and sequence are zero; all six latest-coordinate fields are null; canonical genesis complete-history fingerprint | own fingerprint and marker fingerprint | genesis complete-history commitment | `ledgerHeadFingerprint` | authoritative genesis projection embedded in genesis marker |
| Genesis commit marker | `founderos.m15.genesis-marker.v1` | `ReadinessGenesisCommitMarkerUnsignedV1` | `markerContractVersion = "1.0"`, `markerId = "m15-genesis"`, `markerGeneration = 0`, `markerCategory = "genesis"`; zero counts and sequence; null subject, semantic-event, and audit-entry coordinates; genesis complete-history fingerprint; exact genesis head projection/fingerprint | own fingerprint; all registration/replay fields; time, process, random, filesystem, pointer, and index fields | genesis history and head | `commitMarkerFingerprint` | canonical empty-ledger authority whose atomically installed fixed current copy is the genesis visibility boundary; immutable genesis archive is authoritative only after activation |
| Registration request | `founderos.m15.registration-request.v1` | `ReadinessRegistrationRequestUnsignedV1` | version, request ID, requested transaction, ownership, registration semantic-event, registration audit-entry, and registration marker IDs, idempotency key, complete authority/configuration projections, readiness-input fingerprint, `originalEvaluationTime`, optional complete expected package and fingerprint, submitted time, expected head | own fingerprint; evaluator, ledger, or writer objects | verified projection values | `registrationRequestFingerprint` | authoritative component |
| Evaluator configuration projection | `founderos.m15.evaluator-configuration.v1` | `ReadinessEvaluatorConfigurationProjectionUnsignedV1` | version, Adapter ID/fingerprint, provider family, Transport Policy ID/fingerprint/version, observability policy version, evaluator contract version | own fingerprint; function/object/process identity | verified configured evaluator | `configurationProjectionFingerprint` | authoritative supporting evidence |
| Durable authority projection | `founderos.m15.authority-projection.v1` | `DurableReadinessAuthorityProjectionUnsignedV1` | exact Delivery transaction, Request, Envelope, Receipt, Context Package, Consumer, and Invocation IDs/fingerprints | own fingerprint; ledger port; Context content | recovered Milestone 12 and resolved Milestone 13 authority | `authorityProjectionFingerprint` | authoritative supporting evidence |
| Evaluation package | `founderos.m15.evaluation-package.v1` | `CanonicalReadinessEvaluationPackageUnsignedV1` | version, readiness-input fingerprint, exact Decision, ordered gate trace, retained evidence, retention fingerprint, authority/configuration fingerprints, `originalEvaluationTime` | own fingerprint; evaluator-local registry or sink | verified projections and same-instance Decision verification | `evaluationPackageFingerprint` | authoritative supporting evidence |
| Ownership | `founderos.m15.idempotency-ownership.v1` | `ReadinessIdempotencyOwnershipUnsignedV1` | version, caller-requested globally unique ownership ID, key, request ID/fingerprint, requested transaction ID, Decision ID/fingerprint, requested registration semantic-event, audit-entry, and marker IDs, package/authority/configuration fingerprints, first-claim sequence and time | own fingerprint; transaction, audit, head, history, or marker fingerprints | request and verified package | `ownershipFingerprint` | authoritative component |
| Original transaction | `founderos.m15.transaction.v1` | `CommittedReadinessEvaluationTransactionUnsignedV1` | version, transaction ID, complete request and ownership, projections, package, canonical non-secret IDs/fingerprints, original/submitted/committed times | own fingerprint and all later event, audit, history, head, marker, and index fields | request, ownership, projections, package | `transactionFingerprint` | authoritative component |
| Registration semantic event | `founderos.m15.registration-semantic-event.v1` | `ReadinessSemanticEventUnsignedV1` | event version, globally unique semantic event ID, category, transaction ID/fingerprint, ownership ID/fingerprint | own fingerprint; sequence, audit, head, history, marker fields | committed transaction and ownership | `semanticEventFingerprint` | authoritative component |
| Replay request | `founderos.m15.replay-request.v1` | `ReadinessReplayRequestUnsignedV1` | version, replay idempotency key, requested replay request, attempt, semantic-event, audit-entry, and marker IDs, original transaction ID/fingerprint, supplied projections/input fingerprint, immutable `originalEvaluationTime` binding, `replayEvaluatedAt`, expected head | own fingerprint; ledger/evaluator objects | captured replay input | `replayRequestFingerprint` | authoritative supporting evidence when recorded |
| Historical comparison | `founderos.m15.historical-comparison.v1` | `ReadinessHistoricalComparisonUnsignedV1` | original/reconstructed package fingerprints, historical status, bounded differing paths and reasons | own fingerprint; raw differing values | verified reconstruction evidence | `historicalComparisonFingerprint` | authoritative replay evidence |
| Current admissibility | `founderos.m15.current-admissibility.v1` | `ReadinessCurrentAdmissibilityUnsignedV1` | original Authorization fingerprint, `replayEvaluatedAt`, current status and stable reasons | own fingerprint; replacement Authorization or changed original times | immutable original Authorization evidence | `currentAdmissibilityFingerprint` | authoritative replay evidence |
| Replay attempt | `founderos.m15.replay-attempt.v1` | `ReadinessReplayAttemptUnsignedV1` | version, globally unique attempt ID, request fingerprint, original coordinates, projections, historical comparison, current admissibility, stable evidence reasons | own fingerprint and every operation-result append status plus all later audit, history, head, marker, and index fields | replay request and both assessments | `replayAttemptFingerprint` | authoritative component after marker commit |
| Replay semantic event | `founderos.m15.replay-semantic-event.v1` | `ReadinessReplaySemanticEventUnsignedV1` | event version, globally unique event ID, category, original transaction ID/fingerprint, replay attempt ID/fingerprint | own fingerprint; sequence, audit, head, history, marker fields | replay attempt | `semanticEventFingerprint` | authoritative component |
| Audit entry | `founderos.m15.audit-entry.v1` | `ReadinessAuditEntryUnsignedV1` | audit version/ID, sequence, previous ledger-head fingerprint, semantic event ID/fingerprint, category, subject transaction ID/fingerprint, recorded time | own fingerprint; resulting ledger head; complete-history and marker fingerprints | semantic event and previous verified head | `auditEntryFingerprint` | authoritative component |
| Complete-history commitment | `founderos.m15.complete-history.v1` | `ReadinessCompleteHistoryCommitmentUnsignedV1` | previous complete-history fingerprint, audit sequence, audit-entry fingerprint, semantic-event fingerprint | own fingerprint; resulting head and marker | audit entry and semantic event | `completeHistoryFingerprint` | authoritative chain coordinate |
| Ledger head | `founderos.m15.ledger-head.v1` | `ReadinessLedgerHeadUnsignedV1` | `headContractVersion`, `headGeneration`, `committedRegistrationCount`, `committedReplayAttemptCount`, `totalAuthoritativeEventCount`, `lastCommittedLedgerSequence`, `latestAuditEntryId`, `latestAuditEntryFingerprint`, `latestSemanticEventId`, `latestSemanticEventFingerprint`, `latestSubjectTransactionId`, `latestSubjectTransactionFingerprint`, `completeHistoryFingerprint` | own fingerprint and commit-marker fingerprint | audit and complete-history commitments | `ledgerHeadFingerprint` | authoritative projection embedded in marker |
| Commit marker | `founderos.m15.commit-marker.v1` | `ReadinessCommitMarkerUnsignedV1` | marker version/ID/generation/category; committed registration, replay-attempt, and total-event counts; last committed sequence; subject transaction ID/fingerprint; semantic-event ID/fingerprint; audit-entry ID/fingerprint; complete-history fingerprint; resulting ledger-head projection/fingerprint; for `registration`, request, configuration, authority, package, ownership, transaction, and registration-event fingerprints; for `replay`, original transaction, replay request, historical comparison, current admissibility, replay attempt, and replay-event fingerprints | own fingerprint and every derived pointer/index | all prior commitments selected by the strict category discriminator | `commitMarkerFingerprint` | canonical marker value whose atomically installed fixed current copy is the visibility boundary; immutable archived copy is authoritative history only after activation |
| Derived index entry | `founderos.m15.derived-index-entry.v1` | `ReadinessDerivedIndexEntryUnsignedV1` | index kind/key, canonical logical coordinates, authoritative subject transaction fingerprint, authoritative marker fingerprint | own fingerprint; raw authority or values not required for lookup | verified marker-bounded history | `derivedIndexEntryFingerprint` | derived, non-authoritative |
| Derived index snapshot | `founderos.m15.derived-index.v1` | `ReadinessDerivedIndexUnsignedV1` | index version/kind, source marker/head fingerprints, ordered entry fingerprints, entry count | own fingerprint; generation time from semantic identity | derived entries and verified head | `derivedIndexFingerprint` | derived, non-authoritative |

### Exact ledger-head and category rules

`ReadinessLedgerHeadUnsignedV1` and `ReadinessGenesisLedgerHeadUnsignedV1` have exactly these keys, in schema order:

```text
headContractVersion
headGeneration
committedRegistrationCount
committedReplayAttemptCount
totalAuthoritativeEventCount
lastCommittedLedgerSequence
latestAuditEntryId
latestAuditEntryFingerprint
latestSemanticEventId
latestSemanticEventFingerprint
latestSubjectTransactionId
latestSubjectTransactionFingerprint
completeHistoryFingerprint
```

`ledgerHeadFingerprint` is the sole additional key on the signed head. For genesis, `headGeneration`, all three counts, and `lastCommittedLedgerSequence` are exactly `0`; the six `latest*` fields are exactly `null`. For every registration or replay head, `headGeneration = totalAuthoritativeEventCount = lastCommittedLedgerSequence`, the three latest ID/fingerprint pairs are non-null and identify the just-committed audit entry, semantic event, and subject transaction, and counts reflect the complete marker-bounded prefix. Unknown, omitted, or category-inapplicable keys fail strict schema validation.

The canonical unsigned genesis complete-history input is exactly:

```json
{
  "historyContractVersion": "1.0",
  "historyGeneration": 0,
  "previousCompleteHistoryFingerprint": null,
  "totalAuthoritativeEventCount": 0
}
```

Its fingerprint is `SHA-256(UTF8("founderos.m15.genesis-history.v1") || 0x00 || canonicalJSON(unsignedGenesisHistory))`. The genesis head and genesis marker use the same formula with their exact domain tags and named unsigned schemas. Clean processes therefore derive the same complete-history, head, marker ID, marker generation, canonical bytes, and fingerprints without time, randomness, process identity, or filesystem input.

`ReadinessGenesisCommitMarkerUnsignedV1` is a separate strict schema. Its subject transaction ID/fingerprint, semantic-event ID/fingerprint, and audit-entry ID/fingerprint are exactly `null`; registration-only and replay-only keys are absent. `ReadinessCommitMarkerUnsignedV1` accepts only `markerCategory = "registration"` or `"replay"`; every shared coordinate is non-null, and exactly the category-specific fields listed in its table row are present. A genesis object cannot validate as an event marker, and an event object cannot validate as a genesis marker.

The genesis unsigned marker has exactly these keys, in schema order:

```text
markerContractVersion = "1.0"
markerId = "m15-genesis"
markerGeneration = 0
markerCategory = "genesis"
committedRegistrationCount = 0
committedReplayAttemptCount = 0
totalAuthoritativeEventCount = 0
lastCommittedLedgerSequence = 0
subjectTransactionId = null
subjectTransactionFingerprint = null
semanticEventId = null
semanticEventFingerprint = null
auditEntryId = null
auditEntryFingerprint = null
completeHistoryFingerprint
resultingLedgerHead
resultingLedgerHeadFingerprint
```

`commitMarkerFingerprint` is the sole additional key on the signed genesis marker. `resultingLedgerHead` is the complete signed genesis head, and `resultingLedgerHeadFingerprint` equals its `ledgerHeadFingerprint`. No event/category-specific key is nullable merely because another category does not use it; inapplicable keys are absent.

### Normative computation order

Initialization computes genesis complete history, genesis head, and genesis marker in that order. Registration computes registration request, evaluator configuration projection, durable authority projection, evaluation package, ownership, original transaction, registration semantic event, audit entry, complete-history commitment, ledger head, and registration marker in that order. Replay computes replay request, historical comparison, current admissibility, replay attempt, replay semantic event, audit entry, complete-history commitment, ledger head, and replay marker in that order. Derived entries and snapshots are always computed last.

The audit entry binds the previous ledger head, not the resulting head. The resulting ledger head is computed only after the audit-entry fingerprint. The marker embeds that resulting head and is computed last. No artifact depends on its own fingerprint or on a later commitment.

## Authoritative Visibility (`M15-TXN-001`, `M15-TXN-002`)

Each event has one canonical commit-marker value with one globally unique marker ID. Its canonical bytes and fingerprint are stored in an immutable event-local archive and copied byte-for-byte to the fixed current-marker location. The atomically installed, fully verified fixed current-marker copy is the sole authoritative visibility boundary. The archived copy is not a second visibility boundary: before fixed-marker replacement it is an uncommitted candidate; after replacement it is immutable historical evidence for that activated event.

The initialized empty ledger follows the same visibility rule through its separate canonical genesis marker. `markerId = "m15-genesis"` and `markerGeneration = 0` are deterministic reserved constants and may never be used by an event. The byte-identical immutable genesis archive and fixed current-marker copy are the only authoritative initialized-empty state; a genesis archive by itself is incomplete initialization, not authority.

An unmarked transaction, ownership, replay attempt, semantic event, or audit component is not committed. After fixed current-marker installation, the embedded resulting ledger-head projection is authoritative. Any separately stored `HEAD` pointer or derived index is non-authoritative and rebuildable; its absence cannot roll back a marker-committed event. Integrity requires the installed current marker to equal the archived marker for its event and requires every earlier activated event to retain its archived marker, which preserves permanent marker-ID uniqueness without making an older marker current.

## Permitted Decision Statuses

The transaction may contain only Milestone 14 statuses:

- `not-assessed`;
- `not-ready`;
- `ready-for-dry-run`;
- `disabled-by-policy`.

No `live-ready`, `ready-for-production`, `enabled`, or equivalent status exists.

## Transaction Invariants

- Every nested schema and fingerprint verifies independently.
- All identity projections bind the same Delivery, Invocation, Consumer, Context Package, Adapter, capability, Credential Reference, and Transport Policy authority.
- Gate-trace order matches the Milestone 14 canonical order exactly.
- Retention evidence is exact and non-secret.
- Registration request, ownership, semantic transaction, event envelope, audit entry, and marker coordinates agree.
- Sequence, latest audit-entry fingerprint, complete-history fingerprint, and ledger-head fingerprint match the committed ledger prefix.
- The transaction is immutable after commitment.
- The first committed registration globally and permanently owns its idempotency key, ownership ID, registration request ID, transaction ID, Decision ID, registration semantic-event ID, registration audit-entry ID, and registration marker ID.
- Reuse of any owned coordinate outside the exact idempotent-retry tuple fails, even when candidate bytes are otherwise identical.
- Identical transaction replay returns the existing transaction and creates no second registration event.

## Excluded Fields and Values

The transaction must not contain:

- raw Knowledge Objects or Query Results;
- hidden Context or Context Package content;
- Delivery Ledger objects or ports;
- credential values, secret bytes, environment contents, or authorization headers;
- URLs, arbitrary endpoints, or physical paths;
- provider request or response bodies;
- clients, callbacks, functions, sockets, SDK objects, or executable payloads;
- observability sinks or Milestone 14 issuance-registry state;
- caller-supplied commit markers or low-level writers.

## Canonicalization

Only exact plain, finite, acyclic data with enumerable own data properties is canonicalizable. Unsupported values, ambiguous Unicode or number representations, accessors, symbols, custom prototypes, and hidden fields fail before persistence.

Fingerprints use domain-separated lowercase SHA-256 over FounderOS canonical JSON bytes.

## Principle

A committed transaction proves what readiness evaluation was verified and recorded. It never grants permission to resolve a credential or execute provider transport.
