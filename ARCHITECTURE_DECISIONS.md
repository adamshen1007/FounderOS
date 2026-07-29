# FounderOS Architecture Decisions

This ledger records repository-level decisions. Feature-level decisions should move to dedicated ADR files when implementation begins.

## ADR-0001: Use a pnpm TypeScript monorepo

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** FounderOS requires independently evolvable applications, services, integrations, and shared contracts with consistent engineering controls.
- **Decision:** Use a pnpm workspace with strict TypeScript as the primary engineering environment.
- **Consequences:** Shared standards and atomic changes are easier; package boundaries and dependency direction must be actively enforced as implementation begins.

## ADR-0002: Separate repository responsibilities by architectural layer

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** The system specification separates interaction, services, shared contracts, integrations, infrastructure, documentation, and formal specifications.
- **Decision:** Establish `apps/`, `services/`, `packages/`, `integrations/`, `infrastructure/`, `docs/`, `specs/`, `tests/`, and `scripts/` as top-level boundaries.
- **Consequences:** Applications may depend on services and services on packages; packages must not depend on services, and services must not depend on applications.

## ADR-0003: Preserve bootstrap specifications as canonical source documents

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** The bootstrap documents are the official FounderOS specification and must remain traceable.
- **Decision:** Relocate each document unchanged into its matching `docs/` domain and provide a root documentation index. Do not duplicate the source corpus.
- **Consequences:** Links use canonical repository locations; future amendments must preserve version history and distinguish specification changes from implementation notes.

## ADR-0004: Keep Milestone 00 product-free

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** The milestone explicitly excludes Hermes, KnowledgeOS, agent runtime, MCP connectors, databases, and UI implementation.
- **Decision:** Create documented boundaries and repository verification only. Defer product packages and service source trees until approved milestones define their contracts.
- **Consequences:** The repository is buildable and testable without implying that any product capability exists.

## ADR-0005: Use explicit runtime schemas for KnowledgeOS contracts

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** KnowledgeOS objects cross human-authored Markdown, TypeScript services, future persistence layers, and agent context boundaries. Compile-time types alone cannot validate those external inputs.
- **Decision:** Implement the shared knowledge contract with strict Zod schemas and inferred TypeScript types in `@founderos/knowledge-schema`. Use camel-case fields at the TypeScript boundary, preserve source provenance in every metadata record, and reject undocumented fields. Model `draft`, `review`, `active`, `archived`, and `deprecated` as persistent knowledge states; represent creation and modification as timestamps.
- **Consequences:** Runtime and compile-time contracts remain synchronized, invalid inputs fail at the boundary, and schema evolution must be explicit. Markdown/frontmatter adapters will need to translate specification-style field names into this canonical TypeScript model. Zod becomes the package's only runtime dependency.

## ADR-0006: Preserve source Markdown through a read-only ingestion boundary

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** KnowledgeOS must transform founder-owned Markdown into canonical objects without making AI-derived edits to the human source of truth. Frontmatter uses specification-style keys while the TypeScript contracts use camel case.
- **Decision:** Implement single-file ingestion in `@founderos/knowledge-engine`. Parse YAML 1.2 with the dependency-free `yaml` library, normalize keys recursively, validate through `@founderos/knowledge-schema`, and return accepted or rejected reports with source path, byte length, and SHA-256 evidence. Never rewrite the input file.
- **Consequences:** Source provenance is deterministic and validation errors are actionable. Canonical object creation remains separate from vault crawling, persistence, retrieval, graph storage, and agents. Official documents can remain immutable while frontmatter-enabled fixture copies validate the mapping contract.

## ADR-0007: Make migration batches deterministic and conflict-intolerant

- **Status:** Accepted
- **Date:** 2026-07-27
- **Context:** A migration dry run must process multiple founder-selected files without hiding invalid inputs, reading outside the selected boundary, or producing machine-dependent output.
- **Decision:** Recursively ingest regular Markdown files from one explicit directory in stable relative-path order, never follow symbolic links, and return a deterministic aggregate report. Reject every member of duplicate object-ID or source-hash sets so accepted objects have unique identity and source content.
- **Consequences:** Migration reports are reproducible and safe to review before persistence. Directory ingestion remains an explicit, read-only operation rather than a vault crawler, watcher, scheduler, or storage system.

## ADR-0008: Materialize the core corpus through a reviewed manifest

- **Status:** Accepted
- **Date:** 2026-07-28
- **Context:** Milestone 03 proved deterministic directory ingestion with derived fixtures, but the complete Priority 1 corpus needs a controlled contract that detects source drift and preserves human review without modifying or duplicating canonical specifications.
- **Decision:** Use a strict, versioned YAML manifest to bind each knowledge object ID and type to one canonical source path, logical `knowledge/` destination, expected SHA-256 digest, schema metadata, migration status, and review status. Execute the manifest within one physical repository root, reject traversal and symbolic links, and materialize validated objects only in a deterministic report artifact.
- **Consequences:** The eight Priority 1 documents become reproducibly auditable without adding persistence or changing canonical Markdown. Manifest hashes must be deliberately updated when approved source documents change, and report content is a normalized schema representation rather than a byte-for-byte source replica.

## ADR-0009: Establish deterministic queries before retrieval infrastructure

- **Status:** Accepted
- **Date:** 2026-07-28
- **Context:** Future agents and retrieval services need a stable, provenance-preserving way to select validated Knowledge Objects, but Milestone 05 excludes storage engines, semantic search, ranking, and agent integration.
- **Decision:** Define strict query and result contracts in `@founderos/knowledge-schema` and execute them as a pure operation in `@founderos/knowledge-engine` over a caller-supplied candidate set. Apply exact-match filters and declarative context constraints by intersection, reject invalid or duplicate candidates, sort returned objects by ID, and copy source metadata into each result's provenance record.
- **Consequences:** Query behavior is auditable, deterministic, and independently testable against the Priority 1 corpus. Callers remain responsible for supplying candidates, context constraints do not confer authorization, project matching is limited to documented object fields, and semantic relevance or ranking requires a future architecture decision.

## ADR-0010: Separate candidate provision from deterministic knowledge access

- **Status:** Accepted
- **Date:** 2026-07-28
- **Context:** Milestone 05 requires callers to assemble candidate arrays directly. Future filesystems, databases, and external providers need a stable access boundary, but Milestone 06 excludes durable persistence, external integrations, and retrieval intelligence.
- **Decision:** Define versioned candidate-source batches and asynchronous repository interfaces in `@founderos/knowledge-schema`. Implement a validated in-memory candidate source and immutable repository snapshot in `@founderos/knowledge-engine`. Candidate sources provide objects and source provenance; repositories revalidate, reject duplicate identities, sort observable results, and supply candidates to the existing query filter through a repository-backed application service.
- **Consequences:** Query execution no longer needs to know how candidates were obtained, and future providers can implement the same asynchronous contract. The in-memory repository is rebuilt from its sources, carries no durability or update semantics, and deliberately performs no ranking, semantic selection, or authorization.

## ADR-0011: Materialize approved corpus access as immutable content-addressed snapshots

- **Status:** Accepted
- **Date:** 2026-07-28
- **Context:** Milestone 06 proves repository-backed querying with manually supplied candidates, but future context assembly needs to identify exactly which approved corpus state supplied a result without coupling queries to files or introducing persistence.
- **Decision:** Implement an engine-owned corpus candidate source that delegates canonical reads, approval gates, path safety, source hashes, and object validation to the Milestone 04 migration workflow. Materialize its accepted objects through the existing in-memory repository and create a schema-validated, deeply immutable snapshot whose identity is derived from corpus version, manifest reference, and deterministic per-object fingerprints. Compare snapshots through a pure, sorted change-set contract.
- **Consequences:** The Priority 1 corpus can be queried through the existing repository abstraction with traceable, reproducible knowledge-state identity. Creation metadata does not alter content identity. Change detection is observable but inert: durable storage, automatic refresh, watchers, synchronization, retrieval intelligence, and agent integration remain future decisions.

## ADR-0012: Govern immutable snapshots through deterministic lifecycle evidence

- **Status:** Accepted
- **Date:** 2026-07-28
- **Context:** Milestone 07 provides immutable, content-addressed snapshots and deterministic comparison, but controlled knowledge evolution also needs explicit lifecycle and human-review evidence without introducing durable workflow infrastructure.
- **Decision:** Preserve the Milestone 07 snapshot contract and content-derived identity, and carry Milestone 08 per-object content fingerprints in separate comparison evidence. Bind that evidence to the canonical validated Knowledge Object payload, and have the engine verify its metadata, whole-object, and non-metadata content digests against the snapshot descriptor before comparison or workflow progression. Immutable snapshots advance through validated lifecycle operations and human-approved governed change sets. Same-identity comparison is a valid no-op, while workflow initialization requires a material governed change. Review and activation states are reachable only through the workflow, which binds immutable approval or rejection evidence to the proposed snapshot and change set. Successful activation atomically returns the previous baseline as superseded and the proposal as active. `@founderos/knowledge-schema` owns the contracts; `@founderos/knowledge-engine` owns pure orchestration over them.
- **Consequences:** Snapshot compatibility, lifecycle history, comparison evidence, review decisions, and activation outcomes are reproducible, immutable, and independently testable. Callers must supply valid snapshots, separate matching comparison evidence, transition evidence, an active baseline lifecycle, and a validated proposed lifecycle; no state is retained between calls. Durable workflow storage, authorization, notifications, automatic synchronization or activation, background processing, and audit integrations remain deferred.

## ADR-0013: Persist governed snapshot state through ordered atomic audit envelopes

- **Status:** Accepted
- **Date:** 2026-07-28
- **Context:** Milestone 08 produces immutable snapshot, lifecycle, change-set, review-decision, and activation evidence in memory. Milestone 09 must make that evidence durable and independently recoverable without coupling shared contracts to a filesystem, database, vendor transaction model, or retrieval technology. The first activation also has no active baseline, while the Milestone 08 governed change-set contract requires one.
- **Decision:** Keep strict, versioned, storage-independent durable registry contracts in `@founderos/knowledge-schema`, while `@founderos/knowledge-engine` owns canonical serialization, fingerprint recomputation, replay, integrity verification, and governed orchestration. The governed facade depends on an engine-internal storage/writer port for verified reads, exclusive atomic envelope append, recovery, integrity, and derived-index operations; filesystem locks, fault hooks, and physical persistence remain local-adapter concerns. Store governance history as explicitly sequenced, fingerprint-linked, append-only audit records in complete immutable transaction envelopes. For the local adapter, installing an envelope is preparation rather than commitment: stage the complete envelope on the runtime filesystem, flush its file, atomically install it under a deterministic immutable name, and flush the committed-envelope directory before preparing the commit head. The authoritative commit point is atomic replacement of one fixed, separately canonicalized and fingerprinted commit-head marker after its file is flushed. That marker binds the complete committed transaction count, record count, audit sequence, record-chain head, full-history integrity fingerprint, and last-envelope identity. Flush the marker directory after replacement; suppress only explicitly unsupported directory-sync errors and propagate real I/O failures. Envelopes wholly beyond the marker are uncommitted crash orphans, never replay inputs, and are quarantined before a later write. Scope the initial adapter to one explicit cooperative local writer and use optimistic compare-and-swap against recovered active-snapshot identity for activation. Recover state only by verifying the strict marker, its exact marker-bounded envelope set, and complete replay; reject corrupted, missing, reordered, incomplete, contradictory, or coordinate-mismatched history, and derive active state from verified activations. Any cached active pointer or summary index is non-authoritative and rebuildable. Model the no-baseline first activation with a separate versioned bootstrap change-set evidence contract rather than weakening the Milestone 08 change-set. Assume atomic same-filesystem rename, file flush support, explicit operator handling of crash-orphaned writer locks, and a cooperative single-writer/local-administrator threat model. Node.js lacks portable descriptor-relative `openat(2)` traversal, so the adapter rechecks physical directory identity around critical operations and uses no-follow leaf reads, but does not claim protection from a malicious privileged process concurrently replacing directory ancestors between checks.
- **Consequences:** Registration, lifecycle, decision, and activation history can be verified and recovered without process memory; activation effects become all-or-nothing, stale writers fail without committed changes, and deletion of a valid committed suffix is detected while the trusted marker remains. A crash before marker replacement leaves the prior committed state plus an ignorable envelope orphan; a crash after marker replacement requires the newly referenced envelope and exact full-history coordinate. The local marker and unkeyed fingerprints detect accidental corruption and partial deletion, not a coordinated privileged rollback that replaces or re-signs both the marker and the matching complete history, or deletes all local evidence. Shared contracts remain portable and preserve Milestone 07 and 08 identities and governance evidence, but the first adapter is cooperative local single-writer only. Database adapters, distributed locks and transactions, hostile local concurrency guarantees, remote coordination, replication, object stores, automatic synchronization, and background event processing remain deferred and require a later architecture decision.
- **Integrity clarification:** Snapshot registrations persist a durable canonical-JSON projection of the manifest and logical reference, whose SHA-256 commitment is independently recomputed without changing the Milestone 07 snapshot-v1 identity. The strict finite, plain, acyclic serializer is scoped to that commitment; Milestone 07 and 08 fingerprints retain their historical byte behavior, including omission of `undefined` object properties and prior array handling. Before cloning, the shared verifier requires a plain raw durable record and a valid own enumerable data-property discriminator; snapshot registrations then validate their original raw manifest evidence. This prevents cloning from flattening discriminator accessors, unsupported evidence prototypes, or nested accessors into apparently valid records. Its approved `ready` or `migrated` entries must exactly match the snapshot object descriptors by identity, type, source path, and source hash. Public mutations capture immutable invocation-time input before asynchronous lock acquisition. Recovery reports exact registration, lifecycle-transition, decision, and activation evidence counts for success or the verified failure prefix. An earlier semantic replay failure and its progress take precedence over a later missing marker-referenced tail. Recovery and integrity compare the derived index against their exact authoritative replay, report its health separately, never repair it implicitly, and normalize filesystem-result errors without physical paths. Post-open storage-safety failures become stable structured results, while initial configuration and path errors remain open failures; direct index inspection and rebuild normalize authoritative-read and derived-write failures the same way.

## ADR-0014: Assemble context only from the durably verified active snapshot

- **Status:** Accepted
- **Date:** 2026-07-29
- **Context:** Milestone 09 establishes durable active-snapshot authority, but future reasoning systems need a deterministic, budget-bounded artifact that explains exactly which governed knowledge was supplied without introducing model, agent, authorization, or semantic-retrieval behavior.
- **Decision:** Define storage-, model-, tokenizer-, and agent-independent context request, package, budget, evidence, outcome, and verification contracts in `@founderos/knowledge-schema`. Implement registry verification/recovery, one-time active binding capture, repository resolution, exact-query reuse, deterministic selection, Unicode-code-point budget accounting, opt-in canonical-content truncation, evidence generation, fingerprinting, and independent reproduction in `@founderos/knowledge-engine`. The public assembly API accepts a governed registry, repository, and matching repository snapshot; it never accepts arbitrary candidates or reads canonical corpus files. Ordering uses required identity/type priority, preferred type, lifecycle and importance priority, binary canonical fields, and object ID. Context identity excludes wall-clock evidence and binds the complete request, query result, active registry/snapshot/manifest/repository evidence, budget use, and all selection evidence.
- **Consequences:** Future consumers can reproduce and verify the exact governed context they received, and required knowledge or budget reduction cannot disappear silently. Character budgets count Unicode code points in the canonical serialized Knowledge Object; truncation can produce a canonical-content prefix but does not claim semantic completeness. The verifier requires trusted registry/snapshot evidence and repository candidates to detect coordinated package tampering. Context packages are not prompts and confer no authorization. LLM execution, prompt roles, agents, Hermes, MCP, semantic ranking, embeddings, persistence of packages, and UI remain deferred.

## ADR template

```markdown
## ADR-NNNN: Title

- **Status:** Proposed | Accepted | Superseded
- **Date:** YYYY-MM-DD
- **Context:** Why a decision is needed.
- **Decision:** The selected direction.
- **Consequences:** Benefits, costs, risks, and follow-up work.
```
