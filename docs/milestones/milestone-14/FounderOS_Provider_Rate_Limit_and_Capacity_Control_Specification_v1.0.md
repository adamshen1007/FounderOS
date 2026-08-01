# FounderOS Provider Rate Limit and Capacity Control Specification v1.0

## Purpose

Define provider-neutral controls for request admission and capacity before transport.

## Control Dimensions

- Requests per governed time window
- Concurrent in-flight requests
- Maximum queued requests
- Provider-declared capacity state
- Retry-after evidence
- Consumer or project quota
- Invocation priority class
- Capacity policy version

## Admission Outcomes

- Admitted
- Rate limited
- Capacity exhausted
- Queue full
- Provider unavailable
- Policy denied

## Required Behavior

- Admission occurs before credential resolution and transport.
- Limits use explicit time evidence.
- Rate-limit state is bounded and deterministic in tests.
- Provider-reported rate limits may be mapped later but cannot silently override governed policy.
- Retry-after evidence is explicit.
- Rate-limit rejection produces stable evidence.
- Milestone 14 performs dry-run admission only.

## Principle

Provider capacity must be a governed resource, not an uncontrolled side effect of API calls.
