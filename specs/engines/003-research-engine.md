# Research Engine Specification

## Purpose

The Research Engine is responsible for Public sources, citations, trend reviews.

## Responsibilities

- Own this domain.
- Publish clear contracts.
- Remain loosely coupled to other engines.
- Emit events instead of direct hidden dependencies.

## Inputs

- Domain events
- Shared objects

## Outputs

- Research memos and citation packs

## Primary Objects

- Research topic
- Source
- Evidence
- Claim
- Research brief

## Events

- Receives domain-specific events.
- Emits completion and validation events.

## Dependencies

- Shared Kernel
- Governance policies
- AI Agent contracts (where applicable)

## Quality Gates

- Specification complete
- Acceptance criteria satisfied
- Version updated
- Changelog updated
- Human approval where required

## Acceptance Criteria

- Responsibilities are clearly defined.
- Interfaces documented.
- No overlap with other engine ownership.
- Sourced claims resolve through evidence to normalized source records.
- Synthesis uses at least two distinct sources.
- Freshness is reproducible from the topic's explicit review date.
- Generated briefs protect human modifications.
