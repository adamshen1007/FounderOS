# FounderOS Repository Initialization Plan

## Objective

Create a documentation-first, verifiable monorepo foundation that preserves the official system architecture and is ready for future milestone implementation.

## Architectural constraints

- Human authority and founder knowledge ownership are non-negotiable.
- Context retrieval precedes important reasoning and action.
- Intelligence, orchestration, execution, integration, and infrastructure remain separate layers.
- Applications depend on services; services depend on packages; reverse dependencies are prohibited.
- External capabilities must eventually pass through governed integration boundaries with least privilege and auditability.
- Product runtime code is outside Milestone 00.

## Initialization sequence

1. **Understand:** Read governance, KnowledgeOS, agent, system architecture, engineering, and migration specifications in order.
2. **Organize:** Relocate the official documents into canonical domain folders and create a complete index.
3. **Establish boundaries:** Create the required top-level repository structure and document each boundary.
4. **Configure tooling:** Add strict TypeScript, a pnpm workspace, ESLint, Prettier, and Vitest.
5. **Automate verification:** Add a GitHub Actions pipeline for formatting, linting, type checking, tests, and build validation.
6. **Record decisions:** Document the monorepo, dependency, provenance, and milestone-scope decisions.
7. **Verify:** Install from the lockfile and execute every local quality gate.

## Milestone 00 acceptance criteria

- All required top-level directories exist.
- All 30 official bootstrap documents remain present and are indexed.
- `pnpm install`, formatting, linting, type checking, tests, and build complete successfully.
- CI expresses the same local verification sequence.
- No Hermes, KnowledgeOS, agent, MCP connector, database, or UI runtime exists.

## Handoff to Milestone 01

Milestone 01 should define contracts and acceptance tests for the KnowledgeOS foundation before implementation. Its initial scope may include the knowledge object schema, metadata validation, vault ingestion boundaries, and a retrieval interface; it should not pull Hermes or agent orchestration forward.
