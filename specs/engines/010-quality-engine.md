# Quality Engine Specification

## Purpose

The Quality Engine validates canonical content and generated artifacts before
publication.

## Responsibilities

- Validate Markdown, links, spelling, style, diagrams, and citations.
- Verify required chapter and book structures.
- Verify generated artifact presence and basic integrity.
- Produce actionable failures with nonzero exit codes.

## Inputs

- Domain events
- Shared objects

## Outputs

- Validation reports and release gates

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
