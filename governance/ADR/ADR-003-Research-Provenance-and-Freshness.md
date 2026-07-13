# ADR-003 — Research Provenance and Freshness

## Status

Accepted

## Context

Research output must be auditable and reproducible without making live network
availability part of every local build.

## Decision

Store topic, source, evidence, and claim records as separate schema-valid YAML
files. Link claims to evidence IDs and evidence to source IDs. Use the topic's
explicit `research.asOf` date for freshness calculations.

Generate one research brief and one hash-only state file. Apply the M2 ownership
model: unchanged generated output may be updated, while unowned or modified
output requires review and `--force`.

## Consequences

- Provenance is inspectable with ordinary text tools and Git.
- Research builds remain deterministic and work offline.
- A human must verify sources before advancing the review date.
- Record granularity creates more files but allows precise validation.

## Alternatives Considered

- Live validation on every build was rejected because network state is unstable.
- One large research document was rejected because relationships are ambiguous.
- A database was rejected because M3 does not need a private service.
- Automatic freshness timestamps were rejected because they break reproducibility.
