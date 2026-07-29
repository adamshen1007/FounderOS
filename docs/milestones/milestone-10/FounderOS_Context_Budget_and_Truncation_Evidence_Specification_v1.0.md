# FounderOS Context Budget and Truncation Evidence Specification v1.0

## Purpose

Define deterministic budget enforcement and evidence for context assembly.

## Initial Budget Dimensions

- Maximum object count
- Maximum canonical character count
- Optional per-object character limit
- Optional deterministic token estimate as evidence only

No model-specific tokenizer is required.

## Budget Accounting

The package should record requested limits, used object count, used character count, per-object character counts, and the documented estimation method when optional token estimates are present.

## Required Objects

Required objects must never be silently removed. If required objects exceed a hard budget, assembly must return a stable failure or governed insufficient-context outcome.

## Truncation

Truncation is allowed only when explicitly enabled. Evidence must include object ID, original and included character counts, deterministic boundary, reason, original object fingerprint, and included-content fingerprint. Truncation must be UTF-8 safe and must not mutate source objects.

## Over-Budget Evidence

Objects omitted due to budget must record object ID, ordering position, reason, and estimated budget impact.

## Principle

Budget limits must reduce context transparently, never invisibly.
