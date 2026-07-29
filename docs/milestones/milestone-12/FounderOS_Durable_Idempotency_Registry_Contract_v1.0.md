# FounderOS Durable Idempotency Registry Contract v1.0

## Purpose

Define restart-safe ownership and conflict rules for Context Delivery idempotency keys.

## Idempotency Ownership Record

A durable ownership record should include:

- Contract version
- Idempotency key
- Canonical Delivery Request fingerprint
- Delivery Request ID
- Original Delivery transaction ID
- Original Envelope ID and fingerprint
- Original Receipt ID and fingerprint
- Replay policy
- Freshness and expiration evidence
- Ownership sequence
- Created-at evidence
- Previous audit fingerprint
- Canonical ownership fingerprint

## Required Behavior

- First valid request claims an unused idempotency key atomically.
- Identical request replay resolves to the original committed result.
- Conflicting request reuse fails.
- Single-delivery mode rejects a second successful delivery.
- Repeatable modes remain subject to current freshness and policy checks.
- Recovery reconstructs ownership without process memory.
- Derived lookup indexes are rebuildable.

## Expiration

Expiration may remove an entry from an active derived index when policy permits, but it must not erase authoritative ownership or audit evidence.

## Principle

Idempotency is a durable governance fact, not a process-local cache entry.
