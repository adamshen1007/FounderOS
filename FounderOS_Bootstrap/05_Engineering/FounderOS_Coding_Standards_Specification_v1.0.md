# FounderOS Coding Standards Specification v1.0

## Document Status

Version: v1.0\
Layer: Engineering Execution Specification

------------------------------------------------------------------------

# 1. Purpose

FounderOS is designed to evolve over years.

Code quality must optimize for:

-   readability
-   maintainability
-   scalability
-   AI collaboration
-   long-term evolution

The objective:

> Write code that both humans and AI agents can understand.

------------------------------------------------------------------------

# 2. Core Coding Principles

## Principle 1 --- Readability Over Cleverness

Prefer clear and understandable code.

Example:

``` typescript
const activeProjects = projects.filter(
  project => project.status === "active"
);
```

Avoid compressed logic that reduces readability.

------------------------------------------------------------------------

## Principle 2 --- Explicit Over Implicit

Code should clearly communicate intent.

Prefer:

``` typescript
await knowledgeService.createKnowledgeObject({
  type: "decision",
  title,
  content
});
```

Avoid unclear generic operations.

------------------------------------------------------------------------

## Principle 3 --- Small Modules

Each module should have one primary responsibility.

Avoid:

-   one service handling everything
-   hidden dependencies
-   tightly coupled components

Prefer:

-   Auth Service
-   Knowledge Service
-   Agent Service
-   Memory Service

------------------------------------------------------------------------

# 3. Technology Standards

## Primary Language

TypeScript

Reasons:

-   strong ecosystem
-   type safety
-   AI tooling compatibility
-   shared code capability

------------------------------------------------------------------------

## Runtime

Node.js ecosystem.

------------------------------------------------------------------------

## Package Management

pnpm workspace.

------------------------------------------------------------------------

## API Style

Initial:

-   REST APIs

Future:

-   event-driven architecture

------------------------------------------------------------------------

# 4. TypeScript Standards

## Strict Mode Required

All projects should enable strict typing.

``` json
{
  "strict": true
}
```

------------------------------------------------------------------------

## Avoid Any

Avoid:

``` typescript
const result: any;
```

Prefer:

``` typescript
interface KnowledgeResult {
  id: string;
  title: string;
}
```

------------------------------------------------------------------------

## Shared Types

Common contracts belong in shared packages.

Example:

    packages/

    shared-types/

------------------------------------------------------------------------

# 5. Naming Conventions

## Files

Use:

    kebab-case

Examples:

    knowledge-engine.ts

    agent-router.ts

------------------------------------------------------------------------

## Classes

Use:

    PascalCase

Example:

``` typescript
class KnowledgeEngine {}
```

------------------------------------------------------------------------

## Functions

Use:

    camelCase

Example:

``` typescript
createKnowledgeObject()
```

------------------------------------------------------------------------

## Constants

Use:

    UPPER_SNAKE_CASE

Example:

``` typescript
MAX_RETRY_COUNT
```

------------------------------------------------------------------------

# 6. Service Design Rules

Every service should contain:

    service/

    ├── src/

    │   ├── domain/

    │   ├── application/

    │   ├── infrastructure/

    │   └── interfaces/

    ├── tests/

    ├── README.md

    └── package.json

------------------------------------------------------------------------

# 7. Domain Logic Rules

Business logic belongs in:

    domain/

Not:

-   controllers
-   API routes
-   database layers

Business rules should remain independent from implementation details.

------------------------------------------------------------------------

# 8. Error Handling Standards

Errors must be:

-   typed
-   meaningful
-   traceable

Prefer:

``` typescript
class KnowledgeNotFoundError extends Error {}
```

Avoid:

``` typescript
throw new Error("failed");
```

------------------------------------------------------------------------

# 9. Logging Standards

Important operations should record:

-   action
-   actor
-   timestamp
-   result
-   correlation ID

Example:

``` json
{
  "event": "knowledge_created",
  "actor": "hermes",
  "status": "success"
}
```

------------------------------------------------------------------------

# 10. Configuration Management

Never hardcode:

-   API keys
-   secrets
-   private URLs

Use:

-   environment variables
-   secret managers
-   secure configuration systems

------------------------------------------------------------------------

# 11. Database Standards

Database access must be separated.

Architecture:

    Service

    ↓

    Repository

    ↓

    Database

Avoid direct database logic inside controllers.

------------------------------------------------------------------------

# 12. API Standards

Every API must define:

-   request schema
-   response schema
-   error format
-   authentication rules

------------------------------------------------------------------------

# 13. AI-Generated Code Rules

AI-generated code must:

Required:

-   follow architecture
-   include tests
-   include documentation
-   pass verification

Forbidden:

-   unnecessary abstractions
-   unapproved dependencies
-   bypassing existing patterns

------------------------------------------------------------------------

# 14. Documentation Requirements

Every major feature requires:

    Implementation

    ↓

    Documentation Update

    ↓

    Architecture Update

    ↓

    Decision Record

------------------------------------------------------------------------

# 15. Git Standards

Commit format:

    feat:

    fix:

    docs:

    refactor:

    test:

    chore:

Examples:

    feat: add knowledge retrieval service

    docs: update architecture specification

------------------------------------------------------------------------

# 16. Code Review Standards

Review:

## Correctness

Does it work?

## Architecture

Does it follow system design?

## Maintainability

Can future developers understand it?

## Security

Does it protect data?

## Testing

Is behavior verified?

------------------------------------------------------------------------

# 17. AI Collaboration Rules

FounderOS code is created with AI assistance.

Code must be understandable by:

-   human developers
-   Codex
-   future AI agents

Avoid:

-   undocumented decisions
-   obscure patterns
-   unnecessary complexity

------------------------------------------------------------------------

# 18. Final Principle

FounderOS code is not only executed by machines.

It is consumed by:

> Humans, AI agents, and future versions of FounderOS itself.

Therefore:

**Write code as institutional knowledge.**
