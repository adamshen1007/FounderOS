# FounderOS No-Direct-Provider-Bypass and Secure Execution Enforcement Policy v1.0

## Purpose

Prevent future provider integrations from bypassing FounderOS governance and security controls.

## Prohibited Public Paths

Public APIs must not allow:

- Direct provider HTTP calls
- Caller-supplied provider URLs
- Raw credential submission
- Provider execution without Authorization Evidence
- Provider execution without a verified Delivery transaction
- Provider execution without a verified Invocation Request
- Provider execution without Capability matching
- Provider execution without Rate and Cost admission
- Provider execution while Circuit is Open, Disabled, or Quarantined
- Provider execution without Observability and Redaction policy
- Hidden context injection
- Raw Knowledge Object or Query Result delivery
- Adapter enablement in Milestone 14

## Required Gate Order

1. Verify durable Delivery and Invocation.
2. Verify Authorization Evidence.
3. Verify Adapter Descriptor.
4. Verify Credential Reference.
5. Verify Capability compatibility.
6. Verify Transport Policy.
7. Verify Rate and Capacity admission.
8. Verify Cost and Budget admission.
9. Verify Circuit and Health state.
10. Verify Observability and Redaction readiness.
11. Construct a dry-run Request Plan.
12. Produce Readiness Evidence.
13. Stop before network execution.

## Principle

A real provider adapter must never become a shortcut around the governed reasoning boundary.
