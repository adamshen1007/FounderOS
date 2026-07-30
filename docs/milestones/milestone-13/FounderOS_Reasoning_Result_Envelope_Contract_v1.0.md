# FounderOS Reasoning Result Envelope Contract v1.0

## Purpose

Define the immutable provider-neutral result of a governed Reasoning Invocation.

## Result Envelope Fields

- Contract version
- Result Envelope ID
- Invocation Request ID and fingerprint
- Delivery Transaction ID
- Delivery Envelope ID and fingerprint
- Delivery Receipt ID and fingerprint
- Provider Capability ID and fingerprint
- Execution Attempt ID
- Attempt number
- Outcome status
- Canonical output content
- Output content fingerprint
- Execution Receipt
- Usage Evidence
- Cost Evidence
- Failure, Timeout, or Cancellation Evidence when applicable
- Completed-at evidence
- Canonical Result Envelope fingerprint

## Outcome Status

Initial statuses:

- Succeeded
- Failed
- Timed out
- Cancelled

## Output Rules

Successful output must:

- Use provider-neutral content types
- Respect output budget
- Contain no hidden Context Package additions
- Contain no credentials or physical paths
- Be immutable and canonically serializable

Non-success outcomes must not include contradictory successful output.

## Verification

Independent verification must recompute every nested fingerprint and validate all Delivery, Invocation, Provider Capability, attempt, output, and evidence bindings.

## Principle

A Result Envelope is the auditable output of one exact governed execution attempt.
