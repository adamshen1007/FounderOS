# FounderOS Knowledge Result Contract v1.0

## Purpose

Define the response format returned from KnowledgeOS queries.

## Result Object

Contains:

-   Knowledge objects
-   Metadata
-   Provenance
-   Query context
-   Evaluation information

Example:

``` json
{
  "objects": [],
  "provenance": {},
  "confidence": "deterministic"
}
```

## Requirements

Results must preserve:

-   Source traceability
-   Object identity
-   Metadata integrity

## Principle

Every knowledge response must be explainable.
