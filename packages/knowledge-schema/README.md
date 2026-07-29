# Knowledge schema

`@founderos/knowledge-schema` is the runtime-validation and TypeScript contract foundation for KnowledgeOS.

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
