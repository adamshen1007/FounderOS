# FounderOS Reasoning Execution Policy and Budget Contract v1.0

## Purpose

Define provider-neutral execution limits and governance rules for a Reasoning Invocation.

## Policy Fields

- Contract version
- Maximum input character count
- Maximum output character count
- Timeout duration
- Cancellation policy
- Retry policy
- Maximum attempt count
- Deterministic mode requirement
- Usage Evidence requirement
- Cost Evidence requirement
- Failure Evidence requirement
- Result persistence requirement
- Explicit evaluation timestamp
- Canonical policy fingerprint

## Budget Dimensions

Milestone 13 authoritative budgets should use provider-neutral dimensions:

- Input character count
- Output character count
- Attempt count
- Timeout duration

Optional token or monetary estimates may be evidence only and must not become provider-specific enforcement authority.

## Retry Policy

Initial modes may include:

- No retry
- Retry deterministic transient failure
- Retry until attempt limit
- Evaluation-only retry

## Cancellation Policy

Initial modes may include:

- Not cancellable
- Cancel before execution
- Cooperative cancellation
- Deadline cancellation

## Validation Rules

Reject unknown fields, unsupported modes, non-positive limits, contradictory retry and cancellation rules, unsupported deterministic requirements, and forged policy fingerprints.

## Principle

Execution policy constrains the provider boundary without depending on vendor-specific controls.
