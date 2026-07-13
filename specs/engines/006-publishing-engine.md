# Publishing Engine Specification

## Purpose

The Publishing Engine converts canonical Markdown into reproducible derived
formats while preserving source traceability.

## Responsibilities

- Discover and order canonical book content.
- Render source-first diagrams for output formats.
- Generate HTML, EPUB, and DOCX artifacts.
- Verify output structure and metadata.
- Keep generated output separate from canonical sources.

## Inputs

- Book metadata and Markdown chapters
- Publishing output profiles
- Validated diagrams and referenced assets
- An approved source revision

## Outputs

- M1: standalone HTML, EPUB 3, and DOCX
- Later milestones: PDF, Notion, and hosted website outputs

## Primary Objects

- Project
- Specification
- Milestone
- Release (where applicable)

## Events

- Receives domain-specific events.
- Emits completion and validation events.

## Dependencies

- Governance and citation policies
- Quality Engine validation results
- Pandoc and Mermaid CLI for the M1 implementation

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
