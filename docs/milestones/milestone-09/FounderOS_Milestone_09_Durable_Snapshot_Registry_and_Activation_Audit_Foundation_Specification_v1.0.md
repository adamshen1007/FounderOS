# FounderOS Milestone 09 Durable Snapshot Registry and Activation Audit Foundation Specification v1.0

## Purpose

Define a durable, recoverable, and auditable persistence boundary for governed KnowledgeOS snapshots and activation decisions.

## Objective

Persist the governance state produced by Milestones 07 and 08 without coupling KnowledgeOS contracts to a specific database or retrieval technology.

## Current State

Milestone 08 provides governed in-memory behavior:

```text
Snapshot
  -> Lifecycle transitions
  -> Comparison and change set
  -> Human review and approval
  -> Atomic in-memory activation
```

Milestone 09 adds durability:

```text
Governed Snapshot Operations
        |
        v
Durable Snapshot Registry
        |
        v
Append-Only Audit Records
        |
        v
Atomic Activation Transaction
        |
        v
Recovery and Integrity Verification
```

## In Scope

- Immutable snapshot registration
- Durable lifecycle transition records
- Durable approval and rejection evidence
- Atomic activation transaction records
- Active-snapshot recovery
- Audit-chain integrity verification
- Explicit single-writer concurrency protection
- Replaceable storage contracts
- One minimal local file-backed adapter
- Deterministic serialization and recovery tests

## Out of Scope

- General-purpose project or user databases
- Object-store persistence
- Distributed consensus
- Multi-region replication
- Automatic corpus refresh
- Background watchers and event streaming
- Embeddings and vector databases
- Semantic retrieval and ranking
- Knowledge graph persistence
- Agents, Hermes, MCP, integrations, and UI

## Core Design Rules

1. Snapshot records are immutable.
2. Lifecycle and approval history is append-only.
3. Active snapshot state is derived from committed activation transactions.
4. Activation is all-or-nothing.
5. Every state-changing record is actor-attributed and reason-bearing.
6. Every durable record is canonicalized and fingerprinted.
7. Recovery must reject corrupted, incomplete, or contradictory state.
8. Storage adapters must be replaceable behind shared contracts.

## Definition of Success

Milestone 09 is complete when FounderOS can restart, reload the durable registry, verify its integrity, recover the active snapshot, and reproduce the same governed state without relying on process memory.
