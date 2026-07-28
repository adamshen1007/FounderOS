You are the lead engineer responsible for implementing FounderOS
Milestone 08 --- Knowledge Snapshot Lifecycle Management Foundation.

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
-   Milestone 08 documents

Review:

-   packages/knowledge-schema/
-   services/knowledge-engine/

Understand:

-   Knowledge Object contracts
-   Repository contracts
-   Corpus adapter
-   Snapshot implementation
-   Existing tests

Objective:

Implement controlled KnowledgeOS snapshot lifecycle management.

Implement:

1.  Snapshot lifecycle states
2.  Snapshot transition rules
3.  Snapshot comparison contract
4.  Knowledge change set model
5.  Approval workflow foundation
6.  Tests

Workflow:

Snapshot Creation

↓

Validation

↓

Comparison

↓

Change Set Generation

↓

Human Review

↓

Activation Readiness

Do not implement:

-   Automatic synchronization
-   Background watchers
-   Event streaming
-   Database persistence
-   Embeddings
-   Vector search
-   Semantic ranking
-   Agents
-   Hermes
-   MCP
-   UI

Follow FounderOS principles:

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
4.  Tests added
5.  Verification results
6.  Architecture impact
7.  Limitations
8.  Next milestone recommendation

Build a governed knowledge evolution layer before adding context
assembly and autonomous intelligence.
