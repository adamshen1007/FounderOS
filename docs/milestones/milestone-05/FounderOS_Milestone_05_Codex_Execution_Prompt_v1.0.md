# FounderOS Milestone 05 Codex Execution Prompt v1.0

You are the lead engineer implementing FounderOS Milestone 05.

Before implementation, read:

-   README.md
-   AGENTS.md
-   Repository audit
-   Milestone 04 review
-   Milestone 05 specifications
-   Existing knowledge-schema and knowledge-engine implementation

Objective:

Implement the KnowledgeOS Query Foundation.

Build:

-   Query request contracts
-   Query result contracts
-   Context filtering foundation
-   Deterministic evaluation fixtures
-   Query service foundation

Do not implement:

-   Vector databases
-   Embeddings
-   Semantic search
-   Ranking systems
-   Knowledge graph
-   Agent runtime
-   MCP integrations

Follow FounderOS principles:

-   Documentation first
-   Architecture before code
-   Preserve package boundaries
-   Add tests for every behavior change

Verification:

Run:

pnpm format:check pnpm lint pnpm build pnpm test

Completion report:

Provide:

1.  Summary
2.  Changed files
3.  Tests executed
4.  Verification results
5.  Architecture impact
6.  Risks
7.  Next milestone recommendation

The goal is to create a reliable knowledge consumption contract before
adding intelligence infrastructure.
