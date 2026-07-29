# FounderOS Milestone 10 Governed Knowledge Context Assembly Foundation Specification v1.0

## Purpose

Define a governed and deterministic Knowledge Context Assembly layer for FounderOS.

## Objective

Create reproducible context packages that are bound to an approved active Knowledge Snapshot and preserve complete evidence about included, excluded, omitted, and truncated knowledge.

## Architecture Evolution

```text
Context Request
        |
        v
Active Snapshot Resolution
        |
        v
Knowledge Query
        |
        v
Deterministic Selection
        |
        v
Budget Enforcement
        |
        v
Governed Context Package
```

## In Scope

- Versioned context request and package contracts
- Active snapshot and registry-integrity binding
- Query and query-result evidence binding
- Deterministic selection and ordering
- Object-count and character-count budgets
- Optional token-estimate evidence without tokenizer dependency
- Included, excluded, omitted, and truncated object evidence
- Context package fingerprinting and reproducibility verification
- Deterministic evaluation fixtures
- Empty, insufficient, invalid, and over-budget outcomes

## Out of Scope

- LLM execution
- Prompt templates or model-specific messages
- Agent or Hermes runtime
- MCP gateway
- Authorization implementation
- Embeddings, vector databases, semantic ranking, or knowledge graph persistence
- UI applications

## Core Design Rules

1. Every package binds to exactly one verified active snapshot.
2. Assembly fails closed if registry recovery or integrity verification fails.
3. Selection uses explicit filters and deterministic policy only.
4. No hidden semantic ranking or model inference may affect selection.
5. Every included object preserves identity, provenance, and source evidence.
6. Every excluded, omitted, or truncated candidate has machine-readable evidence.
7. Budget accounting is deterministic.
8. Context package identity is content-derived.
9. Identical valid inputs and policy version produce byte-identical canonical output.
10. Assembly never mutates knowledge, repository, or snapshot state.

## Definition of Success

FounderOS can create and independently verify a deterministic, budget-bounded, provenance-complete context package from the durably governed active Knowledge Snapshot without invoking an LLM or agent.
