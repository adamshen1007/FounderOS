# FounderOS Knowledge Context Package Contract v1.0

## Purpose

Define the canonical result produced by governed Knowledge Context Assembly.

## Package Contents

- Contract version
- Context package ID
- Request ID and canonical request fingerprint
- Purpose and consumer context
- Active snapshot ID and content fingerprint
- Active manifest fingerprint
- Registry integrity fingerprint
- Repository snapshot ID and fingerprint
- Query ID and canonical query fingerprint
- Query-result fingerprint
- Assembly policy version
- Budget policy and exact budget usage
- Ordered included object entries
- Excluded object evidence
- Omitted object evidence
- Truncation evidence
- Evidence counts
- Optional non-identity timestamp evidence
- Canonical context fingerprint

## Included Object Entry

Each included entry should preserve:

- Object ID and type
- Lifecycle status
- Project or domain metadata
- Canonical included content
- Original object fingerprint
- Source provenance
- Logical source identifier
- Source hash
- Included-content fingerprint
- Included character count
- Selection position
- Selection reason

## Guarantees

The package must be immutable, deterministic, canonically serializable, provenance preserving, independently fingerprint-verifiable, bound to one active snapshot, and bound to one request and query execution.

## Principle

A context package is an auditable knowledge artifact, not an opaque concatenated prompt.
