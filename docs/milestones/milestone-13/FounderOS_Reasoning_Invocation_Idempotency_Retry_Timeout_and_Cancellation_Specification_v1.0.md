# FounderOS Reasoning Invocation Idempotency, Retry, Timeout, and Cancellation Specification v1.0

## Purpose

Define deterministic execution lifecycle controls for governed Reasoning Invocations.

## Invocation Idempotency

The same Invocation idempotency key and identical canonical request must resolve to the original finalized invocation result.

Conflicting reuse of the same key with different canonical content must fail.

## Attempt Identity

Every execution attempt must have:

- Stable Attempt ID
- Invocation Request fingerprint
- Attempt number
- Provider Capability fingerprint
- Execution Policy fingerprint
- Explicit start evidence
- Attempt fingerprint

## Retry Rules

Retries are permitted only by the verified Execution Policy.

A retry must:

- Preserve the original Invocation and Delivery bindings
- Increment attempt number deterministically
- Record the previous attempt
- Re-evaluate timeout and cancellation state
- Never change provider capability requirements silently

## Timeout Rules

Timeout logic must use injected time or deterministic fake-provider evidence.

Timeout must produce a terminal attempt outcome unless the Retry Policy permits a new attempt.

## Cancellation Rules

Cancellation must be explicit, evidence-bearing, and bound to the Invocation.

Cancellation may occur:

- Before execution
- During cooperative execution
- At a deadline

A cancelled attempt must never be represented as successful.

## Finalization

Only one finalized Invocation Result may own the Invocation idempotency key.

Attempt history remains append-only.

## Principle

Retries create new attempts; they do not rewrite prior execution evidence.
