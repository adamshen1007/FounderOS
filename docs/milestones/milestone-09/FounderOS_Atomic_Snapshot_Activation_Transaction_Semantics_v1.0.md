# FounderOS Atomic Snapshot Activation Transaction Semantics v1.0

## Purpose

Define all-or-nothing activation behavior for governed KnowledgeOS snapshots.

## Transaction Inputs

An activation transaction requires:

- Candidate snapshot
- Current active snapshot, if any
- Expected active snapshot precondition
- Approved change set
- Approval decision
- Activation actor and reason

## Atomic Effects

A successful activation transaction must commit these effects together:

1. Record candidate transition to Active.
2. Record previous active snapshot transition to Superseded, when applicable.
3. Persist activation audit evidence.
4. Advance the audit chain.
5. Make the new active state recoverable.

No partial effect may be externally visible as committed.

## Concurrency Rule

Use optimistic compare-and-swap semantics:

```text
expectedActiveSnapshotId == recoveredActiveSnapshotId
```

If the condition fails, activation must abort without committed state changes.

## Idempotency

Replaying the same transaction ID with the same canonical payload should return the original committed result.

Reusing the transaction ID with a different payload must fail.

## Crash Safety

The adapter must ensure that interruption:

- Before commit leaves no committed activation.
- After commit yields a fully recoverable activation.
- Never produces two active snapshots.

## Principle

There must be exactly one governed active knowledge state after every committed activation transaction.
