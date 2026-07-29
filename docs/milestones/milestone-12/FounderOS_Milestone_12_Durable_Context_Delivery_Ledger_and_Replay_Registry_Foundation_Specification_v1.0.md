# FounderOS Milestone 12 Durable Context Delivery Ledger and Replay Registry Foundation Specification v1.0

## Purpose

Define durable, restart-safe, tamper-evident persistence for governed Context Delivery, Receipt, Replay, and Idempotency evidence.

## Objective

Make Milestone 11 delivery guarantees survive process restart without introducing model execution, distributed consensus, or a general-purpose database.

## Current State

Milestone 11 provides:

```text
Verified Context Package
        |
        v
Governed Delivery Envelope
        |
        v
Acknowledgment and Receipt
        |
        v
In-Memory Replay and Idempotency State
```

Milestone 12 adds:

```text
Durable Request Registration
        |
        v
Atomic Delivery Transaction
        |
        v
Append-Only Delivery Ledger
        |
        v
Durable Replay Attempt Records
        |
        v
Restart Recovery and Integrity Verification
```

## In Scope

- Immutable durable Delivery Request registration
- Durable idempotency-key ownership
- Durable Delivery Envelope records
- Durable Acknowledgment and Receipt records
- Durable Replay Attempt evidence
- Atomic first-delivery transaction
- Restart-safe replay behavior
- Single-delivery enforcement across restart
- Repeatable-until-expiration recovery
- Tamper-evident audit chain
- Derived replay and idempotency indexes
- Deterministic retention and expiration policy
- One replaceable local file-backed adapter
- Crash recovery and corruption detection
- Deterministic evaluation fixtures

## Out of Scope

- LLM or provider invocation
- Prompt execution
- Agent or Hermes runtime
- Authentication
- Authorization engine
- MCP gateway
- Distributed idempotency
- Distributed locking
- Remote coordination
- General-purpose databases
- Semantic retrieval or ranking
- Embeddings and vector databases
- Knowledge graph persistence
- UI applications

## Core Design Rules

1. Authoritative delivery records are immutable and append-only.
2. Idempotency ownership is durable.
3. A first delivery commits Request, Envelope, Acknowledgment, and Receipt atomically.
4. Replay Attempts are separate durable records.
5. Active replay eligibility is derived from committed evidence.
6. Derived indexes are rebuildable and non-authoritative.
7. Expiration does not erase authoritative audit history.
8. Recovery fails closed on corruption, contradiction, or missing evidence.
9. Exactly one original Delivery Result exists per committed idempotency key and canonical request.
10. No public API may bypass Milestone 11 package and policy verification.

## Definition of Success

FounderOS can restart, recover committed Delivery artifacts and replay state, preserve single-delivery and idempotency guarantees, independently verify the complete ledger, and reproduce the exact original delivery result without invoking a model or agent.
