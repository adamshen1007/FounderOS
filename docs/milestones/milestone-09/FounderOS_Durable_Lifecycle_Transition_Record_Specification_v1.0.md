# FounderOS Durable Lifecycle Transition Record Specification v1.0

## Purpose

Define the immutable record used to persist KnowledgeOS snapshot lifecycle transitions.

## Transition Record

Each transition record should include:

- Record schema version
- Transition ID
- Snapshot ID
- From state
- To state
- Actor identity
- Actor type
- Reason
- Occurred-at timestamp
- Related change-set ID, when applicable
- Related approval decision ID, when applicable
- Previous audit record fingerprint
- Canonical payload fingerprint

## Rules

- Transition IDs must be unique.
- Transitions must follow Milestone 08 lifecycle rules.
- Repeated equivalent submissions may be idempotent.
- Conflicting reuse of an ID must fail.
- Historical transition records must never be mutated.
- Timestamps are evidence, not ordering authority by themselves.
- Durable sequence or audit-chain ordering must be explicit.

## Validity

A transition record is valid only when:

- Its snapshot is registered.
- Its source state matches recovered state.
- Its target state is allowed.
- Its evidence references exist when required.
- Its canonical fingerprint verifies.

## Principle

Lifecycle history is an immutable audit trail, not a mutable status column.
