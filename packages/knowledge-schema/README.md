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

Milestone 08 adds strict lifecycle, governed comparison, change-set, review-decision, and approval-workflow contracts without changing the Milestone 07 snapshot object or its content-derived identity. `KnowledgeSnapshotComparisonEvidenceSchema` carries the additional per-object content fingerprints needed for governed comparison. `KnowledgeSnapshotLifecycleRecordSchema` validates ordered lifecycle evidence from `created` through `archived`, including the invariant that transitions occur after snapshot creation. `KnowledgeSnapshotComparisonRequestSchema` accepts snapshots from one corpus, including same-identity comparisons that yield an empty change set. `KnowledgeGovernedChangeSetSchema` preserves deterministic snapshot-, manifest-, version-, and object-level evidence. `KnowledgeSnapshotApprovalWorkflowSchema` binds the active baseline and proposed snapshot, their lifecycle records, the governed change set, review status, and immutable approval or rejection evidence. These schemas define validation contracts only: the package contains no lifecycle orchestration, review behavior, activation behavior, persistence, or automation.

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

All schemas reject unknown fields so contract changes remain explicit and versioned.
