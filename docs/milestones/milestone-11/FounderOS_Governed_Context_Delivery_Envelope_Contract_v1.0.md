# FounderOS Governed Context Delivery Envelope Contract v1.0

## Purpose

Define the immutable provider-neutral envelope that carries a verified Context Package to a future consumer boundary.

## Envelope Contents

The envelope should include:

- Contract version
- Delivery envelope ID
- Delivery request ID and fingerprint
- Context Package ID and fingerprint
- Consumer ID and descriptor fingerprint
- Delivery purpose
- Verified Context Package payload
- Active Snapshot binding summary
- Registry integrity binding summary
- Capability matching result
- Policy evidence
- Freshness and expiration evidence
- Idempotency key
- Replay policy
- Delivery sequence
- Created-at evidence
- Canonical delivery fingerprint

## Envelope Guarantees

The envelope must:

- Contain only one verified Context Package
- Preserve package bytes or canonical package payload
- Preserve provenance and omission evidence
- Preserve budget evidence
- Be immutable
- Be canonically serializable
- Be independently fingerprint-verifiable
- Contain no hidden unbudgeted knowledge
- Contain no provider-specific prompt or model request

## Failure Rules

No envelope may be created when:

- Context Package verification fails
- Package fingerprint does not match
- Consumer capability requirements are incompatible
- Freshness requirements fail
- Required policy evidence is missing
- Replay or idempotency rules fail

## Principle

The delivery envelope preserves governance across the boundary between context preparation and future reasoning.
