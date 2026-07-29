# FounderOS Knowledge Context Request Contract v1.0

## Purpose

Define the storage-independent request contract for assembling a governed Knowledge Context Package.

## Required Fields

- Contract version
- Request ID
- Purpose
- Consumer context
- Existing Knowledge Query contract
- Required object IDs, when applicable
- Required object types, when applicable
- Preferred object types, when applicable
- Scope constraints
- Budget policy
- Assembly policy version
- Request reason
- Optional caller evidence timestamp

## Consumer Context

The request may identify a human, service, or future agent consumer. Consumer context records identity and purpose but does not grant authorization.

## Initial Budget Policy

- Maximum object count
- Maximum canonical character count
- Optional per-object character limit
- Whether truncation is allowed
- Required-object failure behavior
- Empty-context behavior

## Validation Rules

The request must reject unknown fields, unsupported versions, invalid IDs, empty purpose, contradictory scope rules, duplicate required IDs, unbounded or non-positive limits, contradictory budget settings, and unsupported policy versions.

## Principle

A context request is an explicit evidence-bearing instruction, not a free-form prompt.
