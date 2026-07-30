# FounderOS Provider-Neutral Reasoning Evaluation Framework v1.0

## Purpose

Define deterministic evaluation scenarios for provider-neutral Reasoning Invocation and Result Evidence.

## Evaluation Dimensions

### Binding Integrity

- Invocation binds to exact Delivery Envelope and Receipt.
- Provider Capability and Execution Policy bind correctly.
- Result binds to exact Invocation and attempt.

### Capability Compatibility

- Supported input, output, timeout, cancellation, evidence, and version requirements pass.
- Incompatible requirements fail before execution.

### Execution Outcomes

- Success, failure, timeout, and cancellation are distinct.
- Contradictory evidence fails closed.
- Output budget is enforced.

### Idempotency and Retry

- Identical invocation returns the original finalized result.
- Conflicting idempotency reuse fails.
- Retry creates a new attempt and preserves prior evidence.
- Attempt limits are enforced.

### Evidence

- Usage and Cost Evidence verify.
- Failure, Timeout, and Cancellation Evidence verify.
- Final Consumption Evidence closes the chain.

### Bypass Resistance

- Raw knowledge, Query Results, hidden context, unverified Delivery artifacts, credentials, and physical paths are rejected.

## Required Scenarios

- Successful deterministic execution
- Identical repeat execution
- Conflicting invocation key
- Capability version mismatch
- Input budget mismatch
- Output budget mismatch
- Unsupported cancellation policy
- Unsupported retry policy
- Deterministic transient failure followed by retry success
- Permanent failure
- Timeout without retry
- Timeout followed by permitted retry
- Cancellation before execution
- Cooperative cancellation
- Attempt-limit exhaustion
- Malformed provider outcome
- Result output tampering
- Usage Evidence tampering
- Cost Evidence tampering
- Failure Evidence tampering
- Delivery Envelope substitution
- Receipt substitution
- Provider Capability substitution
- Execution Policy substitution
- Hidden context injection
- Credential leakage attempt
- Physical-path leakage attempt
- Final Consumption Evidence tampering
- Durable finalization replay
- Conflicting finalization

## Principle

Provider execution governance must be measurable before any production provider is connected.
