You are the lead engineer implementing FounderOS Milestone 06 ---
Knowledge Repository and Candidate Source Foundation.

Before making changes, read:

-   README.md
-   AGENTS.md
-   CONTRIBUTING.md
-   ARCHITECTURE_DECISIONS.md
-   Repository audit
-   Milestone 04 documents
-   Milestone 05 documents
-   Milestone 06 documents

Review:

-   packages/knowledge-schema/
-   services/knowledge-engine/

Understand existing contracts, query flow, tests, and package
boundaries.

Objective:

Move KnowledgeOS from caller-supplied candidates to repository-supplied
candidates.

Implement:

1.  Knowledge Repository Contract
2.  Candidate Source Contract
3.  Repository-backed query flow
4.  Tests for retrieval, provenance, determinism, and regression

Do not implement:

-   Database persistence
-   Vector database
-   Embeddings
-   Semantic search
-   Ranking
-   Knowledge graph
-   Agents
-   Hermes
-   MCP
-   UI

Follow:

-   Documentation first
-   Architecture before code
-   Preserve package boundaries
-   Add tests
-   Avoid unnecessary dependencies

Run:

pnpm format:check pnpm lint pnpm build pnpm typecheck pnpm test

Final report:

1.  Status GO or NOT READY
2.  Summary
3.  Changed files
4.  Tests
5.  Verification
6.  Architecture impact
7.  Limitations
8.  Next milestone recommendation

Build a stable knowledge access foundation before adding intelligence
layers.
