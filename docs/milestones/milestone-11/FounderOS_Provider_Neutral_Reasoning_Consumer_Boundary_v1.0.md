# FounderOS Provider-Neutral Reasoning Consumer Boundary v1.0

## Purpose

Define the adapter boundary through which future reasoning providers may receive governed delivery envelopes.

## Boundary Responsibilities

A future adapter may:

- Declare consumer capabilities
- Accept a governed delivery envelope
- Validate envelope compatibility
- Return a delivery receipt
- Return future consumption evidence

## Boundary Must Not

- Query KnowledgeOS directly
- Request unbudgeted Knowledge Objects
- Modify the Context Package
- Bypass policy evidence
- Ignore freshness or replay rules
- Reconstruct hidden full query results
- Invoke a provider in Milestone 11

## Provider Neutrality

The contract must not contain:

- Provider names
- Model names
- Chat role structures
- API credentials
- Temperature or sampling controls
- Tokenizer-specific fields
- Pricing information

## Future Compatibility

Milestone 12 may add provider adapters behind this boundary while preserving Context Package and delivery guarantees.

## Principle

Reasoning providers are replaceable consumers of governed context, not owners of organizational knowledge.
