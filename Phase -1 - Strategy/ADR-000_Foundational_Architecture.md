# ADR-000 --- Foundational Architecture

## Status

Accepted

## Context

FounderOS requires a long-lived architecture that preserves knowledge,
supports AI automation, and avoids vendor lock-in.

## Decisions

### Source of Truth

Git repository with Markdown documents.

### Knowledge Graph

Obsidian provides local knowledge management and bidirectional linking.

### Editorial Workspace

Notion provides review workflows, dashboards, and publishing management.

### AI Layer

Specialized AI agents (e.g., ChatGPT, Codex and future agents)
collaborate through documented workflows rather than one monolithic
prompt.

### Automation

CI/CD validates Markdown, diagrams, citations, and produces PDF, EPUB,
DOCX, and website outputs.

## Rationale

This architecture maximizes portability, version control, automation,
and long-term maintainability while allowing best-in-class tools to
evolve independently.

## Consequences

Benefits: - Vendor independence - Reusable documentation - Strong
version history - Automated publishing

Trade-offs: - More initial setup - Multiple integrated tools -
Governance required for consistency
