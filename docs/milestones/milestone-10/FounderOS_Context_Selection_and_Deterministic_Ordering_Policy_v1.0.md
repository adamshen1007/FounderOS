# FounderOS Context Selection and Deterministic Ordering Policy v1.0

## Purpose

Define deterministic rules for selecting and ordering Knowledge Objects in a context package.

## Selection Inputs

- Existing Knowledge Query filters
- Explicit required object IDs
- Required object types
- Preferred object types
- Lifecycle status
- Project and domain scope
- Source, category, and tag constraints

## Initial Ordering Policy

1. Explicit required-object priority
2. Required object-type order declared by the request
3. Preferred object-type order declared by the request
4. Explicitly documented governance or lifecycle priority
5. Canonical object type
6. Canonical project or domain identity
7. Canonical object ID

## Duplicate Handling

- Conflicting duplicate identities fail closed.
- Canonically equivalent identities may be included once.
- Duplicate handling should produce deterministic evidence when relevant.

## Evidence Categories

Every non-included candidate should be classified as filtered out, duplicate, over budget, omitted by policy, truncated, invalid, or missing-required.

## Principle

Context selection must be reproducible without hidden model judgment.
