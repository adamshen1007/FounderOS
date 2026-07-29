# FounderOS Context Consumer Identity and Capability Contract v1.0

## Purpose

Define the identity, type, and declared capability requirements of a future Context Package consumer.

## Consumer Types

The initial provider-neutral contract may represent:

- Human-assisted service
- Internal service
- Future reasoning provider
- Future agent runtime
- Evaluation harness

These types describe intended consumption and do not grant permission.

## Consumer Identity

A consumer descriptor should include:

- Contract version
- Consumer ID
- Consumer type
- Display name
- Owning system or domain
- Declared purpose
- Capability declarations
- Policy subject reference
- Descriptor fingerprint

## Capability Declarations

Capabilities may include provider-neutral requirements such as:

- Maximum accepted character count
- Maximum accepted object count
- Accepted Context Package contract versions
- Accepted assembly policy versions
- Required provenance support
- Required replay support
- Required receipt support
- Whether truncated content is accepted
- Whether empty Context Packages are accepted

Do not include model names, provider names, tokenizers, pricing, or API-specific settings.

## Validation Rules

The contract must:

- Reject unknown fields
- Reject unsupported versions
- Require stable consumer identity
- Require explicit purpose
- Reject contradictory capabilities
- Require bounded limits
- Require a deterministic descriptor fingerprint

## Principle

Consumer capability describes what a recipient can safely accept; it does not authorize delivery.
