# FounderOS Local File-Backed Context Delivery Ledger Adapter Specification v1.0

## Purpose

Define the minimal replaceable adapter that proves durable Delivery and Replay governance.

## Default Runtime Root

Use an explicit Git-ignored root, for example:

```text
.founderos/runtime/context-delivery-ledger/
```

Do not write into canonical `docs/` or `knowledge/` trees.

## Suggested Layout

```text
context-delivery-ledger/
├── metadata.json
├── transactions/
├── replay-attempts/
├── checkpoints/
├── staging/
└── derived/
```

## Commit Protocol

Use:

1. Explicit single-writer lock
2. Expected ledger-head verification
3. Idempotency ownership verification
4. Complete transaction preparation in staging
5. Canonical serialization and fingerprinting
6. Flush where supported
7. Atomic installation of one committed transaction envelope
8. Directory flush where supported
9. Derived index update or deterministic rebuild
10. Lock release

A transaction is committed only when its authoritative committed envelope is atomically installed.

## Path and Input Safety

The adapter must reject:

- Lexical path traversal
- Physical path traversal
- Symlink escape
- Runtime root overlap with canonical sources
- Nested unsafe repositories or trees
- Accessor-backed configuration
- Physical-path leakage in public errors
- Credential-bearing data
- Resource-limit breaches before mutation

## Recovery

Temporary or incomplete staging files must be ignored.

Recovery must use authoritative committed transaction envelopes and Replay Attempt records, not derived indexes.

## Scope

Milestone 12 supports cooperative local administration and explicit single-writer behavior. Distributed writers and hostile filesystem concurrency remain deferred.

## Principle

The local adapter proves persistence semantics without defining the permanent storage technology.
