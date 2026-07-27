# FounderOS

FounderOS is an AI-native operating system for founder decision-making, organizational memory, and governed AI-assisted execution. This repository is a documentation-first TypeScript monorepo.

Milestone 00 establishes engineering boundaries and quality controls. It does **not** implement Hermes, KnowledgeOS, an agent runtime, MCP connectors, or a user interface.

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

- [`@founderos/knowledge-schema`](./packages/knowledge-schema/README.md) provides strict runtime schemas and inferred TypeScript contracts for KnowledgeOS metadata, relationships, and the seven official knowledge object categories.

Persistence, ingestion, retrieval, embeddings, graph storage, agent behavior, connectors, and interfaces remain unimplemented.

## Repository layout

| Path              | Responsibility                                     |
| ----------------- | -------------------------------------------------- |
| `apps/`           | Future user-facing applications                    |
| `services/`       | Future core backend service boundaries             |
| `packages/`       | Future shared contracts, types, and libraries      |
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
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) before making changes.
