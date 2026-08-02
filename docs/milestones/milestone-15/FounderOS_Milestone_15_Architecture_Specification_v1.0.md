# FounderOS Milestone 15 Architecture Specification v1.0

## Status

**Specified — not implemented**

## Purpose

Define package ownership, authority flow, storage boundaries, and dependency direction for the durable readiness evaluation ledger and replay verification registry.

## Package Responsibilities

### `@founderos/knowledge-schema`

The shared package will own strict, versioned, storage-independent schemas and inferred types for:

- registration requests;
- evaluator configuration projections;
- Delivery and Invocation identity projections;
- canonical evaluation packages;
- committed transactions and idempotency ownership;
- audit entries, ledger heads, and commit markers;
- replay attempts and verification results;
- integrity, recovery, and derived-index results.

It must not import `knowledge-engine`, filesystem APIs, provider SDKs, credential APIs, or network APIs.

### `@founderos/knowledge-engine`

The service package will own:

- safe public-input capture;
- Milestone 12 ledger recovery and integrity orchestration;
- reuse of the Milestone 13 authoritative Delivery/Invocation resolver;
- approved Milestone 14 evaluator configuration and execution;
- canonical package comparison;
- registration, replay, recovery, and integrity orchestration;
- canonical fingerprint recomputation;
- the internal ledger application port;
- the governed local file-backed adapter;
- derived-index verification and rebuilding.

It must not expose low-level record insertion, ledger-head mutation, commit-marker construction, test-only corruption seams, credential resolution, or transport.

## Dependency Direction

```text
knowledge-engine -> knowledge-schema
```

Shared contracts remain storage and provider neutral. Physical persistence implements an engine-owned port. No reverse dependency is permitted.

## Authority Graph

```text
Verified Milestone 12 Delivery Ledger
                |
                v
Milestone 13 Delivery / Invocation Resolver
                |
                v
Approved Milestone 14 Evaluator Configuration
                |
                v
Canonical Milestone 14 Evaluation Package
                |
                v
Milestone 15 Registration Orchestrator
                |
                v
Governed Readiness Ledger Port
                |
                v
Local File Adapter (first implementation only)
```

The upstream Delivery and Invocation artifacts remain authoritative. Milestone 15 binds and preserves their identity; it does not replace or weaken their verification.

## Evaluator Configuration Projection

Functions and authority objects are not serializable authority. Each transaction instead stores a strict projection containing:

- `configurationBindingVersion`;
- `adapterId` and `adapterFingerprint`;
- `providerFamilyReference`;
- `transportPolicyId`, `transportPolicyFingerprint`, and `transportPolicyVersion`;
- `observabilityPolicyVersion`;
- `readinessEvaluatorContractVersion`;
- `configurationProjectionFingerprint`.

At registration and replay, a supplied approved configured evaluator must reconstruct this projection exactly. Matching the projection does not authorize transport; it proves only configuration equivalence for deterministic readiness evaluation.

## Public Application Boundary

The future public facade may expose capabilities equivalent to:

```text
verifyIntegrity()
recover()
registerVerifiedReadinessEvaluation(...)
readOriginalReadinessEvaluation(transactionId)
listCommittedReadinessEvaluations()
submitReadinessReplayAttempt(...)
listReadinessReplayAttempts(transactionId)
readHead()
rebuildDerivedIndexes()
```

Names may be refined during implementation, but authority separation must remain. Reads return immutable values or defensive copies and use deterministic ordering.

## Registration Boundary

The registration facade accepts only:

- one strict registration request;
- a governed Milestone 12 Delivery Ledger interface;
- one approved configured Milestone 14 evaluator;
- the governed readiness-ledger port;
- explicit operation time and bounded resource policy where required.

It does not accept raw Knowledge, Query Results, Context content, a Delivery Ledger object for persistence, low-level readiness artifacts, secrets, URLs, provider clients, callbacks, commit markers, record writers, or index writers.

## Replay Boundary

Replay accepts one transaction identity, a replay idempotency key and requested request/attempt/semantic-event/audit-entry/marker IDs, the exact authoritative readiness input, `replayEvaluatedAt`, a newly supplied governed Delivery Ledger, and a fresh approved evaluator whose configuration projection matches the stored projection.

After ledger verification, the replay orchestrator must first:

- return an exact permanently owned retry as `idempotent-replay-returned`/`not-appended` only when all five replay IDs and the complete request fingerprint match; the original expected-head coordinate must match the owned request but need not equal the later current head;
- reject every non-exact reuse of an owned replay coordinate;

For a distinct submission, it must:

- re-run complete upstream authority verification;
- always reconstruct the original package with the exact stored canonical input and immutable `originalEvaluationTime`, independent of current Authorization validity;
- verify newly produced retention evidence with the fresh evaluator;
- compare the complete package, including ordered gate trace;
- separately assess current admissibility from the original Authorization evidence at `replayEvaluatedAt` without altering `decidedAt`, `expiresAt`, or original evaluation time;
- append a distinct result even when comparison mismatches or verification fails, provided the ledger itself remains valid and the attempt can be safely represented;
- keep append status only in the operation result, never in the replay-attempt commitment;
- leave the original transaction byte-for-byte unchanged.

The valid combined result `matched` plus `authorization-expired` proves historical determinism while denying current admissibility. Historical reconstruction, current admissibility, and execution authority are separate concepts; replay never provides execution authority.

## Persistence Boundary

Authoritative persistence contains immutable registration and replay components plus one immutable archived commit-marker value per event. The same canonical marker bytes and `commitMarkerFingerprint` are installed at the fixed current-marker location. Only successful atomic replacement of that fixed current marker activates the marker-bounded prefix and creates visibility (`M15-TXN-001`, `M15-TXN-002`). The archived copy preserves each globally unique marker ID for permanent integrity and ownership checks; it is uncommitted evidence until its byte-identical fixed current-marker copy is installed.

Any separately stored `HEAD` pointer and all derived indexes are outside commit authority. They may be missing or corrupt and can be rebuilt from verified marker-bounded history without rolling back a committed event.

## Transaction and Audit Ordering

- Every committed event has a unique monotonically increasing ledger sequence.
- Registration transactions and replay attempts share one audit sequence.
- The sole normative commitment-domain table and acyclic order are in `FounderOS_Durable_Readiness_Evaluation_Transaction_Contract_v1.0.md` (`M15-COMMIT-001`).
- Audit entries bind the previous ledger head and semantic event; complete history and the resulting head are computed afterward; the commit marker is computed last.
- Timestamps do not define ordering.
- One expected-head compare-and-swap prevents stale writers from committing.

## Failure Semantics

Fail before mutation on unsafe input, invalid upstream authority, configuration mismatch, package mismatch at registration, prohibited material, or invalid expected head.

Fail closed during recovery on missing marker-bounded records, invalid fingerprints, broken audit links, conflicting ownership, duplicate authority, incomplete transactions, or ambiguous installed state. Never truncate, rewrite, or invent authoritative history.

Replay mismatch is valid non-authoritative evidence, not ledger corruption. Corruption of the replay record itself is ledger corruption.

## Security Boundary

- Registration and replay are non-executing evaluation workflows.
- Credential References remain logical identifiers and fingerprints only.
- No secret-loading or transport dependency is permitted in production import closure.
- No readiness status grants live execution.
- Stored expired Authorization evidence remains expired.
- Fresh replay cannot extend Authorization validity.
- A stored Decision cannot bypass the Milestone 13 Invocation boundary.

## Local Adapter Limitations

The first adapter assumes:

- one cooperative writer on one machine;
- atomic rename within one filesystem;
- file synchronization support;
- a cooperative local administrator;
- explicit operator handling of abandoned locks.

It does not provide distributed coordination, hostile privileged-filesystem resistance, coordinated rollback protection, replication, remote durability, or network-filesystem consensus.

## Architecture Decision

ADR-0019 remains **Proposed** until an implementation milestone is separately authorized, reviewed, and accepted.
