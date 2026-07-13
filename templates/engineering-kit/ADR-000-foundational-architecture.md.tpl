# ADR-000 — Foundational Architecture for {{project.name}}

## Status

Proposed

## Context

{{project.name}} is at the {{product.stage}} stage. The architecture must support
the first validated use case without assuming future scale or integrations.

## Decision

- Treat Markdown and version control as the initial source of truth.
- Keep components loosely coupled through explicit interfaces.
- Add managed services only when a verified requirement needs them.
- Record material architectural changes in subsequent ADRs.

## Consequences

- The first implementation remains inspectable and portable.
- Some automation stays manual until its value is demonstrated.
- Architecture can evolve without rewriting undocumented assumptions.

## Alternatives Considered

- Building a complete platform before validating the core workflow
- Using private operational state as the only source of truth
