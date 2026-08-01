# FounderOS Provider Circuit Breaker and Failure Containment Specification v1.0

## Purpose

Define provider-neutral containment of repeated failures and unsafe provider behavior.

## Circuit States

- Closed
- Open
- Half open
- Disabled
- Quarantined

## State Evidence

A Circuit State record should bind:

- Provider Adapter ID
- State
- Previous state
- Transition reason
- Failure-window evidence
- Threshold policy
- Opened-at evidence
- Next evaluation evidence
- Probe allowance
- State fingerprint

## Failure Categories

- Transport failure
- Timeout
- Rate limit
- Invalid response
- Evidence-mapping failure
- Credential unavailable
- Authorization failure
- Cost or capacity rejection
- Security-policy violation

## Required Behavior

- Disabled and Quarantined never permit transport.
- Open rejects normal requests.
- Half open permits only bounded probes under explicit policy.
- Security-policy violations may quarantine immediately.
- State transitions use explicit time and deterministic thresholds.
- Readiness and every disabled-harness mode categorically reject `reset`; reset is not a
  readiness operation and cannot reach Request Mapping, Health, or transport preparation.
- The pure transition model preserves an existing Disabled or Quarantined state before considering
  reset, so a future caller cannot clear either containment state by reordering transition logic.
- Milestone 14 simulates transitions without network calls.

## Principle

Provider failure must degrade safely and must not propagate uncontrolled retries or unsafe requests.
