# ADR-000 — Foundational Architecture

## Status

Accepted

## Context

FounderOS requires a long-lived architecture that preserves knowledge, supports AI automation, and avoids vendor lock-in.

## Decision

- Git + Markdown is the source of truth.
- Obsidian is the knowledge graph.
- Notion is the editorial workspace.
- AI agents operate through documented workflows.
- CI/CD validates and publishes outputs.

## Consequences

Benefits:
- Portability
- Version control
- AI-editable content
- Multi-format publishing

Trade-offs:
- More initial setup
- Requires governance
- Requires clear sync rules
