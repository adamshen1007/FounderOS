# FounderOS Repository Audit v1.0

## Audit metadata

| Field | Value |
| --- | --- |
| Audit date | 2026-07-28 |
| Repository | `adamshen1007/FounderOS` |
| Checked-out branch | `codex/milestone-03` |
| Checked-out commit | `cb09af5` — `feat: add FounderOS core migration dry run` |
| Remote default branch | `origin/main` at `14336e7` |
| Merge status | Milestone 03 is merged into `origin/main` through pull request #1 |
| Audit method | Repository inventory, specification-to-implementation comparison, source/test review, Git history, and CI verification |

## Executive summary

FounderOS is a documentation-first TypeScript monorepo with a sound engineering foundation and a deliberately narrow first implementation slice. The repository has completed its base initialization, runtime KnowledgeOS schema contracts, single-file Markdown ingestion, and a deterministic directory migration dry run. The only implemented product-domain code is the KnowledgeOS schema and ingestion foundation; applications, agents, Hermes, memory persistence, MCP, integrations, infrastructure, retrieval, embeddings, and graph persistence remain intentional placeholders or unimplemented capabilities.

The architecture currently has a clean dependency direction:

```text
Markdown/frontmatter
        |
        v
@founderos/knowledge-engine
  parse -> normalize -> validate -> report
                         |
                         v
             @founderos/knowledge-schema
```

The next milestone should turn the successful five-document dry run into a controlled, reviewable migration of the complete FounderOS Priority 1 corpus. It should add a migration manifest and executable report workflow while continuing to defer databases, embeddings, retrieval ranking, graph persistence, Hermes, agents, MCP connectors, and UI.

## 1. Full directory tree

This is the complete logical project tree at audit time, including the new audit report and intentional empty specification directories. Generated or machine-local content is excluded: `.git/`, `node_modules/`, `dist/`, `.build/`, coverage output, caches, and `.DS_Store`.

```text
FounderOS/
├── .editorconfig
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
├── .nvmrc
├── .prettierignore
├── ARCHITECTURE_DECISIONS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── DOCUMENTATION_INDEX.md
├── README.md
├── apps/
│   └── README.md
├── docs/
│   ├── README.md
│   ├── agents/
│   │   ├── AI_Task_Routing_Framework_v1.0.md
│   │   ├── Agent_Communication_Protocol_v1.0.md
│   │   ├── Agent_Evaluation_Framework_v1.0.md
│   │   ├── FounderOS_Agent_Runtime_Specification_v1.0.md
│   │   └── Hermes_Chief_of_Staff_Specification_v1.0.md
│   ├── architecture/
│   │   ├── FounderOS_Data_Architecture_Specification_v1.0.md
│   │   ├── FounderOS_MCP_Architecture_Specification_v1.0.md
│   │   ├── FounderOS_Repository_Architecture_Specification_v1.0.md
│   │   ├── FounderOS_Security_and_Governance_Architecture_Specification_v1.0.md
│   │   └── FounderOS_System_Architecture_Specification_v1.0.md
│   ├── engineering/
│   │   ├── FounderOS_CI_CD_Architecture_Specification_v1.0.md
│   │   ├── FounderOS_Codex_Execution_Framework_v1.0.md
│   │   ├── FounderOS_Coding_Standards_Specification_v1.0.md
│   │   ├── FounderOS_Engineering_Strategy_Specification_v1.0.md
│   │   ├── FounderOS_Testing_Strategy_Specification_v1.0.md
│   │   └── REPOSITORY_INITIALIZATION_PLAN.md
│   ├── governance/
│   │   ├── FounderOS_Constitution_v1.0.md
│   │   ├── FounderOS_Decision_Framework_v1.0.md
│   │   └── FounderOS_Design_Principles_v1.0.md
│   ├── knowledgeos/
│   │   ├── KnowledgeOS_Architecture_Specification_v1.0.md
│   │   ├── KnowledgeOS_Knowledge_Graph_Architecture_Specification_v1.0.md
│   │   ├── KnowledgeOS_Knowledge_Object_Model_Specification_v1.0.md
│   │   ├── KnowledgeOS_Metadata_System_Specification_v1.0.md
│   │   ├── KnowledgeOS_Retrieval_Engine_Specification_v1.0.md
│   │   └── KnowledgeOS_Vault_Architecture_Specification_v1.0.md
│   ├── migration/
│   │   ├── FounderOS_Codex_First_Execution_Prompt_v1.0.md
│   │   ├── FounderOS_Knowledge_Migration_Strategy_v1.0.md
│   │   ├── FounderOS_Milestone_00_Repository_Initialization_Specification_v1.0.md
│   │   ├── FounderOS_Milestone_02_Vault_Ingestion_Foundation_Specification_v1.0.md
│   │   ├── FounderOS_Milestone_03_Core_Migration_Dry_Run_Specification_v1.0.md
│   │   ├── FounderOS_Vault_Initialization_Specification_v1.0.md
│   │   ├── OpportunityOS_Migration_Specification_v1.0.md
│   │   └── Speculor_AI_Migration_Specification_v1.0.md
│   └── reviews/
│       └── REPOSITORY_AUDIT_v1.0.md
├── eslint.config.mjs
├── infrastructure/
│   └── README.md
├── integrations/
│   └── README.md
├── package.json
├── packages/
│   ├── README.md
│   ├── agent-contracts/
│   │   └── README.md
│   ├── knowledge-schema/
│   │   ├── README.md
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── enums.ts
│   │   │   ├── index.ts
│   │   │   ├── metadata.ts
│   │   │   ├── objects.ts
│   │   │   ├── parse.ts
│   │   │   └── primitives.ts
│   │   ├── tests/
│   │   │   ├── fixtures.ts
│   │   │   ├── metadata.test.ts
│   │   │   └── objects.test.ts
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   ├── memory-types/
│   │   └── README.md
│   └── shared-config/
│       └── README.md
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prettier.config.mjs
├── scripts/
│   └── repository-foundation.ts
├── services/
│   ├── README.md
│   ├── agent-router/
│   │   └── README.md
│   ├── hermes-runtime/
│   │   └── README.md
│   ├── knowledge-engine/
│   │   ├── README.md
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── application/
│   │   │   │   ├── ingest-markdown-directory.ts
│   │   │   │   ├── ingest-markdown.ts
│   │   │   │   └── normalize-frontmatter.ts
│   │   │   ├── domain/
│   │   │   │   └── frontmatter.ts
│   │   │   ├── index.ts
│   │   │   ├── infrastructure/
│   │   │   │   ├── parse-markdown.ts
│   │   │   │   └── read-markdown-file.ts
│   │   │   └── interfaces/
│   │   │       ├── directory-ingestion-report.ts
│   │   │       └── ingestion-report.ts
│   │   ├── tests/
│   │   │   ├── directory-ingestion.test.ts
│   │   │   ├── fixtures/
│   │   │   │   ├── founderos-constitution.md
│   │   │   │   ├── founderos-core/
│   │   │   │   │   ├── constitution.md
│   │   │   │   │   ├── decision-framework.md
│   │   │   │   │   ├── design-principles.md
│   │   │   │   │   ├── repository-architecture.md
│   │   │   │   │   └── system-architecture.md
│   │   │   │   ├── invalid-design-principle.md
│   │   │   │   └── reddit-connector-decision.md
│   │   │   ├── ingest-markdown.test.ts
│   │   │   ├── normalize-frontmatter.test.ts
│   │   │   └── parse-markdown.test.ts
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   ├── mcp-gateway/
│   │   └── README.md
│   └── memory-service/
│       └── README.md
├── specs/
│   ├── README.md
│   ├── agent-protocols/
│   ├── api/
│   ├── database/
│   ├── events/
│   ├── knowledge-templates/
│   │   ├── decision.md
│   │   ├── experiment.md
│   │   ├── knowledge.md
│   │   ├── principle.md
│   │   ├── project.md
│   │   ├── relationship.md
│   │   └── research.md
│   └── schemas/
├── tests/
│   └── repository-foundation.test.ts
├── tsconfig.build.json
├── tsconfig.json
└── vitest.config.ts
```

Inventory totals before this report was added: 112 tracked files, 34 Markdown files under `docs/`, 24 TypeScript source/test/config files under the implementation areas, 7 test files, and 47 declared test cases. Only two workspace units have package manifests.

## 2. Current applications, packages, and services

### Applications

| Component | State | Assessment |
| --- | --- | --- |
| `apps/` | Placeholder | Contains only boundary documentation. No web, mobile, voice, chat, or other UI application exists. This is intentional. |

### Packages

| Component | State | Implemented responsibility |
| --- | --- | --- |
| `@founderos/knowledge-schema` | Implemented, version `0.1.0`, private | Strict Zod runtime schemas and inferred TypeScript types for shared metadata, provenance, lifecycle, relationships, and all seven canonical object types: knowledge, decision, project, research, principle, experiment, and relationship. |
| `packages/agent-contracts` | Placeholder | Future agent identity, task, handoff, communication, and evaluation contracts. |
| `packages/memory-types` | Placeholder | Future shared memory contracts; no persistence behavior. |
| `packages/shared-config` | Placeholder | Future validated non-secret configuration contracts. |

### Services

| Component | State | Implemented responsibility |
| --- | --- | --- |
| `@founderos/knowledge-engine` | Implemented, version `0.1.0`, private | Read-only YAML-frontmatter Markdown parsing, recursive snake-case-to-camel-case normalization, schema validation, SHA-256 source evidence, file-level reports, deterministic recursive directory ingestion, duplicate ID/hash rejection, and deterministic JSON serialization. |
| `services/agent-router` | Placeholder | No routing or workflow runtime. |
| `services/hermes-runtime` | Placeholder | No Hermes reasoning, context assembly, or conversational runtime. |
| `services/mcp-gateway` | Placeholder | No tool discovery, permission, execution, connector, or audit runtime. |
| `services/memory-service` | Placeholder | No memory persistence or query runtime. |

### Other architectural areas

| Area | State |
| --- | --- |
| `integrations/` | Boundary documentation only; no adapters or MCP connectors. |
| `infrastructure/` | Boundary documentation only; no deployment, database, monitoring, or security assets. |
| `specs/knowledge-templates/` | Seven implemented Markdown/frontmatter input templates, one per canonical object type. |
| Other `specs/` domains | Empty placeholders for future APIs, databases, events, schemas, and agent protocols. |
| `scripts/repository-foundation.ts` | Implemented structural verification for required directories/files and Milestone 00 exclusions. |

## 3. Milestone status

| Milestone | Status | Evidence and qualification |
| --- | --- | --- |
| Milestone 00 — Repository Initialization | Complete with minor follow-up | Monorepo boundaries, canonical documentation organization, TypeScript, pnpm, ESLint, Prettier, Vitest, CI, repository verification, README, documentation index, and ADR ledger exist. The specification's target tree lists a `LICENSE`, but none is present. |
| Milestone 01 — KnowledgeOS Foundation | Partially delivered and decomposed | The schema, metadata, knowledge-object validation, and ingestion goals are delivered across `@founderos/knowledge-schema` and Milestone 02. A standalone Milestone 01 specification is absent, and the originally listed retrieval interface design has not been implemented. |
| Milestone 02 — Vault Ingestion Foundation | Complete | Single-file Markdown parsing, normalization, schema validation, structured errors, source preservation, real-document-derived fixtures, and acceptance tests are implemented. |
| Milestone 03 — Core Migration Dry Run | Complete and merged | All seven templates, recursive directory ingestion, deterministic aggregate reports, duplicate conflict rejection, symlink containment, and a five-document FounderOS Core pilot are implemented. Commit `cb09af5` is merged to `origin/main` at `14336e7`. |

No numbered Milestone 04 specification exists yet.

## 4. Existing architecture

### Repository architecture

FounderOS uses a pnpm workspace and strict TypeScript. The intended dependency flow is:

```text
apps -> services -> packages
agents -> MCP gateway -> integrations -> external systems
infrastructure -> deployment and operations support
```

Only `packages/knowledge-schema` and `services/knowledge-engine` are active workspace units. This keeps the current dependency graph small: the knowledge engine depends on the schema package, while the schema package does not depend on services or applications.

### Knowledge architecture

The implemented knowledge boundary follows these stages:

1. Read a caller-selected UTF-8 Markdown file or explicit directory.
2. Parse YAML 1.2 frontmatter and preserve the Markdown body.
3. Normalize keys recursively from specification-style `snake_case` to canonical `camelCase`.
4. Map common identity, classification, provenance, quality, lifecycle, tags, and relationships into the shared metadata envelope.
5. Validate the result against a strict object-specific Zod schema.
6. Return an accepted object or stable, field-addressable rejection errors.
7. Record source path, byte length, and SHA-256 evidence without rewriting source files.
8. For directory batches, sort paths deterministically and reject every member of duplicate object-ID or source-hash sets.

The human-owned Markdown source remains authoritative. The ingestion layer creates canonical representations and reports, but it does not mutate source, persist objects, crawl continuously, or perform AI extraction.

### Governance architecture

- Bootstrap specifications are preserved by domain under `docs/` and indexed from the repository root.
- Repository-level decisions are recorded in a single ADR ledger containing ADR-0001 through ADR-0007.
- The architecture separates reasoning from execution and reserves strategic, external, irreversible, and high-risk actions for human approval.
- Current implementation deliberately stops before agents, tools, external systems, and durable stores, reducing premature security and governance exposure.

### Engineering and CI architecture

- Node.js 22+ and pnpm 11+ are declared.
- TypeScript uses strict mode, `noUncheckedIndexedAccess`, consistent casing, and ES modules.
- CI runs frozen dependency installation, formatting, lint, build, type checking, and tests on Ubuntu.
- Workspace packages build before downstream type checking and tests so package export declarations exist in clean CI environments.
- Tests cover repository structure, schema invariants, unsafe/colliding frontmatter, source immutability, deterministic evidence, directory containment, duplicate conflicts, and the five-document pilot.

## 5. Missing components

The following components are absent. Most are explicitly deferred rather than defects.

### KnowledgeOS gaps

- A production FounderOS vault and the full Priority 1 canonical migration.
- A source-to-object migration manifest or registry.
- An executable migration command that writes reviewable report artifacts.
- Durable database or object-store persistence.
- Embedding generation and vector indexing.
- Retrieval interfaces, filtering, ranking, and result evaluation.
- Knowledge graph persistence, traversal, and relationship intelligence.
- Vault watching, incremental ingestion, background scheduling, and change reconciliation.
- Semantic or AI-assisted extraction for documents without authored frontmatter.

### Agent and orchestration gaps

- Hermes runtime.
- Agent runtime, identity enforcement, routing, handoffs, and evaluation execution.
- Memory service and memory-type contracts.
- MCP gateway, permission enforcement, audit execution, and connectors.
- Agent communication/event contracts.

### Product and platform gaps

- User-facing web, mobile, chat, or voice applications.
- API contracts and service transport boundaries.
- Authentication, authorization, secrets integration, and runtime policy enforcement.
- Databases, deployment definitions, environments, observability, backup, and disaster recovery.
- External integrations.
- Release packaging, artifact publication, and deployment pipelines.

### Verification gaps

- End-to-end and service integration tests.
- Windows/macOS CI for path and filesystem behavior.
- Performance, load, fuzz, and security tests.
- Enforced coverage thresholds.
- Contract compatibility tests for future schema versions.

## 6. Technical debt and risks

| Priority | Finding | Impact | Recommended treatment |
| --- | --- | --- | --- |
| High | The Core pilot covers five derived fixtures, but Priority 1 calls for all governance and architecture specifications. Data Architecture, MCP Architecture, and Security/Governance Architecture are not part of the pilot corpus. | The dry run proves the mechanism but not the complete FounderOS Core migration. | Make full-corpus migration the next milestone's primary acceptance target. |
| Medium | Fixture provenance is descriptive rather than mechanically linked to canonical documents. Tests prove fixture bytes are not modified during ingestion, but no manifest binds each fixture to its canonical source path and source checksum. | A derived fixture can drift from the official document without detection. | Add a reviewed source manifest with canonical path, source hash, object ID, and transformation status. |
| Medium | The knowledge engine exposes library functions and a serializer but no supported CLI or repository script for running a batch and writing its report. | Operators must write ad hoc code, weakening repeatability and auditability. | Add a thin, explicit-root migration CLI with deterministic output and no source mutation. |
| Medium | Milestone numbering and scope traceability are incomplete. There is no standalone Milestone 01 specification, while its retrieval-interface item remains outstanding and later work is numbered 02 and 03. | Future contributors may misread what was approved, completed, or intentionally deferred. | Add a milestone ledger and classify the retrieval interface as deferred, superseded, or assigned to a future milestone. |
| Medium | Dependency direction is documented but not mechanically enforced. ESLint uses general recommended rules only. | New packages can accidentally introduce reverse-layer dependencies as the monorepo grows. | Add workspace boundary rules or a dependency-graph check before adding more active services. |
| Medium | Directory reports preserve `normalize(directoryPath)` as `rootPath`. Passing an absolute path therefore makes otherwise deterministic output machine-location-dependent. | Reports are repeatable for the same invocation but may not be byte-identical across workstations. | Define a canonical report root label or require/record a relative logical root separately from the physical input path. |
| Medium | The Milestone 00 target structure includes `LICENSE`, but the repository has no license file and its foundation verifier does not require one. | Usage and contribution rights are undefined. | Select an approved license or explicitly record that the repository is proprietary, then verify the chosen file. |
| Low | Directory ingestion is sequential and retains the complete report/object set in memory. | Large future vaults may ingest slowly or consume excessive memory. | Keep the simple implementation for the next controlled corpus; establish measured limits before optimizing or adding bounded concurrency. |
| Low | CI runs only on Ubuntu, although path normalization and symlink behavior are platform-sensitive. | Windows/macOS regressions may remain undetected. | Add a small cross-platform filesystem test matrix when the ingestion tool becomes operator-facing. |
| Low | Vitest config declares coverage reporters but no coverage command or threshold is enforced in CI. | Test volume can grow while meaningful coverage silently declines. | Add focused package-level thresholds after the next milestone stabilizes the migration surface. |
| Low | Architecture decisions remain in one root ledger rather than immutable individual ADR files. | Review history and supersession will become harder to manage as decisions grow. | Split future decisions into numbered ADR files and retain the root ledger as an index. |

No `TODO`, `FIXME`, `HACK`, or `XXX` markers were found in tracked project content. The more important debt is capability and governance traceability rather than unfinished inline code.

## 7. Recommended next milestone

### Milestone 04 — FounderOS Core Vault Materialization

#### Objective

Convert the Milestone 03 dry-run capability into a repeatable, human-reviewed migration of the complete FounderOS Priority 1 corpus while preserving every canonical source document.

#### Proposed scope

1. Write `FounderOS_Milestone_04_Core_Vault_Materialization_Specification_v1.0.md` before implementation.
2. Define the approved vault target layout and ownership rules without introducing a database.
3. Add a versioned migration manifest mapping each canonical source path to its intended object ID, object type, derived vault path, source SHA-256, and review status.
4. Add frontmatter-enabled vault copies for all Priority 1 documents: Constitution, Design Principles, Decision Framework, and all five architecture specifications.
5. Add a thin CLI that accepts an explicit root and output path, invokes the existing directory ingestion API, writes deterministic JSON, and never modifies inputs.
6. Add acceptance tests that validate the full corpus, assert unique object IDs/source hashes, detect source/fixture drift, preserve bytes, and reproduce identical report output.
7. Update the documentation index, milestone ledger, README, and ADRs to reflect the operational migration workflow.

#### Acceptance criteria

- All eight Priority 1 documents validate successfully as approved KnowledgeOS objects.
- Every migrated object is traceable to one canonical document and reviewed manifest entry.
- Canonical documentation remains byte-for-byte unchanged.
- Two consecutive migration runs produce identical report bytes.
- Invalid, missing, duplicated, or drifted manifest entries fail with actionable errors.
- The CLI cannot crawl outside the explicit root or follow symbolic links.
- Formatting, lint, build, type checking, unit tests, and full-corpus acceptance tests pass in CI.

#### Continue deferring

- Databases and object stores.
- Embeddings and vector indexes.
- Retrieval and ranking.
- Knowledge graph persistence.
- Filesystem watching and background scheduling.
- Hermes, agents, MCP integrations, and UI.

This milestone closes the gap between a test fixture demonstration and an auditable FounderOS knowledge foundation. Retrieval-interface design should follow only after the canonical corpus, identity, provenance, and migration workflow are stable.

## Verification evidence

- `git fetch origin main` completed successfully.
- `cb09af5` is an ancestor of `origin/main`; merge commit `14336e7` records pull request #1.
- GitHub Actions run `30320352279` completed successfully for merge commit `14336e7` on 2026-07-28. Install, formatting, lint, build, type check, and test steps all passed.
- Local `pnpm format:check` passed during this audit.
- A local `pnpm lint` attempt produced no output for more than 80 seconds and was interrupted. This is recorded as a local workstation/toolchain condition rather than a repository failure because the same merged revision passed the GitHub Actions lint step.
- Source inventory found 7 test files containing 47 declared test cases.
- No source files were modified as part of this audit; only this report was added.
