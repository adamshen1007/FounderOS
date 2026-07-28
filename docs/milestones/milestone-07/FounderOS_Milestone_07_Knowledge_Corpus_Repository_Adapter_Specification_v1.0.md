# FounderOS Milestone 07 Knowledge Corpus Repository Adapter Specification v1.0

## Purpose

Define the first KnowledgeOS repository adapter connecting the approved FounderOS knowledge corpus to the repository abstraction created in Milestone 06.

## Objective

Move from:

    In-memory Repository
            |
            v
    Query Engine

to:

    Canonical Knowledge Corpus
            |
            v
    Corpus Candidate Source Adapter
            |
            v
    Knowledge Repository
            |
            v
    Query Engine

## Scope

Included:

- Knowledge corpus loading
- Corpus candidate source adapter
- Versioned repository snapshot
- Snapshot identity
- Refresh detection foundation

Excluded:

- Database persistence
- Embeddings
- Vector search
- Semantic retrieval
- Ranking
- Knowledge graph
- Agents
- MCP
- UI

## Principle

The knowledge corpus should become a controlled source of truth before intelligence layers are added.
