# Knowledge schema

`@founderos/knowledge-schema` is the runtime-validation and TypeScript contract foundation for KnowledgeOS.

Milestone 18 adds strict secret-free credential-resolution request, command, rotation, revocation, port-result, evidence, result, and verification contracts. These contracts cannot represent credential material, a material-derived value, headers, endpoints, callbacks, clients, or provider bodies.

Milestone 19 adds strict versioned model-policy, prompt-cache-policy, instruction-profile,
input-projection, readiness, current-control, request-plan, fixture-response, mapping-evidence,
disabled-policy, preparation-result, and closed-taxonomy contracts. They contain no credential
material, authentication header, endpoint override, client, callback, transport, or provider SDK.

It implements the seven object categories defined by the official specifications:

- General knowledge
- Decisions
- Projects
- Research
- Principles
- Experiments
- Relationships

## Design mapping

Every object carries a shared metadata envelope containing identity, classification, provenance, quality, lifecycle, tags, and relationship references. Object-specific schemas enforce additional requirements such as decision reasoning and review dates or project vision and milestones.

Persistent lifecycle states use `draft`, `review`, `active`, `archived`, and `deprecated`. Creation and modification are represented by `createdAt` and `updatedAt`; they are events, not persistent statuses.

The package intentionally contains no persistence, Markdown parsing, retrieval, embedding, graph database, or agent behavior.

Milestone 04 adds strict migration-manifest contracts for object identity, object type, canonical and logical destination paths, SHA-256 evidence, metadata, migration status, and human-review status. These contracts validate migration intent only; filesystem execution remains in `@founderos/knowledge-engine`.

Milestone 05 adds strict, versioned query and result contracts. Queries carry identity, consumer context, optional context constraints, and exact-match filters for object type, project, lifecycle status, tags, source, domain, and category. Results carry validated objects, matching source provenance, candidate and match counts, and the sorted set of applied constraints. The schema package defines these boundaries but does not execute queries.

Milestone 06 adds candidate-source and repository access contracts. A candidate batch binds a validated source descriptor and its provenance to schema-valid Knowledge Objects. The repository interface supports deterministic candidate listing, identity lookup, multi-identity finding, and source inspection. Provider execution and storage behavior remain outside this package.

Milestone 07 adds strict corpus-source, repository-snapshot, and corpus-change contracts. Snapshots bind a corpus version and manifest reference to deterministic object, metadata, and source-hash fingerprints. Change sets report version, identity, source, metadata, and object changes without defining refresh execution or persistence behavior.

Milestone 08 adds strict lifecycle, governed comparison, change-set, review-decision, and approval-workflow contracts without changing the Milestone 07 snapshot object or its content-derived identity. `KnowledgeSnapshotComparisonEvidenceSchema` carries the canonical validated Knowledge Object payload alongside the additional per-object content fingerprint needed for governed comparison, allowing the engine to verify every metadata, object, and content digest against the snapshot descriptor. `KnowledgeSnapshotLifecycleRecordSchema` validates ordered lifecycle evidence from `created` through `archived`, including the invariant that transitions occur after snapshot creation. `KnowledgeSnapshotComparisonRequestSchema` accepts snapshots from one corpus, including same-identity comparisons that yield an empty change set. `KnowledgeGovernedChangeSetSchema` preserves deterministic snapshot-, manifest-, version-, and object-level evidence. `KnowledgeSnapshotApprovalWorkflowSchema` binds the active baseline and proposed snapshot, their lifecycle records, the governed change set, review status, and immutable approval or rejection evidence. These schemas define validation contracts only: the package contains no lifecycle orchestration, review behavior, activation behavior, persistence, or automation.

Milestone 09 adds strict, versioned, storage-independent contracts for durable snapshot registrations, canonical manifest evidence, state-specific lifecycle transitions, exact approval and rejection decision envelopes, bootstrap and Milestone 08 governed change-set evidence, activation audit records, ordered audit chains, committed transaction envelopes, optimistic activation requests and results, fail-closed recovery and integrity summaries, and rebuildable derived-index state. `DurableKnowledgeMigrationManifestSchema` preserves valid Milestone 04 entry fields while restricting durable evidence recursively to finite canonical JSON and allowing empty snapshot evidence without changing the general Milestone 04 manifest contract. A registration's approved `ready` or `migrated` manifest entries must match its sorted snapshot descriptors one-to-one by object ID, object type, source path, and source hash. The engine commits the canonical evidence digest without changing the Milestone 07 snapshot-v1 contract or identity. Every authoritative record carries explicit sequence and predecessor evidence plus actor, reason, transaction, stable record identity, and fingerprint fields. Recovery success and failure contracts report lifecycle-transition, decision, and activation counts, while recovery and integrity contracts report derived-index health separately from authoritative validity. Approval, activation, and supersession edges are restricted to their exact atomic envelope shapes. The `DurableSnapshotRegistry` interface exposes safe activation and read/recovery/index operations only; raw prebuilt registration, lifecycle, decision, change-set, and activation-record append capabilities are deliberately absent. The separate bootstrap change-set contract models the first activation without weakening the Milestone 08 comparison contract. These are validation and storage-independent interface contracts only: canonical hashing, replay, locking, filesystem layout, recovery behavior, and persistence remain engine-owned.

Milestone 10 adds strict, versioned, model-independent contracts for governed context requests, explicit object and Unicode-code-point budgets, included/excluded/omitted/truncated evidence, active-registry and repository-snapshot bindings, deterministic context packages, insufficient-context outcomes, and independent verification results. Requests embed the existing query contract and bind consumer identity, required and preferred knowledge, scope, policy, and explicit empty/truncation behavior. Packages preserve the exact request, query identity and result fingerprint, logical provenance, budget arithmetic, stable evidence counts, and content-derived identity without embedding an unbudgeted copy of the full query result. These contracts contain no registry access, selection execution, tokenizer, prompt, LLM, authorization, agent, or storage behavior.

Milestone 11 adds strict Consumer identity and capability, governed delivery request, policy input and caller-supplied decision evidence, freshness, replay, compatibility, immutable delivery envelope, acknowledgment, initial-delivery receipt, rejected-attempt evidence, replay-attempt evidence, consumption-placeholder, and artifact-verification contracts. Policy decisions bind the exact canonical Delivery Request identity rather than only its authorization projection. Successful result validation binds the acknowledgment and receipt back to the envelope. The provider-neutral Consumer interface accepts only a governed envelope. Contracts contain no prompts, chat roles, models, credentials, policy engine, provider adapter, repository access, reasoning execution, or agent behavior.

Milestone 12 adds strict, versioned, storage-independent contracts for immutable Delivery Request registration, permanent idempotency ownership, exact Milestone 11 artifact wrappers, atomic original Delivery transactions, separate Replay Attempts, expiration evidence, append-only audit events, deterministic Recovery and Integrity results, and rebuildable derived indexes. Every authoritative wrapper binds an explicit Ledger sequence and previous-audit fingerprint. Derived indexes declare the versioned `bounded-latest-v1` retention policy and an enforced positive entry capacity. Expired keys remain permanently reserved under `permanent-reservation-v1`. The shared `DurableContextDeliveryLedger` exposes governed reads, recovery, verification, and rebuild operations; it does not expose raw record append, filesystem, SQL, provider, prompt, model, agent, Hermes, or MCP concepts.

Milestone 13 adds strict, versioned, storage-independent contracts for provider-neutral Reasoning Inputs, Execution Policies and budgets, Provider Capability requirements and descriptors, compatibility evidence, governed Invocation Requests, immutable Attempts and Provider Outcomes, operational evidence, Result Envelopes, finalized Consumption Evidence, permanent Invocation ownership, atomic finalization, append-only execution-evidence Ledger events, deterministic Recovery and Integrity results, and rebuildable derived indexes. These shared contracts bind the existing Context Package, Delivery Envelope, Receipt, Consumer, Policy Decision, Active Snapshot, and Registry fingerprints without redefining Milestones 10–12. The package contains no Provider adapter, model payload, prompt role, credentials, network, filesystem, SQL, Agent, Hermes, MCP, or orchestration behavior.

Milestone 14 adds strict, versioned, storage-independent and provider-neutral contracts for Production Adapter descriptors; externally supplied Authorization Decision evidence; reference-only Credentials; secure Transport policies and verified dry-run plans; deterministic Request Plans and Response Mapping evidence; Rate/Capacity and Cost/Budget decisions; Circuit, Health, Observability, Redaction, exact bounded-sink retention evidence, and final Provider Readiness evidence; and stable independent verification results. Retention evidence binds the Adapter and Invocation, Observability readiness, sink policy and bounds, exact ordered retained fingerprints and counts, canonical snapshot fingerprint, one append, and its own fingerprint. The final Decision includes that retention fingerprint in its completed-gate prefix. These schemas preserve exact Milestone 12 Delivery and Milestone 13 Invocation, Consumer, Context Package, Adapter, and Capability bindings while allowing readiness only through `ready-for-dry-run`. This package defines and validates shared evidence only: it does not execute readiness workflows, resolve or store secrets, expose a provider SDK or client, perform DNS/TLS/socket/HTTP activity, persist readiness artifacts, or integrate external observability.

Milestone 15 adds strict storage-independent contracts for durable readiness authority/configuration projections, canonical evaluation packages, registration and ownership, original transactions, replay requests and attempts, audit/history chains, exact genesis and event heads, category-specific markers, derived indexes, paginated authoritative reads, and ephemeral operation/recovery/integrity results. Durable readiness evidence uses named, versioned, exact allowlisted projections instead of an arbitrary canonical object; its redacted transport commitment binds non-secret Adapter, Capability, Credential Reference, and Transport Policy authority without retaining endpoints. The verified Transport Policy fingerprint transitively binds its timeout, size, retry, TLS, DNS, proxy, and egress controls without duplicating unverifiable values in durable evidence. Exported shared maxima bound reason codes, mismatch paths, gate traces, retained observability, total events, filesystem discovery/staging/quarantine, source roots, derived collections, and public findings. List queries use a stable positive sequence cursor with a default page size of 100 and maximum of 256, and page metadata binds the authoritative source head. Every durable fingerprint has one named domain; operation, pagination, `derivedStateStatus`, and validation results deliberately have none and are not persisted. The package still owns no filesystem, credential, network, provider-execution, or reverse engine dependency. The implementation was independently reviewed and merged through pull request #13; ADR-0019 is Accepted.

Every Milestone 15 authoritative instant uses exact canonical UTC milliseconds (`YYYY-MM-DDTHH:mm:ss.sssZ`); date-only, numeric-offset, omitted-millisecond, and alternate-precision representations are rejected rather than normalized. Shared strict contracts also govern redacted writer-lock inspection and exact-identity inactive-lock cleanup requests/results without introducing filesystem ownership into this package.

Registration and replay operation failures use the exported, versioned `1.0` reason taxonomy rather than arbitrary logical references. `ReadinessRegistrationRejectedReasonSchema`, `ReadinessRegistrationIntegrityFailedReasonSchema`, and `ReadinessReplayNotRecordedReasonSchema` are status-specific closed enums backed by their exported `READINESS_*_REASON_CODES` tuples. Successful result variants omit `reason`; rejected, integrity-failed, and not-recorded variants require a reason from their own set. Aliases such as `original-not-found`, case variants, typos, cross-operation reasons, and unknown future strings reject. The canonical missing-original replay reason is `original-transaction-not-found`.

Public integrity and recovery findings share the closed, redacted `READINESS_INTEGRITY_FINDING_CODES` inventory: `genesis-corrupt`, `genesis-initialization-incomplete`, `ledger-uninitialized`, `readiness-ledger-integrity-failure`, and `unsafe-filesystem-state`. These schemas reject arbitrary adapter errors, exception text, paths, URIs, and unknown diagnostic strings. Derived-index rebuild failure reasons are also closed by `READINESS_DERIVED_INDEX_REBUILD_FAILURE_REASON_CODES`; they remain an operational result taxonomy rather than an integrity-finding extension point.

## Usage

```typescript
import { KnowledgeObjectSchema, parseKnowledgeObject } from "@founderos/knowledge-schema";

const result = KnowledgeObjectSchema.safeParse(input);
const knowledgeObject = parseKnowledgeObject(input);
```

```typescript
import { KnowledgeMigrationManifestSchema } from "@founderos/knowledge-schema";

const manifest = KnowledgeMigrationManifestSchema.parse(input);
```

```typescript
import { KnowledgeQuerySchema, KnowledgeQueryResultSchema } from "@founderos/knowledge-schema";

const query = KnowledgeQuerySchema.parse(queryInput);
const result = KnowledgeQueryResultSchema.parse(resultInput);
```

```typescript
import {
  KnowledgeCandidateBatchSchema,
  type KnowledgeCandidateSource,
  type KnowledgeRepository,
} from "@founderos/knowledge-schema";

const batch = KnowledgeCandidateBatchSchema.parse(candidateBatchInput);
```

```typescript
import {
  KnowledgeGovernedChangeSetSchema,
  KnowledgeSnapshotApprovalWorkflowSchema,
  KnowledgeSnapshotComparisonEvidenceSchema,
  KnowledgeSnapshotComparisonRequestSchema,
  KnowledgeSnapshotLifecycleRecordSchema,
  KnowledgeSnapshotReviewDecisionSchema,
} from "@founderos/knowledge-schema";

const lifecycle = KnowledgeSnapshotLifecycleRecordSchema.parse(lifecycleInput);
const evidence = KnowledgeSnapshotComparisonEvidenceSchema.parse(evidenceInput);
const comparison = KnowledgeSnapshotComparisonRequestSchema.parse(comparisonInput);
const changeSet = KnowledgeGovernedChangeSetSchema.parse(changeSetInput);
const decision = KnowledgeSnapshotReviewDecisionSchema.parse(decisionInput);
const workflow = KnowledgeSnapshotApprovalWorkflowSchema.parse(workflowInput);
```

```typescript
import {
  CommittedRegistryTransactionEnvelopeSchema,
  SnapshotActivationRequestSchema,
  parseRegistryIntegrityResult,
  parseRegistryRecoveryResult,
  type DurableSnapshotRegistry,
} from "@founderos/knowledge-schema";

const envelope = CommittedRegistryTransactionEnvelopeSchema.parse(envelopeInput);
const activation = SnapshotActivationRequestSchema.parse(activationInput);
const integrity = parseRegistryIntegrityResult(integrityInput);
const recovery = parseRegistryRecoveryResult(recoveryInput);
```

```typescript
import {
  KnowledgeContextPackageSchema,
  KnowledgeContextRequestSchema,
} from "@founderos/knowledge-schema";

const request = KnowledgeContextRequestSchema.parse(requestInput);
const contextPackage = KnowledgeContextPackageSchema.parse(packageInput);
```

```typescript
import {
  ContextConsumerDescriptorSchema,
  GovernedContextDeliveryEnvelopeSchema,
  GovernedContextDeliveryRequestSchema,
} from "@founderos/knowledge-schema";

const consumer = ContextConsumerDescriptorSchema.parse(consumerInput);
const deliveryRequest = GovernedContextDeliveryRequestSchema.parse(requestInput);
const envelope = GovernedContextDeliveryEnvelopeSchema.parse(envelopeInput);
```

```typescript
import {
  AtomicDeliveryTransactionRequestSchema,
  DurableReplayAttemptRecordSchema,
  type DurableContextDeliveryLedger,
} from "@founderos/knowledge-schema";

const transaction = AtomicDeliveryTransactionRequestSchema.parse(transactionInput);
const replayAttempt = DurableReplayAttemptRecordSchema.parse(replayInput);
```

All schemas reject unknown fields so contract changes remain explicit and versioned.

## Milestone 17 execution authorization contracts

`authorization.ts` owns strict versioned contracts for externally verified Service Identity
evidence, human execution approval, exact `founder-decision-memo` Authorization Requests,
Authorization Decisions, permanent exact-attempt claims, ceilings, closed reason codes, and
operation results. Request identifiers reject credential-material markers, known OpenAI, Stripe,
GitHub, and Slack credential-value forms even when embedded, URI-scheme forms, and URL-like
material, and each Request binds the fixed processing tier `default`. The contracts contain logical Credential Reference
identity only and provide no credential, identity-provider, persistence, provider, transport, or
network capability.
