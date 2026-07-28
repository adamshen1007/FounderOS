You are the lead engineer responsible for implementing FounderOS
Milestone 07 --- Knowledge Corpus Repository Adapter.

Before making changes, read:

-   README.md
-   AGENTS.md
-   CONTRIBUTING.md
-   ARCHITECTURE_DECISIONS.md
-   Repository audit
-   Milestone 04 documents
-   Milestone 05 documents
-   Milestone 06 documents
-   Milestone 07 documents

Review:

-   packages/knowledge-schema/
-   services/knowledge-engine/

Understand:

-   Knowledge Object contracts
-   Query contracts
-   Repository contracts
-   Candidate source boundaries

Objective:

Implement a corpus-backed KnowledgeOS repository adapter.

Move from:

In-memory repository

to:

Approved knowledge corpus source

without introducing persistence or retrieval intelligence.

Implement:

1.  Knowledge Corpus Candidate Source
2.  Repository snapshot model
3.  Snapshot identity
4.  Corpus loading workflow
5.  Change detection foundation
6.  Tests

Do not implement:

-   Database
-   Embeddings
-   Vector search
-   Semantic ranking
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

Verification:

pnpm format:check pnpm lint pnpm build pnpm typecheck pnpm test

Completion report:

1.  Status GO or NOT READY
2.  Summary
3.  Changed files
4.  Tests
5.  Verification results
6.  Architecture impact
7.  Limitations
8.  Next milestone recommendation

Build a trusted corpus access layer before adding context assembly and
agents.
