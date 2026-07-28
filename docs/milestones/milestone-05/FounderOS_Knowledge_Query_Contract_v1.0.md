# FounderOS Knowledge Query Contract v1.0

## Purpose

Define the request model for KnowledgeOS queries.

## Query Object

A query should contain:

-   Query identifier
-   User or agent context
-   Filters
-   Requested object types
-   Scope restrictions

Example:

``` json
{
  "type": "decision",
  "project": "FounderOS",
  "status": "approved"
}
```

## Filtering

Supported initial filters:

-   Object type
-   Project
-   Status
-   Tags
-   Source

## Principle

Queries should be explicit, traceable, and deterministic.
