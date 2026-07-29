# FounderOS Knowledge Context Evaluation Framework v1.0

## Purpose

Define deterministic evaluation fixtures and quality measures for governed context assembly.

## Evaluation Dimensions

### Correctness

- Required objects are included.
- Out-of-scope objects are excluded.
- Query and scope constraints are respected.

### Completeness

- Required evidence is present.
- Required object types are represented.
- Missing required knowledge fails explicitly.

### Provenance

- Every included object is traceable to canonical source evidence.
- Snapshot and registry bindings verify.

### Determinism

- Candidate input ordering does not affect output.
- Repeated assembly produces byte-identical canonical output.

### Budget Compliance

- Object and character limits are respected.
- Truncation and omission evidence is complete.
- Required objects are never silently dropped.

## Required Fixture Categories

- FounderOS governance context
- FounderOS architecture context
- Decision-focused context
- Empty matching set
- Missing required object
- Equivalent duplicate candidate
- Conflicting duplicate candidate
- Over-budget context with truncation disabled
- Over-budget context with truncation enabled
- Active snapshot mismatch
- Corrupted registry integrity evidence
- Candidate-order permutation
- Included-content tampering
- Omission-evidence tampering

## Principle

Context quality must be measurable before any LLM or agent consumes it.
