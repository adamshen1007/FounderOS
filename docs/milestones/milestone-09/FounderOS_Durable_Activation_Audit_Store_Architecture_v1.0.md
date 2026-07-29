# FounderOS Durable Activation Audit Store Architecture v1.0

## Purpose

Define the durable storage boundary for immutable snapshot governance records.

## Logical Architecture

```text
Knowledge Engine
        |
        v
Snapshot Registry Contract
        |
        v
Activation Audit Store Contract
        |
        v
Replaceable Adapter
```

## Authoritative Record Categories

The audit store should persist:

1. Snapshot registrations
2. Lifecycle transition records
3. Approval and rejection decisions
4. Activation transaction records
5. Integrity metadata and audit-chain checkpoints

## Append-Only Principle

Governance evidence must be append-only.

Mutable indexes may exist for performance, but they are:

- Derived
- Rebuildable
- Non-authoritative

## Active State

The current active snapshot should be recoverable by replaying verified committed activation transactions.

A cached active pointer may exist, but it must never be the only source of truth.

## Adapter Boundary

The initial adapter may be local and single-process, but the contract must allow future:

- SQLite or relational adapters
- Managed database adapters
- Remote governance services

without changing KnowledgeOS lifecycle contracts.

## Failure Model

The store must distinguish:

- Uncommitted temporary data
- Committed records
- Corrupted records
- Conflicting records
- Incomplete transactions

## Principle

Durability must preserve governance semantics, not merely serialize objects.
