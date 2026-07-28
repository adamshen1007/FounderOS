# FounderOS Milestone 06 Knowledge Repository and Candidate Source Foundation Specification v1.0

## Purpose

Define the repository abstraction layer that provides KnowledgeOS query
capabilities with managed knowledge sources.

## Objective

Move from Milestone 05 caller-supplied candidates to a controlled
Knowledge Repository foundation.

Current:

Caller -\> Query Engine -\> Knowledge Objects

Target:

Knowledge Repository -\> Candidate Source -\> Query Engine -\> Knowledge
Results

## Scope

Included:

-   Knowledge repository contract
-   Candidate source contract
-   Repository query integration
-   Deterministic evaluation

Excluded:

-   Database persistence
-   Vector databases
-   Embeddings
-   Semantic search
-   Ranking systems
-   Knowledge graph
-   Agents
-   MCP integrations

## Principle

Separate knowledge access from knowledge intelligence.
