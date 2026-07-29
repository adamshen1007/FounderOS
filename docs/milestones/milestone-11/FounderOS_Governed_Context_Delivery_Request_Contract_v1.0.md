# FounderOS Governed Context Delivery Request Contract v1.0

## Purpose

Define the request to deliver one verified Context Package to one declared consumer.

## Required Fields

A delivery request should include:

- Contract version
- Delivery request ID
- Context Package ID
- Context Package fingerprint
- Consumer descriptor
- Delivery purpose
- Requested capability requirements
- Policy decision input
- Requested freshness policy
- Idempotency key
- Replay policy
- Request actor
- Request timestamp evidence
- Request reason
- Canonical request fingerprint

## Policy Decision Input

The request may carry policy-related facts such as:

- Subject reference
- Intended purpose
- Project or domain scope
- Data classification
- Required approval reference
- Requested operation

The contract does not decide authorization.

## Validation Rules

Reject:

- Unknown fields
- Unsupported versions
- Empty purpose or reason
- Missing package binding
- Invalid consumer descriptor
- Contradictory freshness or replay rules
- Duplicate or malformed idempotency identifiers
- Forged request fingerprint

## Principle

A delivery request is an auditable request for governed handoff, not a direct provider call.
