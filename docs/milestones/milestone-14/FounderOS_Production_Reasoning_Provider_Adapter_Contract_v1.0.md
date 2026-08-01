# FounderOS Production Reasoning Provider Adapter Contract v1.0

## Purpose

Define the provider-neutral contract that future real provider adapters must implement.

## Adapter Responsibilities

A future adapter may declare capabilities, validate a governed Invocation, map provider-neutral input into a provider request plan, apply secure transport policy, produce response evidence, and return governed outcomes.

## Adapter Must Not

- Query KnowledgeOS directly
- Read raw Knowledge Objects or full Query Results
- Accept hidden context
- Receive raw credentials through the Invocation
- Bypass authorization evidence
- Ignore cost, rate, timeout, or cancellation policy
- Emit unredacted logs
- Enable itself in Milestone 14

## Required Fields

- Adapter contract version
- Adapter ID
- Provider family reference
- Capability descriptor reference
- Request-mapping version
- Response-mapping version
- Transport-policy version
- Observability-policy version
- Enabled state
- Adapter fingerprint

## Enabled State

Milestone 14 supports only:

- Disabled
- Validation only
- Dry-run mapping

Network execution remains unavailable.

## Principle

A production adapter is a constrained implementation behind the governed execution boundary, not an alternate path around it.
