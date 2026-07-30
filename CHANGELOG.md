# Changelog

All notable changes to FounderOS will be documented here.

## Unreleased

### Added

- Milestone 00 monorepo structure and engineering toolchain.
- Canonical documentation organization and index.
- Continuous integration foundation.
- KnowledgeOS metadata, relationship, and seven-object runtime schema foundation.
- Runtime parsing APIs and focused KnowledgeOS contract tests.
- Read-only Markdown and YAML frontmatter ingestion with canonical key normalization.
- File-level acceptance and rejection reports with deterministic source evidence.
- Deterministic directory-ingestion reports with duplicate identity and source detection.
- Canonical templates for all seven knowledge object types and a five-document FounderOS Core migration pilot.
- Strict migration-manifest schemas with identity, path, hash, metadata, lifecycle, and review validation.
- Manifest-controlled migration of all eight FounderOS Priority 1 canonical documents.
- Path-contained migration CLI and deterministic `migration-report.json` generation.
- Strict KnowledgeOS query and result contracts with consumer context, exact filters, and source provenance.
- Deterministic in-memory query execution and Priority 1 corpus evaluation fixtures.
- Versioned candidate-source and Knowledge Repository contracts.
- Validated in-memory candidate provider, deterministic repository access, and repository-backed query execution.
- Approved-corpus candidate source, immutable repository snapshots, corpus-backed repository initialization, and deterministic change detection.
- Governed immutable snapshot lifecycle, deterministic comparison and change sets, and human-controlled approval/activation readiness.
- Strict storage-independent durable-registry, audit-envelope, activation, recovery, integrity, and derived-index contracts.
- Governed local file-backed snapshot registration, lifecycle and decision history, atomic activation audit persistence, restart recovery, integrity verification, and rebuildable active-index support.
- Independently verifiable canonical-JSON manifest commitments bound one-to-one to snapshot object descriptors, synchronous immutable mutation capture, exact recovery evidence counts, public derived-index consistency reporting, and machine-independent filesystem failure results and index-operation errors.
- Dedicated strict manifest commitment hashing with byte-compatible Milestone 07 and 08 fingerprints, plus pre-clone raw record-discriminator and manifest-evidence validation in both registration facades.
- Descriptor-stable governed mutation capture, ECMAScript-private registry internals, and raw-before-normalization fingerprint verification for durable records, envelopes, and derived indexes.
- Null-prototype mutation capture with reserved `__proto__` rejection, plus canonical primitive-leaf enforcement and stable serializer-failure normalization for durable integrity verification.
- Path-free post-open storage-safety integrity and recovery results, with semantic replay failures preserving exact verified-prefix progress ahead of missing-tail coordinate failures.
- Descriptor-only raw error locations that never invoke accessors, plus an adapter-neutral governed storage/writer port proven by an in-memory lifecycle-through-activation integration.
- Builder-only omission of schema-valid explicit `undefined` object properties preserves Milestone 07/08 change-set compatibility without weakening strict persisted-record verification.
- Bidirectional runtime/source-root overlap rejection prevents a registry runtime from containing canonical source trees and runs before filesystem mutation.
- Strict governed context request and package contracts, verified active-snapshot assembly, deterministic exact selection, Unicode-safe budgets and truncation, complete omission evidence, reproducible fingerprints, independent tamper verification, and Priority 1 context evaluations.
- Strict provider-neutral Consumer, governed delivery request, policy-decision, freshness, replay, delivery-envelope, receipt, and consumption-evidence contracts.
- A single governed Context Consumer delivery operation that independently verifies Context Packages and durable snapshot evidence, enforces capability and caller-supplied authorization decisions, rejects bypass shapes, governs historical delivery and replay, and uses bounded deterministic in-memory idempotency retention.
- Forty executable deterministic Milestone 11 evaluations plus contract, exact request/policy binding, trusted historical-prefix verification, authoritative artifact verification, freshness, capability, tamper, path and credential privacy, replay-attempt evidence, receipt, immutability, accessor-safety, and bypass tests.
- Strict storage-independent Durable Context Delivery Ledger, immutable Request registration, permanent idempotency ownership, exact Delivery artifact wrapper, atomic transaction, Replay Attempt, expiration, recovery, integrity, and derived-index contracts.
- A governed local file-backed Delivery Ledger with a fingerprinted commit-head commit point, single-writer protection, compare-and-swap head and ownership checks, restart recovery, exact original-result replay, current Policy and Freshness evidence, tamper-evident audit chaining, deterministic index rebuilding, crash-fault evaluation, and recursive filesystem-safety enforcement.
- Milestone 13 provider-neutral Reasoning Invocation contracts for governed Inputs, Capability Descriptors and compatibility, authoritative Execution Policies and character/attempt/timeout budgets, immutable Attempts and Outcomes, Result Envelopes, Usage/Cost/Failure/Timeout/Cancellation Evidence, finalized Consumption Evidence, permanent Invocation ownership, atomic finalization, and storage-independent append-only execution-evidence ledgers.
- A single governed invocation workflow that verifies one exact durable Milestone 12 Delivery transaction and its Context, Consumer, Policy, Freshness, Active Snapshot, and Registry bindings before deterministic capability matching, fake-provider execution, append-only Attempt evidence, independently verifiable Result construction, and Consumption finalization.
- The fixed deterministic fake provider, with explicit success, failure, retry, timeout, cancellation, overflow, malformed, contradictory, path-bearing, and credential-bearing evaluation modes; it has no production provider, network, credential, implicit-clock, randomness, Repository, tool, Agent, Hermes, or MCP dependency.
- A governed local file-backed execution-evidence adapter with expected-head checks, cooperative single-writer locking, fingerprinted atomic commit markers, restart recovery, fail-closed authoritative integrity verification, and non-authoritative rebuildable derived indexes.
- Sixty-three executable deterministic Milestone 13 evaluation definitions and focused no-provider-bypass, tamper, replay, recovery, capability, lifecycle, and adapter-safety tests. The full verification suite passes 719 tests in 37 files.
- Milestone 13 explicitly excludes real providers and provider selection, credentials, streaming, tools, Agents, Hermes, MCP, authentication, authorization, semantic retrieval, embeddings, ranking, knowledge graphs, databases, distributed or remote persistence, automatic abandoned-invocation resume, and UI.
