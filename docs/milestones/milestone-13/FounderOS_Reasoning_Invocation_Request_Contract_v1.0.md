# FounderOS Reasoning Invocation Request Contract v1.0

## Purpose

Define the provider-neutral request to execute reasoning against one exact Governed Delivery Envelope.

## Required Fields

- Contract version
- Invocation Request ID
- Delivery Transaction ID
- Delivery Envelope ID and fingerprint
- Delivery Receipt ID and fingerprint
- Consumer ID and Descriptor fingerprint
- Invocation purpose
- Provider Capability requirements
- Provider-neutral reasoning input
- Execution Policy
- Invocation idempotency key
- Request actor
- Request reason
- Requested-at evidence
- Canonical request fingerprint

## Required Bindings

The request must bind to:

- Exact Context Package fingerprint
- Exact Active Snapshot binding
- Exact Registry integrity binding
- Exact Policy Decision Evidence
- Exact Consumer identity
- Exact Delivery Receipt

## Validation Rules

Reject unknown fields, unsupported versions, empty purpose or reason, invalid IDs, forged Delivery or Receipt bindings, unsupported content types, contradictory Execution Policy, invalid timeout or budget values, duplicate idempotency identifiers, and forged request fingerprints.

## Principle

A Reasoning Invocation Request consumes a governed Delivery artifact; it never queries organizational knowledge directly.
