# FounderOS Milestone 15 Durable Production-Provider Readiness Evaluation Ledger and Replay Verification Registry Foundation Specification v1.0

## Status

**Specified — not implemented**

## Purpose

Define the durable, restart-safe, and independently replay-verifiable boundary for the non-executing Milestone 14 production-provider readiness evaluation.

## Objective

FounderOS must be able to commit one exact, independently verified Milestone 14 readiness evaluation transaction, recover it after restart, and append evidence that a fresh approved evaluator reconstructed the same canonical evaluation package from the same governed authority.

The durable transaction is audit and verification evidence only. It is not authorization for credential access, provider transport, or live traffic.

## Architectural Sequence

```text
Milestone 12 Durable Delivery Ledger
                |
                v
Milestone 13 Governed Invocation Authority
                |
                v
Milestone 14 Non-Executing Readiness Evaluator
                |
                v
Milestone 15 Durable Readiness Evaluation Ledger
                |
                v
Future separately approved credential and transport boundaries
```

Dependency direction remains:

```text
knowledge-engine -> knowledge-schema
```

## In Scope

- Strict, versioned, storage-independent readiness-ledger contracts
- Durable registration requests and permanent idempotency ownership
- Exact Delivery, Invocation, Adapter, capability, Credential Reference, Transport Policy, Decision, gate-trace, retention, and evaluator-configuration bindings
- Immutable committed readiness evaluation transactions
- Hash-chained audit entries and an authoritative commit-head marker
- Fresh-evaluator replay verification after restart
- Append-only replay attempts with separate historical reconstruction, current admissibility, and append statuses, plus distinct `recorded`/`not-recorded` operation results
- Integrity verification and deterministic recovery
- Rebuildable non-authoritative derived indexes
- One governed local file-backed adapter specification
- Canonical JSON and SHA-256 fingerprints
- Path safety, privacy, and no-execution enforcement
- Deterministic evaluation scenarios and full Milestone 04–14 regression preservation

## Out of Scope

- Real provider adapters or provider request dispatch
- Credential resolution, secret-store access, or environment-secret loading
- HTTP, DNS, TLS, socket, proxy, SDK, or other outbound transport
- Live-ready or production-enabled state
- Provider response ingestion
- Streaming or tools/function calling
- Agents, Hermes, or MCP
- Provider routing or failover
- Distributed ledgers, locks, coordination, replication, or rollback protection
- External observability, UI, deployment, or production enablement

## Authoritative Registration Flow

1. Capture and validate one exact plain-data registration request.
2. Recover the readiness ledger and verify its authoritative integrity.
3. Recover and verify the supplied Milestone 12 Delivery Ledger.
4. Resolve the exact Milestone 13 Delivery and Invocation authority.
5. Verify the supplied evaluator configuration against its canonical projection.
6. Evaluate the exact authoritative Milestone 14 input through that configured evaluator.
7. Verify the returned Decision with the same evaluator instance and original retention evidence.
8. Compare any caller-supplied evaluation package with the evaluator-produced canonical package.
9. Reject prohibited, hidden, executable, credential-bearing, endpoint-bearing, or low-level capabilities.
10. For an exact owned retry, reconstruct and verify the same request and package through the resolver and evaluator exactly once, then return the original without append or head advancement.
11. For a first registration, claim permanent global ownership of the idempotency key, registration request ID, transaction ID, and Decision ID against the verified expected ledger head.
12. Commit one complete immutable readiness evaluation transaction atomically.
13. Advance the audit chain and authoritative commit marker.
14. Stop before credential resolution or transport.

## Authoritative Replay Flow

1. Recover and verify the durable readiness ledger.
2. For an exact owned retry, match the replay idempotency key; request, attempt, semantic-event, audit-entry, and marker IDs; and complete original request fingerprint, verify the original attempt and activating marker, and return `idempotent-replay-returned`/`not-appended`. Its stored expected head must match the original request but need not equal the later current head.
3. For a distinct submission, reject every owned-coordinate reuse and read the immutable original transaction.
4. Capture a newly supplied governed Delivery Ledger and a fresh approved configured evaluator.
5. Verify the stored evaluator configuration and capture supplied governed authority for reconstruction.
6. Always perform historical reconstruction at immutable `originalEvaluationTime`: evaluate the exact original canonical input through the fresh evaluator, verify its newly issued Decision and retention evidence through that evaluator instance, and compare the complete package with the stored original.
7. Separately assess current admissibility from the immutable original Authorization evidence at explicit `replayEvaluatedAt`; never replace, refresh, or extend that evidence.
8. Record separate historical-reconstruction and current-admissibility statuses in one immutable replay attempt; append status is not part of that attempt.
9. Append that replay attempt when the readiness ledger and append preconditions remain safe.
10. Return an operation-level `recorded`, `not-recorded`, or `idempotent-replay-returned` result that never claims append success after append failure.
11. Stop before credential resolution or transport.

Historical reconstruction is independent of current admissibility (`M15-REPLAY-001`). An expired Authorization may therefore produce `historicalReconstructionStatus = matched` together with `currentAdmissibilityStatus = authorization-expired`. Replay never refreshes, extends, or replaces stored Authorization evidence and never grants execution authority.

## Core Contracts

Milestone 15 specifies:

- readiness evaluation registration request;
- evaluator configuration projection;
- durable Delivery and Invocation identity projection;
- canonical readiness evaluation package;
- committed readiness evaluation transaction;
- idempotency ownership record;
- audit entry, ledger head, and commit marker;
- replay attempt and replay verification result;
- integrity and recovery results;
- derived index snapshot.

## Authoritative and Derived State

Authoritative state consists only of marker-bounded, schema-valid, fingerprint-valid immutable registration transactions, idempotency ownership, audit entries, replay attempts, immutable event-local marker archives, and the fixed current marker. Each archived marker is byte-identical to the canonical marker value that activated its event; only atomic installation at the fixed current-marker location activates visibility (`M15-TXN-001`, `M15-TXN-002`).

Derived indexes may accelerate lookup by transaction ID, Decision ID, idempotency key, Adapter ID, Invocation ID, or replay sequence. They are non-authoritative, must verify against complete replay, and may be discarded and rebuilt. Corrupt derived state must never invalidate otherwise valid authoritative history or silently replace it.

## Identity and Fingerprinting

- All contract versions are explicit.
- All timestamps are explicit canonical UTC instants supplied by the caller or operation boundary.
- Canonical bytes use the FounderOS strict canonical JSON rules for finite, plain, acyclic data.
- Fingerprints use lowercase SHA-256 hexadecimal output.
- Ordered arrays, including gate traces and reason codes, retain order when order is semantically meaningful.
- Every record binds its semantic category into its fingerprint domain.
- A transaction or replay-attempt fingerprint covers its semantic payload and excludes outer commit coordinates.
- All commitment tags, named unsigned schemas, included and excluded fields, authority classes, and the acyclic computation order are defined solely by the normative table in `FounderOS_Durable_Readiness_Evaluation_Transaction_Contract_v1.0.md` (`M15-COMMIT-001`).
- The canonical marker is archived immutably per event, and its byte-identical fixed current-marker copy embeds the resulting ledger head. Only atomic fixed-marker installation is the visibility boundary. Separate `HEAD` and index files are derived only.

## Required Invariants

1. Registration begins only after readiness-ledger and Delivery-ledger recovery and integrity succeed.
2. Exact Milestone 13 Delivery and Invocation authority remains the sole upstream authority path.
3. Authorization is evaluated before Credential Reference or Transport planning.
4. The same Milestone 14 evaluator that produces a registration Decision must verify it before persistence.
5. A fresh evaluator is required for replay after restart; historical reconstruction always uses the original canonical input and `originalEvaluationTime`, while current admissibility uses `replayEvaluatedAt`.
6. Only canonical Milestone 14 statuses may be stored; no live-ready equivalent exists.
7. Credential material is never accepted or persisted; only validated IDs and fingerprints are recorded.
8. Original transactions are immutable; replay attempts are separate append-only evidence.
9. First valid ownership of the idempotency key, registration request ID, transaction ID, and Decision ID is permanent and globally unambiguous.
10. Reuse outside the complete exact-retry tuple fails closed, including cross-key or cross-request reuse of otherwise identical bytes.
11. Coherently re-signed substitutions fail when any authority binding differs.
12. Ambiguous, partial, reordered, missing, or corrupt authoritative state is never silently repaired.
13. Public inputs reject accessors, symbols, inherited or non-enumerable capabilities, custom prototypes, functions, clients, callbacks, URLs, and executable values before authority access or mutation.
14. No production import closure may introduce credential or network capability.
15. A durable record can never authorize provider execution.

## Local Adapter Boundary

The first specified adapter is cooperative, local, single-machine, and same-filesystem only. It acquires its single-writer lock before staging, uses expected-head compare-and-swap, atomic temporary-write/fsync/rename publication, immutable event records and marker archives, and a separately replaced byte-identical fixed current marker as the commit point.

It does not claim hostile privileged-filesystem protection, distributed consensus, coordinated rollback protection, network-filesystem safety, or automatic stale-lock recovery. Abnormal process termination may require explicit operator lock cleanup.

## Definition of Success for Future Implementation

FounderOS can durably register and recover one exact verified Milestone 14 evaluation, independently verify every authoritative record, reproduce that evaluation with a fresh approved evaluator after restart, append immutable replay evidence, reject conflicts and unsafe material, rebuild derived indexes, preserve Milestone 04–14 behavior, and prove that no credential resolution or provider transport path exists.

## Specification-Phase Stop

This document defines future implementation behavior. Milestone 15 is not implemented by this documentation set.
