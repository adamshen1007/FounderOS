# FounderOS Context Fingerprint and Reproducibility Specification v1.0

## Purpose

Define canonical identity and reproducibility requirements for Knowledge Context Packages.

## Identity Inputs

The context fingerprint binds to:

- Contract version
- Canonical request payload
- Active snapshot and manifest fingerprints
- Registry integrity fingerprint
- Repository snapshot identity
- Query payload and result fingerprint
- Assembly policy version
- Budget policy
- Ordered included entries
- Exclusion, omission, and truncation evidence
- Evidence counts

## Timestamp Rule

Wall-clock timestamps may be stored as evidence but do not affect reproducibility identity unless the request explicitly binds to a caller-supplied evidence timestamp.

## Determinism Rule

Identical verified registry state, active snapshot, repository snapshot, request, query behavior, and policy version must produce byte-identical canonical package output and the same fingerprint.

## Independent Verification

A pure verification operation should recompute the package fingerprint, included-content fingerprints, evidence counts, budget arithmetic, stable ordering, active snapshot binding, and registry binding.

## Principle

Context used for AI reasoning must be independently reproducible and verifiable.
