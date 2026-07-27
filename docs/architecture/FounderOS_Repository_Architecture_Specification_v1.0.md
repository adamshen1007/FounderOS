# FounderOS Repository Architecture Specification v1.0

## Document Status

Version: v1.0\
Layer: System Architecture Official Specification

------------------------------------------------------------------------

# 1. Purpose

This document defines the repository organization, code boundaries,
dependency rules, and development structure of FounderOS.

The repository must support:

-   modular AI systems
-   independent agent evolution
-   KnowledgeOS development
-   MCP integrations
-   multiple interfaces
-   long-term scalability

------------------------------------------------------------------------

# 2. Repository Philosophy

## Monorepo First

FounderOS is a complete system, not a collection of unrelated
applications.

Benefits:

-   shared standards
-   shared contracts
-   controlled dependencies
-   easier evolution

------------------------------------------------------------------------

## Clear Responsibility Boundaries

Avoid:

    Everything

    ↓

    One Large Application

Prefer:

    Independent Services

    +

    Shared Contracts

    +

    Clear Interfaces

------------------------------------------------------------------------

## Documentation Is Part of the Repository

The repository contains:

-   specifications
-   architecture decisions
-   implementation guides
-   operating rules

------------------------------------------------------------------------

# 3. High-Level Repository Structure

    FounderOS/

    ├── apps/

    ├── services/

    ├── packages/

    ├── integrations/

    ├── infrastructure/

    ├── docs/

    ├── specs/

    ├── tests/

    ├── scripts/

    ├── .github/

    ├── package.json

    ├── pnpm-workspace.yaml

    └── README.md

------------------------------------------------------------------------

# 4. Applications Layer

Location:

    apps/

Purpose:

User-facing applications.

------------------------------------------------------------------------

## apps/web

FounderOS web interface.

Responsibilities:

-   dashboard
-   chat interface
-   project views
-   decision views
-   knowledge exploration

------------------------------------------------------------------------

## apps/mobile

Mobile FounderOS experience.

Responsibilities:

-   quick capture
-   voice input
-   notifications
-   mobile workflows

------------------------------------------------------------------------

# 5. Services Layer

Location:

    services/

Purpose:

Core backend capabilities.

------------------------------------------------------------------------

## services/hermes-runtime

Responsibilities:

-   reasoning orchestration
-   conversation handling
-   context assembly
-   recommendations

------------------------------------------------------------------------

## services/agent-router

Responsibilities:

-   task classification
-   agent selection
-   workflow execution

------------------------------------------------------------------------

## services/knowledge-engine

Responsibilities:

-   document ingestion
-   parsing
-   metadata extraction
-   indexing

------------------------------------------------------------------------

## services/memory-service

Responsibilities:

-   identity memory
-   project memory
-   decision memory
-   execution memory

------------------------------------------------------------------------

## services/mcp-gateway

Responsibilities:

-   MCP communication
-   authentication
-   permissions
-   tool execution

------------------------------------------------------------------------

# 6. Packages Layer

Location:

    packages/

Purpose:

Shared libraries and contracts.

------------------------------------------------------------------------

## packages/knowledge-schema

Defines:

-   knowledge objects
-   metadata schemas
-   validation rules

------------------------------------------------------------------------

## packages/agent-contracts

Defines:

-   agent interfaces
-   task schemas
-   communication contracts

------------------------------------------------------------------------

## packages/memory-types

Defines:

-   memory structures
-   event schemas

------------------------------------------------------------------------

## packages/shared-config

Defines:

-   environment configuration
-   common settings

------------------------------------------------------------------------

## packages/skills-sdk

Defines reusable AI skills.

Examples:

-   Market Intelligence Skill
-   Research Skill
-   Product Analysis Skill

------------------------------------------------------------------------

# 7. Integrations Layer

Location:

    integrations/

Purpose:

External system connectors.

Structure:

    integrations/

    ├── obsidian/

    ├── github/

    ├── notion/

    ├── calendar/

    ├── reddit/

    └── email/

Each integration contains:

-   connector logic
-   authentication
-   tests
-   documentation

------------------------------------------------------------------------

# 8. Infrastructure Layer

Location:

    infrastructure/

Purpose:

Deployment and operations.

Structure:

    infrastructure/

    ├── docker/

    ├── deployment/

    ├── database/

    ├── monitoring/

    └── security/

------------------------------------------------------------------------

# 9. Documentation Layer

Location:

    docs/

Purpose:

System knowledge.

Structure:

    docs/

    ├── governance/

    ├── strategy/

    ├── knowledgeos/

    ├── agents/

    ├── architecture/

    ├── engineering/

    └── operations/

------------------------------------------------------------------------

# 10. Specification Layer

Location:

    specs/

Purpose:

Formal technical definitions.

Examples:

    specs/

    ├── api/

    ├── database/

    ├── agent-protocols/

    ├── events/

    └── schemas/

------------------------------------------------------------------------

# 11. Testing Architecture

Testing levels:

## Unit Tests

Individual functions.

## Integration Tests

Service interactions.

## Agent Evaluation Tests

AI output quality.

## System Tests

End-to-end workflows.

Example:

    Founder Question

    ↓

    Hermes

    ↓

    Knowledge Retrieval

    ↓

    Agent Execution

    ↓

    Memory Update

------------------------------------------------------------------------

# 12. Dependency Rules

## Rule 1

Apps depend on services.

Services do not depend on apps.

------------------------------------------------------------------------

## Rule 2

Services depend on packages.

Packages cannot depend on services.

------------------------------------------------------------------------

## Rule 3

Integrations communicate through MCP Gateway.

No uncontrolled direct connections.

------------------------------------------------------------------------

# 13. Development Workflow

Initial setup:

``` bash
pnpm install

pnpm lint

pnpm test

pnpm build
```

Development flow:

    Feature Request

    ↓

    Specification Update

    ↓

    Implementation

    ↓

    Testing

    ↓

    Documentation Update

    ↓

    Commit

------------------------------------------------------------------------

# 14. GitHub Structure

Recommended:

    .github/

    ├── workflows/

    ├── ISSUE_TEMPLATE/

    ├── PULL_REQUEST_TEMPLATE.md

    └── CODEOWNERS

------------------------------------------------------------------------

# 15. Future Scalability

Supports:

## Personal FounderOS

One founder.

## Team FounderOS

Multiple users.

## Venture Studio FounderOS

Multiple companies and AI workforces.

------------------------------------------------------------------------

# 16. Final Principle

The repository structure is not only about organizing code.

It is:

> The physical architecture that allows FounderOS intelligence, agents,
> and knowledge systems to evolve independently.
