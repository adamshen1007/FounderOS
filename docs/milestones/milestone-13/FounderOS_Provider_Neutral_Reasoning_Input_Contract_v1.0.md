# FounderOS Provider-Neutral Reasoning Input Contract v1.0

## Purpose

Define a model-independent input representation for governed reasoning invocation.

## Input Structure

The initial input may contain:

- Contract version
- Instruction blocks
- Context reference
- Output requirements
- Constraint blocks
- Evaluation metadata
- Canonical input fingerprint

## Instruction Block

An Instruction Block should include:

- Stable block ID
- Block type
- Canonical text content
- Priority
- Source classification
- Fingerprint

## Block Types

Provider-neutral block types may include:

- System constraint
- Task instruction
- Context reference
- Output requirement
- Evaluation directive

Do not use provider-specific chat roles or message schemas.

## Context Rule

The input must reference the exact verified Context Package already embedded in the Delivery Envelope. It must not embed raw Knowledge Objects, full Query Results, or additional hidden context.

## Validation Rules

Reject unknown blocks, duplicate block IDs, physical paths, credentials, unsupported content types, noncanonical text, forged fingerprints, and any context not bound to the Delivery Envelope.

## Principle

The input contract expresses reasoning intent without becoming a vendor-specific prompt payload.
