# FounderOS

FounderOS is an AI-native operating system for founder decision-making, organizational memory, and governed AI-assisted execution. This repository is a documentation-first TypeScript monorepo.

The repository currently provides the governed KnowledgeOS schema, ingestion, migration, corpus-backed repository snapshots, deterministic comparison and governed change sets, human-controlled snapshot review and activation readiness, and deterministic query foundations. It does **not** implement persistence, automatic activation or synchronization, semantic retrieval, Hermes, an agent runtime, MCP connectors, or a user interface.

## Architecture at a glance

FounderOS separates human interaction, intelligence, orchestration, knowledge and memory, integrations, and infrastructure. Knowledge is retrieved before important actions; reasoning is separate from execution; human approval remains authoritative for strategic, external, irreversible, and high-risk actions.

Repository dependencies must flow in one direction:

```text
apps -> services -> packages
agents -> MCP gateway service -> integrations -> external systems
infrastructure supports deployment and operations
```

The official specifications are indexed in [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md). Repository-level decisions are recorded in [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md).

## Implemented foundations

- [`@founderos/knowledge-schema`](./packages/knowledge-schema/README.md) provides strict runtime schemas and inferred TypeScript contracts for KnowledgeOS metadata, objects, migration, queries, candidate sources, repository snapshots, lifecycle records, governed change sets, approval workflows, and results.
- [`@founderos/knowledge-engine`](./services/knowledge-engine/README.md) provides read-only ingestion, manifest-controlled Priority 1 corpus migration, corpus-backed repository initialization, deterministic snapshots, governed comparison and change sets, human-controlled review/approval/activation readiness, and exact filtering with preserved source provenance.
- [`specs/knowledge-templates`](./specs/knowledge-templates) provides valid Markdown templates for all seven KnowledgeOS object types.
- [`knowledge/migration-manifest.yaml`](./knowledge/migration-manifest.yaml) binds the eight canonical FounderOS Priority 1 documents to reviewed object identities, logical destinations, metadata, and source hashes.

Corpus refresh execution, vault watching, durable persistence, automatic synchronization or activation, semantic retrieval, embeddings, ranking, graph storage, agent behavior, connectors, and interfaces remain unimplemented.

## Repository layout

| Path              | Responsibility                                     |
| ----------------- | -------------------------------------------------- |
| `apps/`           | Future user-facing applications                    |
| `services/`       | Core backend service boundaries                    |
| `packages/`       | Shared contracts, types, and libraries             |
| `integrations/`   | Future external-system adapters                    |
| `infrastructure/` | Deployment, data, monitoring, and security assets  |
| `docs/`           | Governance and architecture source documentation   |
| `specs/`          | Future formal APIs, schemas, events, and protocols |
| `tests/`          | Cross-repository and system-level verification     |
| `scripts/`        | Engineering and repository automation              |
| `.github/`        | Collaboration policy and continuous integration    |

## Development

Requirements:

- Node.js 22 or newer
- pnpm 11 or newer

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm knowledge:migrate
```

`pnpm knowledge:migrate` validates the approved manifest and writes the deterministic, Git-ignored `migration-report.json` artifact without modifying canonical documents.

See [CONTRIBUTING.md](./CONTRIBUTING.md) before making changes.
