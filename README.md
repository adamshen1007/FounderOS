# FounderOS

FounderOS is an AI-native operating system for founder decision-making, organizational memory, and governed AI-assisted execution. This repository is a documentation-first TypeScript monorepo.

The repository currently provides the governed KnowledgeOS schema, ingestion, migration, corpus-backed repository snapshots, deterministic comparison and governed change sets, human-controlled snapshot review, a local durable snapshot registry and activation audit trail, deterministic queries, governed context assembly, a provider-neutral governed Context Consumer delivery boundary, a restart-safe local Context Delivery Ledger with durable idempotency and Replay Attempt evidence, and a production-provider readiness boundary that evaluates authorization, credential references, transport policy, admission, containment, health, mapping, and observability. It does **not** implement a general-purpose application database, distributed or remote persistence, automatic activation or synchronization, semantic retrieval, real-provider or production-model execution, Hermes, an agent runtime, MCP connectors, or a user interface.

## Architecture at a glance

FounderOS separates human interaction, intelligence, orchestration, knowledge and memory, integrations, and infrastructure. Knowledge is retrieved before important actions; reasoning is separate from execution; human approval remains authoritative for strategic, external, irreversible, and high-risk actions.

Milestone 13 also provides a governed provider-neutral reasoning boundary backed only by a deterministic fake provider and append-only execution evidence. It does not connect to or emulate a production model provider.

Milestone 14 adds a provider-neutral production-provider readiness workflow and a disabled 11-mode validation/simulation harness. `createProductionProviderReadinessEvaluator` and `createDisabledProductionProviderAdapterHarness` capture one approved Adapter-bound Transport Policy authority at configuration time; individual evaluation requests cannot replace it. Every public Milestone 14 composition/request wrapper accepts only an exact plain own-key shape with enumerable data properties, rejecting hidden, symbolic, accessor-backed, or inherited capabilities before value or authority access. The workflow accepts exact durable Milestone 12 Delivery and Milestone 13 Invocation authority plus externally supplied authorization evidence, validates only the Invocation/Transport timeout boundary while keeping Milestone 13 application-attempt retry and Milestone 14 transport retry independent, rejects Circuit reset synchronously, validates credential references without resolving secrets, constructs deterministic redacted request and response-mapping evidence, simulates rate, cost, circuit, health, and bounded in-memory observability controls, and can report only up to `ready-for-dry-run`. Its observability gate appends the already-redacted bundle exactly once to a private bounded sink, verifies the exact retained snapshot, and returns signed retention evidence bound into the final Decision. The configured evaluator issues that exact Decision/evidence pair into a private four-entry first-issued FIFO registry only after final Decision verification. Replay requires the original evidence and the same issuing evaluator while its entry remains resident; it reconstructs the bundle without creating a sink or emitting again. A fresh evaluator or an evicted entry fails closed. The issuance authority is neither durable nor caller-configurable. It is a dry-run planning boundary only: there is no real provider adapter, live endpoint, credential read, DNS lookup, TLS negotiation, socket, HTTP request, SDK client call, or production-model execution path.

Repository dependencies must flow in one direction:

```text
apps -> services -> packages
agents -> MCP gateway service -> integrations -> external systems
infrastructure supports deployment and operations
```

The official specifications are indexed in [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md). Repository-level decisions are recorded in [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md).

## Implemented foundations

- [`@founderos/knowledge-schema`](./packages/knowledge-schema/README.md) provides strict runtime schemas and inferred TypeScript contracts for KnowledgeOS metadata, objects, migration, queries, repositories, lifecycle and durable registry evidence, governed context packages, Consumer delivery, storage-independent durable Delivery and Reasoning Execution Ledger contracts and results, and provider-neutral production-readiness evidence.
- [`@founderos/knowledge-engine`](./services/knowledge-engine/README.md) provides read-only ingestion, manifest-controlled Priority 1 corpus migration, corpus-backed repository initialization, deterministic snapshots and queries, governed lifecycle and durable activation, deterministic budget-bounded context assembly, fail-closed provider-neutral delivery, governed append-only Delivery and Reasoning Execution ledgers, deterministic fake-provider reasoning with independently verifiable result evidence, and the non-executing production-provider readiness facade and disabled harness.
- [`specs/knowledge-templates`](./specs/knowledge-templates) provides valid Markdown templates for all seven KnowledgeOS object types.
- [`knowledge/migration-manifest.yaml`](./knowledge/migration-manifest.yaml) binds the eight canonical FounderOS Priority 1 documents to reviewed object identities, logical destinations, metadata, and source hashes.

Automatic corpus refresh, vault watching, background synchronization or activation, database and distributed adapters, remote coordination and replication, semantic retrieval, embeddings, ranking, graph storage, real-provider or agent execution, connectors, and interfaces remain unimplemented. Milestone 09, 12, and 13 persistence is deliberately limited to explicit, Git-ignored, cooperative single-writer local runtimes; see the [Milestone 12](./services/knowledge-engine/README.md#milestone-12-durable-context-delivery-ledger), [Milestone 13](./services/knowledge-engine/README.md#milestone-13-governed-reasoning-invocation), and [Milestone 14](./services/knowledge-engine/README.md#milestone-14-production-provider-readiness) boundary documentation before operating them.

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
