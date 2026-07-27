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

## ADR template

```markdown
## ADR-NNNN: Title

- **Status:** Proposed | Accepted | Superseded
- **Date:** YYYY-MM-DD
- **Context:** Why a decision is needed.
- **Decision:** The selected direction.
- **Consequences:** Benefits, costs, risks, and follow-up work.
```
