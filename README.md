# FounderOS

FounderOS is an AI-native operating system for founder decision-making, organizational memory, and governed AI-assisted execution. This repository is a documentation-first TypeScript monorepo.

The repository currently provides the governed KnowledgeOS schema, ingestion, migration, corpus-backed repository snapshots, deterministic comparison and governed change sets, human-controlled snapshot review, a local durable snapshot registry and activation audit trail, deterministic queries, governed context assembly, a provider-neutral governed Context Consumer delivery boundary, a restart-safe local Context Delivery Ledger with durable idempotency and Replay Attempt evidence, and a production-provider readiness boundary that evaluates authorization, credential references, transport policy, admission, containment, health, mapping, and observability. It does **not** implement a general-purpose application database, distributed or remote persistence, automatic activation or synchronization, semantic retrieval, real-provider or production-model execution, Hermes, an agent runtime, MCP connectors, or a user interface.

## Architecture at a glance

FounderOS separates human interaction, intelligence, orchestration, knowledge and memory, integrations, and infrastructure. Knowledge is retrieved before important actions; reasoning is separate from execution; human approval remains authoritative for strategic, external, irreversible, and high-risk actions.

Milestone 13 also provides a governed provider-neutral reasoning boundary backed only by a deterministic fake provider and append-only execution evidence. It does not connect to or emulate a production model provider.

Milestone 14 adds a provider-neutral production-provider readiness workflow and a disabled 11-mode validation/simulation harness. `createProductionProviderReadinessEvaluator` and `createDisabledProductionProviderAdapterHarness` capture one approved Adapter-bound Transport Policy authority at configuration time; individual evaluation requests cannot replace it. Every public Milestone 14 composition/request wrapper accepts only an exact plain own-key shape with enumerable data properties, rejecting hidden, symbolic, accessor-backed, or inherited capabilities before value or authority access. The workflow accepts exact durable Milestone 12 Delivery and Milestone 13 Invocation authority plus externally supplied authorization evidence, validates only the Invocation/Transport timeout boundary while keeping Milestone 13 application-attempt retry and Milestone 14 transport retry independent, rejects Circuit reset synchronously, validates credential references without resolving secrets, constructs deterministic redacted request and response-mapping evidence, simulates rate, cost, circuit, health, and bounded in-memory observability controls, and can report only up to `ready-for-dry-run`. Its observability gate appends the already-redacted bundle exactly once to a private bounded sink, verifies the exact retained snapshot, and returns signed retention evidence bound into the final Decision. The configured evaluator issues that exact Decision/evidence pair into a private four-entry first-issued FIFO registry only after final Decision verification. Replay requires the original evidence and the same issuing evaluator while its entry remains resident; it reconstructs the bundle without creating a sink or emitting again. A fresh evaluator or an evicted entry fails closed. The issuance authority is neither durable nor caller-configurable. It is a dry-run planning boundary only: there is no real provider adapter, live endpoint, credential read, DNS lookup, TLS negotiation, socket, HTTP request, SDK client call, or production-model execution path.

Milestone 15 adds a strict durable readiness transaction and replay registry, deterministic genesis commitment, exact marker-embedded ledger head, permanent registration/replay identity ownership, dual-time fresh-evaluator replay evidence, recovery and integrity verification, and a cooperative single-writer local adapter. Authoritative JSON must be exact canonical UTF-8, and every M15 timestamp uses `YYYY-MM-DDTHH:mm:ss.sssZ`. Each event is stored as physically distinct request, ownership/comparison, transaction/attempt, semantic-event, audit, complete-history, ledger-head, and commit-marker components; the current marker must byte-match its active archive; and fixed-length domain-separated location tokens bind category, sequence, and marker identity without using logical IDs as filenames. Registration verifies the complete request/ownership/event/audit/marker graph and accepts only factory-proven Milestone 14 evaluators. Replay gives permanent-coordinate exact retry or conflict precedence before input comparison and authority access, then requires the exact original input fingerprint and original time. Registration rejection, registration integrity failure, and replay not-recorded results use schema-owned closed status-specific reason enums; the canonical missing-original reason is `original-transaction-not-found`, and aliases or unknown reasons reject. Durable retained evidence is an exact allowlisted, endpoint-free projection with bounded arrays. Atomic replacement of the byte-identical fixed current marker is the only authority visibility boundary; post-marker derived-state faults cannot turn a committed result into rejection, and separate `HEAD` and index files remain derived. A parent-scoped initialization lock serializes first creation before root mutation; the opened local facade exposes redacted writer-lock inspection and exact-identity inactive-lock cleanup. Root, component, event-basename, and derived-path UTF-8 lengths are bounded before filesystem access. List APIs use authoritative replay with stable sequence cursors, a default page size of 100, and a maximum of 256; global event, retained-observability, filesystem-discovery, staging, and quarantine collections are capped at 10,000. The 72 title-specific scenario helpers are executed through harness-owned production-boundary observation and exact assertion-count contracts rather than hard-coded invocation claims. Public operation, pagination, recovery, integrity, cleanup, and rebuild results—including `derivedStateStatus`—remain ephemeral and non-fingerprinted. The implementation was independently reviewed, accepted, and merged through pull request #13; ADR-0019 is Accepted. This acceptance authorizes the durable non-executing ledger only and does not authorize credential resolution, provider transport, or live execution.

Milestone 16 is a documentation-only architecture candidate. It selects the OpenAI provider family and one future foreground non-streaming text-only operation, `founder-decision-memo`, using a closed Responses API envelope with no tools, state, files, images, background processing, caller endpoint, credential access, or network implementation. The package defines authority, credential, transport, privacy, retention, observability, incident, kill-switch, failure, and threat boundaries plus a separately gated future sequence. ADR-0020 is Proposed. Nothing in Milestone 16 authorizes credentials, provider configuration, live requests, implementation, deployment, or release.

Repository dependencies must flow in one direction:

```text
apps -> services -> packages
agents -> MCP gateway service -> integrations -> external systems
infrastructure supports deployment and operations
```

The official specifications are indexed in [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md). Repository-level decisions are recorded in [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md).

## Implemented foundations

- [`@founderos/knowledge-schema`](./packages/knowledge-schema/README.md) provides strict runtime schemas and inferred TypeScript contracts for KnowledgeOS metadata, objects, migration, queries, repositories, lifecycle and durable registry evidence, governed context packages, Consumer delivery, storage-independent durable Delivery, Reasoning Execution, and Readiness Evaluation Ledger contracts and results, and provider-neutral production-readiness evidence.
- [`@founderos/knowledge-engine`](./services/knowledge-engine/README.md) provides read-only ingestion, manifest-controlled Priority 1 corpus migration, corpus-backed repository initialization, deterministic snapshots and queries, governed lifecycle and durable activation, deterministic budget-bounded context assembly, fail-closed provider-neutral delivery, governed append-only Delivery, Reasoning Execution, and Readiness Evaluation ledgers, deterministic fake-provider reasoning with independently verifiable result evidence, and the non-executing production-provider readiness facade and disabled harness.
- [`specs/knowledge-templates`](./specs/knowledge-templates) provides valid Markdown templates for all seven KnowledgeOS object types.
- [`knowledge/migration-manifest.yaml`](./knowledge/migration-manifest.yaml) binds the eight canonical FounderOS Priority 1 documents to reviewed object identities, logical destinations, metadata, and source hashes.

Automatic corpus refresh, vault watching, background synchronization or activation, database and distributed adapters, remote coordination and replication, semantic retrieval, embeddings, ranking, graph storage, real-provider or agent execution, connectors, and interfaces remain unimplemented. Milestone 09, 12, 13, and Milestone 15 local persistence are deliberately limited to explicit, Git-ignored, cooperative single-writer local runtimes; see the [Milestone 12](./services/knowledge-engine/README.md#milestone-12-durable-context-delivery-ledger), [Milestone 13](./services/knowledge-engine/README.md#milestone-13-governed-reasoning-invocation), [Milestone 14](./services/knowledge-engine/README.md#milestone-14-production-provider-readiness), and [Milestone 15](./services/knowledge-engine/README.md#milestone-15-durable-readiness-evaluation-ledger) boundary documentation before operating them.

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
pnpm verify:m15-predecessor-bound
pnpm knowledge:migrate
```

`pnpm knowledge:migrate` validates the approved manifest and writes the deterministic, Git-ignored `migration-report.json` artifact without modifying canonical documents.

`pnpm verify:m15-predecessor` is the standalone Milestone 15 regression proof. For final Milestone 15 verification, run `pnpm verify:m15-predecessor-bound` sequentially after `pnpm test`; it invokes the standalone proof once, captures its actual exit and stdout in an ephemeral same-candidate attestation outside repository authority, and then runs only the SC-035 post-gate evidence check. The verifier executes only the 42 test files present at the authorized documentation base, proves the 1,038-test Milestone 04–14 baseline, and reports the additional Milestone 14 evaluator-provenance regression separately. Ordinary Vitest suites do not launch nested whole-suite test processes.

See [CONTRIBUTING.md](./CONTRIBUTING.md) before making changes.
