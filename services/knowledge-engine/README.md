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
