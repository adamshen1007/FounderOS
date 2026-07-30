# FounderOS Reasoning Execution Receipt, Usage, Cost, Failure, and Cancellation Evidence Contract v1.0

## Purpose

Define provider-neutral evidence for the execution of a Reasoning Invocation.

## Execution Receipt

The Execution Receipt should include:

- Contract version
- Execution Attempt ID
- Invocation Request ID and fingerprint
- Provider Capability ID and fingerprint
- Attempt number
- Started-at evidence
- Completed-at evidence
- Outcome
- Canonical receipt fingerprint

## Usage Evidence

Usage Evidence may include:

- Input character count
- Output character count
- Instruction block count
- Context Package object count
- Attempt count
- Duration evidence
- Optional estimated input units
- Optional estimated output units
- Canonical Usage Evidence fingerprint

Provider-specific token accounting is deferred.

## Cost Evidence

Cost Evidence may include:

- Evidence status
- Currency code when applicable
- Amount in minor units when applicable
- Estimation method
- Pricing reference version
- Whether the value is actual, estimated, unavailable, or not applicable
- Canonical Cost Evidence fingerprint

The deterministic fake provider should normally return `not-applicable` or deterministic zero-cost evidence.

## Failure Evidence

Failure Evidence should include:

- Failure category
- Stable reason codes
- Retryable classification
- Sanitized failure detail
- Attempt number
- Canonical Failure Evidence fingerprint

## Timeout Evidence

Timeout Evidence should include:

- Configured timeout
- Deterministic elapsed evidence
- Timeout phase
- Stable reason code
- Canonical fingerprint

## Cancellation Evidence

Cancellation Evidence should include:

- Cancellation mode
- Cancellation phase
- Cancellation authority reference
- Requested-at evidence
- Observed-at evidence
- Stable reason code
- Canonical fingerprint

## Principle

Operational evidence must explain the execution outcome without exposing provider secrets or implementation-specific diagnostics.
