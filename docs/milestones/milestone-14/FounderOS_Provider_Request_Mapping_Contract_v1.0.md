# FounderOS Provider Request Mapping Contract v1.0

## Purpose

Define how a provider-neutral Invocation may be mapped into a future provider request without executing it.

## Mapping Inputs

- Verified Invocation Request
- Verified Provider Capability Descriptor
- Verified Production Adapter Descriptor
- Verified Authorization Evidence
- Credential Reference
- Transport Policy
- Cost and rate budgets
- Mapping policy version

## Dry-Run Request Plan

The output should include:

- Mapping contract version
- Request Plan ID
- Adapter ID and fingerprint
- Invocation ID and fingerprint
- Credential Reference ID
- Transport Policy ID and fingerprint
- Method classification
- Logical endpoint classification
- Redacted header plan
- Provider-neutral body mapping evidence
- Input-size evidence
- Timeout and cancellation plan
- Expected response constraints
- Mapping warnings
- Canonical Request Plan fingerprint

## Restrictions

The plan must not contain:

- Secret credential values
- A live Authorization header
- A caller-controlled URL
- Unredacted sensitive content
- Provider request execution capability
- Tool or function-call payloads
- Hidden context

## Principle

Request mapping should be reviewable before it becomes executable.
