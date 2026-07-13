# Knowledge Engine Specification

## Purpose

The Knowledge Engine is responsible for Markdown vault, templates, prompts, lessons learned.

## Responsibilities

- Own this domain.
- Publish clear contracts.
- Remain loosely coupled to other engines.
- Emit events instead of direct hidden dependencies.

## Inputs

- Domain events
- Shared objects

## Outputs

- Reusable knowledge assets

## Primary Objects

- Project
- Specification
- Milestone
- Release (where applicable)

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
