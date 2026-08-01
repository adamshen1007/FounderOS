# FounderOS Provider Response and Evidence Mapping Contract v1.0

## Purpose

Define how a future provider response would be normalized into Milestone 13 provider-neutral result evidence.

## Mapping Inputs

- Adapter descriptor
- Request Plan
- Provider response classification
- Redacted response metadata
- Provider usage metadata
- Provider cost metadata
- Provider error metadata
- Mapping policy version

## Mapping Outputs

A future mapper should produce:

- Provider-neutral execution outcome
- Canonical output content
- Execution Receipt evidence
- Usage Evidence
- Cost Evidence
- Failure, Timeout, Cancellation, or Rate-Limit Evidence
- Provider response reference fingerprint
- Mapping evidence fingerprint

## Required Rules

- Provider response data must not bypass Result Envelope verification.
- Unknown response fields are ignored only by explicit versioned policy.
- Provider-specific token and billing data must be labeled as provider reported.
- Error bodies must be sanitized before entering governed evidence.
- Credential and header material must never be persisted.
- Milestone 14 uses deterministic fixtures only.

## Principle

Provider-specific responses must be translated into portable evidence rather than becoming the system's canonical truth.
