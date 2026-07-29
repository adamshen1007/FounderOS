# FounderOS No-Context-Bypass and Package Integrity Enforcement Policy v1.0

## Purpose

Prevent consumers and adapters from bypassing governed Context Assembly.

## Prohibited Paths

Public delivery APIs must not allow:

- Raw Knowledge Object delivery
- Full unbudgeted query-result delivery
- Direct repository access
- Direct corpus-file access
- Delivery from an inactive or unverified snapshot
- Delivery of an unverified Context Package
- Provider-specific hidden context injection
- Mutation of package content
- Omission of provenance, exclusion, or budget evidence

## Required Verification

Before delivery:

1. Verify the Context Package.
2. Verify package fingerprint.
3. Verify active snapshot and registry binding.
4. Verify consumer descriptor.
5. Verify capability compatibility.
6. Verify policy evidence.
7. Verify freshness, expiration, replay, and idempotency rules.
8. Generate a delivery fingerprint.
9. Produce a receipt.

## Public API Rule

Low-level helpers may exist internally for deterministic testing, but the public governed delivery API must enforce every required step.

## Principle

No future reasoning system may receive knowledge through a less-governed path than the approved Context Package boundary.
