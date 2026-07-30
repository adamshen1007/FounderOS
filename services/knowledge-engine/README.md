# Knowledge engine

The Milestone 02 and 03 foundations read one Markdown file or one explicitly selected directory, parse YAML frontmatter, normalize specification-style keys, validate through `@founderos/knowledge-schema`, and return deterministic file-level and aggregate migration reports.

Milestone 04 adds manifest-controlled corpus execution. It loads a strict YAML manifest, confines every read to one physical root, rejects symbolic links and unsafe paths, verifies canonical SHA-256 digests, enforces ready/approved lifecycle gates, creates schema-valid objects from canonical document content, and writes a deterministic report artifact.

Milestone 05 adds a pure, storage-free query boundary over an explicitly supplied set of validated Knowledge Objects. It validates the query and every candidate, rejects duplicate object IDs, applies exact filters and context constraints by intersection, and sorts results by object ID. Multi-value filters match any allowed value; tag filters explicitly support `all` or `any`. Project filters match an object's domain, a project object's ID or name, or a decision object's `relatedProjectIds`. Every result includes the object's unchanged source metadata as provenance.

Milestone 06 makes repository-backed querying the primary access flow. Candidate sources emit versioned batches; the in-memory repository revalidates them, rejects duplicate source or object identities, builds a deterministic in-memory collection, and returns independent validated copies. It provides identity lookup and candidate discovery without persistence or search intelligence. The Milestone 05 candidate-array function remains available as the compatibility filtering core.

Milestone 07 connects the approved Priority 1 corpus to that repository boundary. `KnowledgeCorpusCandidateSource` reuses the manifest-controlled migration workflow, rejects partially valid corpus states, preserves object provenance, and creates an immutable repository snapshot with a content-derived identity. `initializeCorpusKnowledgeRepository` exposes the unchanged repository query capability, while `compareKnowledgeRepositorySnapshots` reports deterministic corpus changes without performing refreshes.

Milestone 08 provides pure public lifecycle and approval-workflow operations for caller-supplied snapshots. `createKnowledgeSnapshotLifecycleRecord` and `validateKnowledgeSnapshotLifecycle` create immutable pre-review evidence; review, approval, rejection, and activation transitions are available only through the approval workflow, while `archiveKnowledgeSnapshotLifecycle` archives an already superseded baseline. `generateKnowledgeGovernedChangeSet` deterministically compares snapshots from the same corpus, accepts same-identity no-op comparisons, and explains manifest-, version-, snapshot-, and object-level changes using separate comparison evidence so the Milestone 07 snapshot identity remains compatible. Each evidence record includes the canonical validated Knowledge Object; the engine recomputes and verifies its metadata, whole-object, and non-metadata content digests before comparison or workflow progression. `initializeKnowledgeSnapshotApprovalWorkflow` rejects no-op proposals and binds a matching active baseline, a validated proposal, and their evidence. Approval and rejection record immutable decisions tied to the change set and proposed snapshot. Activation atomically returns the old baseline as `superseded` and the proposal as `active`.

## Milestone 09 durable registry

Milestone 09 adds a governed application facade and a replaceable local file-backed adapter for durable snapshot governance. `openGovernedDurableSnapshotRegistry` exposes state-specific registration, change-set, validation, review, human approval or rejection, activation, archival, history, recovery, integrity, and derived-index operations. Before the first await, every public mutation captures only own enumerable data properties from a plain or null-prototype input into a new null-prototype object, defensively clones, strictly parses, and deeply freezes the captured values. The reserved `__proto__` key and all accessors are rejected synchronously. Registration captures and validates the exact raw manifest-evidence descriptor value, so an accessor cannot switch values and no writer is acquired for an invalid input. Internal writer sessions, storage, hooks, and commit helpers are ECMAScript-private and absent from the built prototype. Later caller mutation cannot alter the committed intent. Every mutation then acquires the exclusive writer lock before reading verified state and retains it through precondition validation, record construction, and commit. Registration persists a finite, plain, acyclic canonical-JSON migration manifest and its reference. Approved entries in `ready` or `migrated` state must exactly match the snapshot descriptor set by object ID, object type, source path, and source hash. The engine recomputes the evidence's SHA-256 commitment with a dedicated strict canonical-JSON serializer before record construction and during replay, and rejects a false digest or fully re-signed evidence substitution. Record, envelope, and derived-index verification accepts only canonical JSON primitive leaves, hashes the exact raw canonical representation before schema normalization, normalizes serializer failures to stable domain errors, and requires the parsed representation to remain canonically equivalent. Record builders descriptor-capture and strictly parse first, then omit only schema-accepted explicit `undefined` object properties before fingerprinting; undefined or sparse array positions and every other unsupported value still fail. Raw persisted records never receive this builder-only compatibility projection. The existing canonical fingerprint serializer remains byte-compatible with Milestones 07 and 08, including omission of `undefined` object properties and its historical array behavior. These checks do not alter the Milestone 07 snapshot contract or identity. Activation uses compare-and-swap against the active snapshot recovered under that lock, commits the candidate activation, optional prior-baseline supersession, and audit record in one envelope, and returns a rejected result without authoritative changes when evidence or state preconditions fail.

The governed facade depends on an engine-internal storage/writer port rather than the local filesystem implementation; an in-memory conformance integration exercises registration, lifecycle, review, activation, readers, recovery, integrity, and index delegation through that boundary. The package root does not export the port, replay kernel, canonical record/envelope builders, raw append capability, internal storage, writer session, layout helper, fault hooks, or direct-module adapter test factory. The narrower `LocalFileDurableSnapshotRegistry.open()` export supports immutable registration plus verified reads, recovery, integrity, and index operations; it cannot persist lifecycle, decision, or activation transitions. Governed callers should use `openGovernedDurableSnapshotRegistry`.

### Runtime layout and authority

Both local facades require an existing absolute `allowedParentRoot` and an absolute `runtimeRoot` that is a strict descendant. The implementation creates this fixed layout below `runtimeRoot`:

```text
knowledge-registry/
├── commit-head.json
├── committed/
│   └── <first-sequence>-<last-sequence>-<envelope-fingerprint>.json
├── staging/
│   ├── .<operation>.<random-id>.tmp
│   └── .orphan.<random-id>.<envelope-file>
├── locks/
│   └── writer.lock
└── derived/
    └── active-index.json
```

Sequence bounds in committed envelope names are zero-padded to 16 digits and the envelope fingerprint is a lowercase 64-character SHA-256 digest. The authoritative state is the canonical, fingerprinted `commit-head.json` together with exactly the immutable envelopes in `committed/` bounded by that marker. The marker binds the transaction and record counts, last audit sequence, record-chain head, complete-history integrity fingerprint, and last envelope name and fingerprint. `staging/`, suffix envelopes beyond the marker, `locks/writer.lock`, and `derived/active-index.json` are never governance authority. Active state and all histories are derived by verifying and replaying marker-bounded envelopes; the active index is only a rebuildable cache.

### Commit, locking, and crash assumptions

A writer creates and flushes a canonical envelope in `staging/`, atomically renames it to its deterministic immutable name in `committed/`, and flushes the committed directory. This is preparation, not commitment. It then creates and flushes the next marker in `staging/`. Atomic replacement of the fixed `commit-head.json` is the authoritative commit point, after which the runtime directory is flushed. A crash before marker replacement recovers the previous state and leaves any installed suffix envelope non-authoritative; a later different write moves such suffix orphans to `staging/` quarantine. A crash after marker replacement requires the referenced envelope and its complete coordinates to verify and recover as committed.

The protocol assumes staging, committed, derived, locks, and the marker are on one filesystem with atomic rename and file flush support. Directory flush is attempted and only errors that explicitly mean directory sync is unsupported are suppressed; real I/O failures propagate. If marker replacement succeeds but its directory flush reports failure, the write call can fail even though restart recovery correctly treats the marker-bounded transaction as committed. Canonical fingerprints do not include machine paths. The unkeyed local marker and audit chain detect accidental corruption and partial deletion while the marker remains, but not a coordinated privileged rewrite, re-signing, or deletion of both the complete history and marker.

`locks/writer.lock` is acquired exclusively for each mutation and released only after the short-lived writer session is invalidated. The adapter never guesses that an existing lock is stale and never breaks it automatically. After a process crash, an operator must first establish that no writer is alive and then explicitly remove only `<runtimeRoot>/locks/writer.lock`; ordinary lock conflicts should not be repaired by deleting the file.

### Recovery, integrity, and repair APIs

There is no Milestone 09 registry repair CLI. Use the public APIs:

```typescript
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { openGovernedDurableSnapshotRegistry } from "@founderos/knowledge-engine";

const allowedParentRoot = resolve(".founderos/runtime");
await mkdir(allowedParentRoot, { recursive: true, mode: 0o700 });

const registry = await openGovernedDurableSnapshotRegistry({
  allowedParentRoot,
  runtimeRoot: resolve(allowedParentRoot, "knowledge-registry"),
});

const integrity = await registry.verifyIntegrity();
const recovery = await registry.recover();
const indexStatus = await registry.inspectDerivedIndex();

if (integrity.status === "valid" && indexStatus.status !== "current") {
  await registry.rebuildDerivedIndex();
}
```

`verifyIntegrity()` verifies the full marker-bounded audit chain and returns a valid or invalid authoritative summary. `recover()` returns the independently replayed registry status, registered-snapshot, lifecycle-transition, decision, activation, transaction, and record counts, integrity coordinate, and active snapshot ID only when recovery succeeds; failure results expose the exact completely verified prefix and no active identity. If a marker-referenced tail envelope is missing, an earlier semantic replay failure remains authoritative and retains that exact prefix rather than being replaced by empty progress. Both operations inspect the stored active index against that exact replay and return `derivedIndexStatus` plus `derivedIndexIssues`. A missing, stale, invalid, or fingerprint-mismatched index does not corrupt authoritative status and is never repaired implicitly. `inspectDerivedIndex()` distinguishes `missing`, `current`, `stale`, and `invalid`, and only `rebuildDerivedIndex()` replaces that derived cache after authoritative history verifies. Deterministic results and thrown index-operation domain errors map authoritative reads, derived reads and writes, and other filesystem failures to stable codes and logical operation messages without raw Node.js text, usernames, checkout locations, temporary roots, or absolute runtime paths. After open, storage-topology and managed-entry safety failures are structured invalid or failed integrity/recovery results; path exceptions remain part of open and configuration validation. Authoritative corruption, missing records, marker mismatch, broken fingerprints or links, contradictory lifecycle evidence, and incomplete transactions always fail closed and are never silently skipped, overwritten, or rebuilt. Quarantined staging orphans may accumulate and are non-authoritative; cleanup is an explicit operator maintenance action.

### Path and scope boundaries

The adapter rejects relative roots, lexical traversal, runtime roots outside the allowed parent, symlinked components or leaves, physical escape, non-regular managed entries, cross-device runtime layouts, and any lexical or physical overlap between the runtime and canonical `docs` or `knowledge` sources. The allowed parent may contain both runtime and source trees, but the runtime can be neither inside a source root nor an ancestor containing one. This bidirectional check runs before runtime directories or the commit marker are created and applies to configured and auto-discovered source roots. For an existing planned runtime, auto-discovery recursively checks physical directory names at any depth without following symlinks; deterministic depth, directory, and entry limits fail closed before mutation. Regular managed envelope files are ignored by that directory-only discovery, so a legitimate registry can reopen. The adapter captures and rechecks device, inode, path, and realpath identities around critical operations and uses no-follow reads for leaf files. Callers may provide `canonicalSourceRoots` when repository source roots cannot be discovered. Node.js does not provide portable descriptor-relative `openat(2)` traversal, so these checks assume a cooperative local administrator and do not claim safety against a privileged process racing ancestor replacement between checks.

Milestone 09 deliberately defers database and object-store adapters, distributed locks and transactions, hostile local concurrency guarantees, remote coordination, replication, automatic corpus refresh or synchronization, watchers, event streaming, semantic retrieval and ranking, embeddings, vector or graph persistence, agents, Hermes, MCP, integrations, and UI workflows.

## Milestone 10 governed context assembly

`assembleGovernedKnowledgeContext` is the public context boundary. It strictly parses the request, verifies and recovers the durable registry, captures one immutable active registration, re-verifies that registration's canonical record fingerprint, manifest-to-snapshot binding, manifest fingerprint, and Milestone 07 content fingerprint, obtains candidates only through the supplied Knowledge Repository, and proves that the complete repository snapshot and every candidate match the active snapshot descriptors before query execution and packaging. Integrity/recovery disagreement, missing active state, registry/manifest/repository mismatch, or candidate drift fails closed.

Selection reuses the Milestone 05 exact query and Milestone 06 repository contracts. Required IDs, required types, preferred types, lifecycle/governance priority, object type, project/domain identity, and object ID form the versioned deterministic order; binary string comparison avoids locale and caller-order dependence. Conflicting duplicate IDs fail, while canonically equivalent duplicates are represented once with omission evidence. Required knowledge is never silently omitted.

The authoritative budget measures object count and Unicode code points in the canonical serialized Knowledge Object. Optional per-object limits use the same representation. Truncation is opt-in, works on Unicode code-point boundaries, never mutates source objects, and records original/included counts and fingerprints. Every filtered, duplicate, over-budget, and truncated candidate receives stable evidence. Successful empty context is possible only when the request explicitly permits it.

`verifyKnowledgeContextPackage` is a pure verifier supplied with the package, trusted active registry/snapshot bindings, and repository candidates. It recomputes request, query, query-result, included-content, object, provenance, budget, ordering, evidence, and final context fingerprints and reproduces the assembly result. The optional caller evidence timestamp is preserved but excluded from context identity, so identical governed inputs produce byte-identical packages. Context packages are audit artifacts, not prompts; no LLM, tokenizer, agent, authorization, or semantic-ranking behavior is present.

## Milestone 11 governed Context Consumer delivery

`deliverGovernedKnowledgeContext` is the only exported delivery operation. It accepts one strict Delivery Request, one Context Package, caller-supplied policy-decision evidence, the delivery-specific `GovernedHistoricalSnapshotRegistry`, a Knowledge Repository and matching repository snapshot, an explicit canonical evaluation timestamp, and a caller-owned `BoundedContextDeliveryIdempotencyStore`. It captures every top-level input field through own data-property descriptors before reading values, obtains candidates only from the repository, and independently verifies the complete Milestone 10 package, registered snapshot, activation evidence, and repository binding before evaluating Consumer capabilities, the allowed policy outcome, freshness, historical replay, and idempotency. Policy evidence must bind the exact canonical Delivery Request. A historical package additionally requires `verifyIntegrityAtSequence` and `recoverAtSequence` to derive matching valid integrity and active-state evidence for its exact committed registry prefix; the verifier never fabricates historical recovery state. These prefix operations extend, rather than alter, the Milestone 09 base registry contract. The operation never accepts raw candidate arrays, Query Results, corpus paths, prompts, provider configuration, credentials, or hidden context.

Successful delivery returns a deeply immutable envelope containing the exact Context Package plus deterministic compatibility, policy, freshness, replay-policy, and active-snapshot evidence, followed by a bound acknowledgment and initial-delivery receipt. Preflight rejection returns deterministic governed attempt evidence without pretending an envelope reached a Consumer. Same-key identical replay returns the exact original result for permitted modes and records separate Replay Evidence that binds the current policy and freshness evaluations to the original envelope and receipt; conflicting reuse and single-delivery replay fail. Policy and freshness are revalidated before replay lookup. Artifact verifiers require their authoritative request, candidate, registry, current-state, envelope, acknowledgment, or receipt inputs and reproduce the claimed artifact instead of trusting a self-consistent fingerprint. The initial store has explicit finite FIFO retention and no public mutation surface; it proves replaceable local behavior, not durable or distributed idempotency.

```typescript
import {
  BoundedContextDeliveryIdempotencyStore,
  deliverGovernedKnowledgeContext,
} from "@founderos/knowledge-engine";

const delivery = await deliverGovernedKnowledgeContext({
  request: deliveryRequest,
  contextPackage,
  policyDecisionEvidence,
  registry,
  repository,
  repositorySnapshot,
  idempotencyStore: new BoundedContextDeliveryIdempotencyStore(1_000),
  evaluatedAt: "2026-07-29T12:00:00.000Z",
});
```

Milestone 11 does not authenticate callers, define authorization rules, invoke a model, execute reasoning, run an agent, persist delivery state, or add provider, Hermes, MCP, integration, or UI behavior.

## Milestone 12 durable Context Delivery Ledger

`openLocalFileDurableContextDeliveryLedger` opens the governed Milestone 12 boundary. `commitVerifiedOriginalDelivery` first requires the complete Milestone 11 Envelope verification inputs and independently verifies the Request, Consumer, Context Package identity, Policy evidence, compatibility, Freshness evidence, Envelope, Acknowledgment, and Receipt. It then acquires one writer lock, replays the authoritative Ledger, checks the expected head and permanent idempotency owner, and commits the exact original artifact set in one immutable transaction event. Identical transaction retries and identical key retries return the original result; conflicting identity reuse fails.

Each Replay Attempt is a new audit event. Current Policy and Freshness evidence is independently fingerprint-checked and stored separately. Accepted repeatable replay returns the exact original Envelope, Acknowledgment, and Receipt; single-delivery, expired, policy-denied, freshness-denied, conflict, and evaluation-only attempts never rewrite the original result. Expired keys remain permanently reserved.

The local adapter uses this Git-ignored layout:

```text
.founderos/runtime/context-delivery-ledger/
├── commit-head.json
├── transactions/
├── replay-attempts/
├── staging/
├── derived/
└── .writer.lock
```

An event file is prepared and flushed before atomic installation. Installation is not the commit point. Atomic replacement of the separately fingerprinted `commit-head.json` commits the exact event-bounded prefix. A pre-head crash leaves the prior committed state; a post-head crash requires the complete referenced event. Staging data and suffix orphans are ignored. Recovery recomputes every embedded Milestone 11 fingerprint, durable wrapper fingerprint, transaction fingerprint, event fingerprint, sequence, previous link, and global binding. Derived indexes are non-authoritative and rebuilt only through the explicit API. Their `bounded-latest-v1` policy retains at most the latest 1,024 records in each lookup category; governed reads replay the complete authoritative history, so index retention cannot erase ownership or audit evidence.

The adapter requires an absolute dedicated child of `<repositoryRoot>/.founderos/runtime`, rejects runtime/source overlap in both directions, traversal, symlinks, nested protected trees, runtime identity replacement, unsafe entry types, and resource-limit breaches before mutation. Public results and normalized failures contain only logical locations. The adapter assumes cooperative local administration, one writer, same-filesystem atomic rename, and supported file flushing. It does not provide hostile privileged-filesystem protection, distributed locking, remote consensus, coordinated rollback detection, archival, or destructive compaction.

```typescript
import { openLocalFileDurableContextDeliveryLedger } from "@founderos/knowledge-engine";

const ledger = await openLocalFileDurableContextDeliveryLedger({
  repositoryRoot,
  runtimeRoot: `${repositoryRoot}/.founderos/runtime/context-delivery-ledger`,
  canonicalSourceRoots: [`${repositoryRoot}/docs`, `${repositoryRoot}/knowledge`],
});

const result = await ledger.commitVerifiedOriginalDelivery({
  transaction,
  envelopeVerification,
});
```

Milestone 12 does not invoke a provider or LLM, execute prompts, run Agents or Hermes, call MCP, implement authentication or authorization, add semantic retrieval, or introduce a database.

## Milestone 13 governed reasoning invocation

`invokeGovernedReasoning` is the only public execution path. It accepts an exact Milestone 12 transaction identity and the Durable Delivery Ledger, independently recovers and verifies that Ledger, resolves the authoritative transaction, and verifies the Request registration, permanent idempotency owner, Envelope, Acknowledgment, Receipt, Context Package, Consumer, Policy, Freshness, Active Snapshot, and Registry bindings before accepting an Invocation. It then verifies provider-neutral input and policy fingerprints, performs deterministic capability matching, registers Invocation ownership, appends immutable ordered Attempts and Outcomes, independently verifies the terminal Result Envelope, and atomically finalizes Consumption Evidence.

Milestone 13 instantiates exactly one executor: a deterministic fake provider. Its explicit fixture modes cover structured and empty success, transient and permanent failure, timeout, three cancellation phases, output overflow, malformed and contradictory outcomes, and physical-path or credential-bearing output. The adapter has no Repository, corpus, environment, credential, network, random, implicit-clock, tool, Agent, Hermes, or MCP dependency. Unsafe or malformed output is normalized into sanitized failure evidence before persistence.

`openLocalFileGovernedReasoningExecutionEvidence` opens the local append-only execution-evidence runtime. Its public value exposes only verified reads, recovery, integrity verification, and derived-index rebuild; ownership registration, Attempt append, Outcome append, and finalization remain inaccessible outside the governed Invocation facade. The ownership envelope commits the exact Invocation Request, selected Provider Capability, and delivered Context Package object count under a separate rolling authority fingerprint in the atomic head. Result construction, finalization, recovery, and integrity verification independently reconstruct Receipt, Usage, deterministic-fake Cost, complete Attempt/Outcome history, full execution span, transaction identity, and terminal evidence from that authority. The complete explicit Attempt schedule is validated before ownership. Deadline and cancellation signals are execution controls with deterministic precedence: cancellation observed before execution wins first, explicit deadline cancellation wins at the deadline, an expired execution deadline then wins over cooperative cancellation, and cooperative cancellation applies only while the deadline remains live. An observed terminal control cannot become success, and pre-execution cancellation skips Provider execution. Authoritative events use expected-head compare-and-swap, a single-writer lock, fingerprinted atomic commit markers, immutable event envelopes, file sync, and containing-directory sync. The adapter rejects accessor-backed options, symlinked runtime parents/root/managed directories, and physical confinement changes around writes while normalizing filesystem failures to path-private logical errors. Writer settlement preserves a primary governed-operation error if cleanup also fails; without a primary error, handle-close failure precedes lock-removal failure, and every cleanup failure is normalized before crossing the public boundary. Staging and uncommitted suffix files are ignored; missing, malformed, invalid, or oversized derived indexes remain non-authoritative and cannot block authoritative replay; authoritative corruption fails closed.

```typescript
import {
  invokeGovernedReasoning,
  openLocalFileGovernedReasoningExecutionEvidence,
} from "@founderos/knowledge-engine";

const executionEvidence = await openLocalFileGovernedReasoningExecutionEvidence({
  repositoryRoot,
  runtimeRoot: `${repositoryRoot}/.founderos/runtime/reasoning-execution-ledger`,
  canonicalSourceRoots: [`${repositoryRoot}/docs`, `${repositoryRoot}/knowledge`],
});

const finalized = await invokeGovernedReasoning({
  deliveryLedger,
  executionEvidence,
  deliveryIdentity,
  invocationRequest,
  fixtureMode: "successful-structured-response",
  attemptSchedule,
});
```

The local adapter remains a cooperative single-process runtime. It does not provide a production model, provider selection, credentials, streaming, tools, distributed coordination, remote persistence, authentication, authorization, or Agent execution.

```typescript
import {
  assembleGovernedKnowledgeContext,
  verifyKnowledgeContextPackage,
} from "@founderos/knowledge-engine";

const result = await assembleGovernedKnowledgeContext({
  request,
  registry,
  repository,
  repositorySnapshot,
});

if (result.status === "assembled") {
  const verification = verifyKnowledgeContextPackage({
    package: result.package,
    candidateInputs: await repository.getCandidates(),
    bindings,
  });
}
```

```typescript
import { queryKnowledgeObjects } from "@founderos/knowledge-engine";

const result = queryKnowledgeObjects(query, candidateObjects);
```

```typescript
import {
  InMemoryKnowledgeCandidateSource,
  InMemoryKnowledgeRepository,
  queryKnowledgeRepository,
} from "@founderos/knowledge-engine";

const source = new InMemoryKnowledgeCandidateSource(sourceDescriptor, candidateObjects);
const repository = await InMemoryKnowledgeRepository.create([source]);
const result = await queryKnowledgeRepository(query, repository);
```

```typescript
import { initializeCorpusKnowledgeRepository } from "@founderos/knowledge-engine";

const { repository, snapshot, snapshotComparisonEvidence } =
  await initializeCorpusKnowledgeRepository({
    rootPath: process.cwd(),
    manifestPath: "knowledge/migration-manifest.yaml",
    corpusVersion: "priority-1-v1",
    createdAt: "2026-07-28T00:00:00Z",
    createdBy: "knowledge-engine",
  });
```

```typescript
import {
  activateKnowledgeSnapshotApprovalWorkflow,
  approveKnowledgeSnapshotApprovalWorkflow,
  beginKnowledgeSnapshotApprovalReview,
  createKnowledgeSnapshotLifecycleRecord,
  initializeKnowledgeSnapshotApprovalWorkflow,
  validateKnowledgeSnapshotLifecycle,
} from "@founderos/knowledge-engine";

// The active snapshot, comparison evidence, and active lifecycle come from the
// preceding approved workflow. The proposal is a newer snapshot of the same corpus.
const proposedValidated = validateKnowledgeSnapshotLifecycle(
  createKnowledgeSnapshotLifecycleRecord(proposedSnapshot),
  proposedSnapshot,
  { actorId: "validator", transitionedAt: "2026-07-28T00:01:00.000Z" },
);
const workflow = initializeKnowledgeSnapshotApprovalWorkflow({
  activeSnapshot,
  activeSnapshotEvidence,
  activeSnapshotLifecycle,
  proposedSnapshot,
  proposedSnapshotEvidence,
  proposedSnapshotLifecycle: proposedValidated,
});
const reviewing = beginKnowledgeSnapshotApprovalReview(workflow, {
  actorId: "reviewer",
  transitionedAt: "2026-07-28T00:02:00.000Z",
});
const approved = approveKnowledgeSnapshotApprovalWorkflow(reviewing, {
  actorId: "approver",
  decidedAt: "2026-07-28T00:03:00.000Z",
  reason: "The source, provenance, and impact were reviewed.",
});
const activated = activateKnowledgeSnapshotApprovalWorkflow(approved, {
  actorId: "activator",
  transitionedAt: "2026-07-28T00:04:00.000Z",
});

// `activated.activeSnapshotLifecycle` is superseded and
// `activated.proposedSnapshotLifecycle` is active.
```

From the repository root:

```bash
pnpm knowledge:migrate
```

Directory ingestion is recursive, Markdown-only, stable in path order, and does not follow symbolic links. Repository access remains an immutable in-memory snapshot; Milestone 09 durably stores governed snapshot and audit evidence, not query candidates or a general knowledge database. Milestone 08 lifecycle and approval workflows remain pure in-memory APIs, while the Milestone 09 governed registry is the explicit persistence boundary. Neither path synchronizes, automatically approves, or automatically activates a snapshot. Snapshot comparison detects changes but does not synchronize them. Querying remains deterministic exact filtering—not full-text search, semantic retrieval, ranking, or authorization. The implementation does not watch a vault or implement embeddings, graph storage, Hermes, agents, or MCP integrations.
