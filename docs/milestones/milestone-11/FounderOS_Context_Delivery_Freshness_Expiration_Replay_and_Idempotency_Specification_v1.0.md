# FounderOS Context Delivery Freshness, Expiration, Replay, and Idempotency Specification v1.0

## Purpose

Define deterministic controls that prevent stale, duplicate, or unauthorized reuse of Context Package deliveries.

## Freshness Policy

Freshness may bind to:

- Context Package creation evidence
- Active Snapshot ID
- Active Snapshot activation sequence
- Maximum age
- Not-before timestamp evidence
- Expiration timestamp evidence
- Whether a newer active snapshot invalidates delivery

## Expiration

An expired request or envelope must fail closed.

Wall-clock evidence must be supplied explicitly to deterministic domain operations rather than read implicitly inside pure logic.

## Idempotency

The same idempotency key and identical canonical request payload should return the original delivery result.

Reusing the idempotency key with different content must fail.

## Replay Policy

Initial replay modes may include:

- Single delivery only
- Repeatable identical delivery
- Repeatable until expiration
- Evaluation-only replay

Replay policy must be explicit and versioned.

## Active Snapshot Change Rule

The request must declare whether a Context Package remains deliverable after its bound snapshot is superseded. The default governed behavior should be fail closed unless an approved policy permits historical replay.

## Principle

A verified Context Package is not automatically valid forever or for every repeated use.
