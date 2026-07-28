# FounderOS Candidate Source Contract v1.0

## Purpose

Define how knowledge sources provide candidates to KnowledgeOS.

## Future Sources

-   File system
-   Database
-   External APIs
-   MCP connectors

## Contract

A candidate source provides:

-   Source identity
-   Available objects
-   Provenance metadata

## Rules

Candidate sources must not:

-   Modify knowledge objects
-   Bypass validation
-   Remove provenance

## Principle

Sources provide candidates; repositories manage access.
