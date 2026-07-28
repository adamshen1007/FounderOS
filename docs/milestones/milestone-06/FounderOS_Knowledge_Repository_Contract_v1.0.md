# FounderOS Knowledge Repository Contract v1.0

## Purpose

Define the abstraction for accessing Knowledge Objects.

## Responsibilities

The repository provides:

-   Knowledge object retrieval
-   Object lookup
-   Candidate discovery
-   Deterministic access

## Contract

Example:

``` typescript
interface KnowledgeRepository {
  find(query): KnowledgeObject[];
  getById(id): KnowledgeObject | null;
}
```

## Requirements

Repository implementations must:

-   Preserve identity
-   Preserve provenance
-   Return validated objects
-   Maintain deterministic behavior

## Principle

Repository provides access, not intelligence.
