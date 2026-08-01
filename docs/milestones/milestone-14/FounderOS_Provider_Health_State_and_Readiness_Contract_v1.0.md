# FounderOS Provider Health State and Readiness Contract v1.0

## Purpose

Define provider-neutral health and readiness evidence for future production adapters.

## Health States

- Unknown
- Healthy
- Degraded
- Unavailable
- Disabled
- Quarantined

## Readiness States

- Not assessed
- Not ready
- Ready for dry run
- Ready for controlled enablement
- Disabled by policy

Milestone 14 must not produce `Ready for live traffic`.

## Health Evidence

- Adapter ID and fingerprint
- Health state
- Circuit state
- Credential reference availability
- Authorization readiness
- Transport-policy readiness
- Rate and cost control readiness
- Observability readiness
- Last evaluation evidence
- Stable reason codes
- Health fingerprint

## Readiness Decision

The final readiness record should bind all required gate results and identify blockers.

## Principle

Provider readiness is a governed decision supported by evidence, not a Boolean configuration flag.
