# FounderOS Reasoning Provider Capability Descriptor Contract v1.0

## Purpose

Define a provider-neutral description of what a reasoning executor can accept and produce.

## Descriptor Fields

- Contract version
- Provider Capability ID
- Provider class
- Accepted Invocation Request versions
- Accepted Delivery Envelope versions
- Accepted input content types
- Maximum input character count
- Maximum output character count
- Supported timeout range
- Supported cancellation behavior
- Supported retry behavior
- Supported deterministic execution mode
- Supported Usage Evidence
- Supported Cost Evidence
- Supported Failure Evidence
- Supported Result Envelope versions
- Descriptor fingerprint

## Provider Classes

Initial provider-neutral classes may include:

- Deterministic fake provider
- Remote reasoning provider
- Local reasoning provider
- Evaluation provider

These classes do not name a vendor or model.

## Validation Rules

Reject unknown fields, duplicate versions, non-positive limits, contradictory capabilities, unsupported combinations, empty capability identity, and forged fingerprints.

## Principle

Capability matching determines compatibility; it does not select a vendor or model.
