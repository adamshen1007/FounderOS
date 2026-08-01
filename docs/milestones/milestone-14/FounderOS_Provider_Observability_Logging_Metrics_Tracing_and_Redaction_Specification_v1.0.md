# FounderOS Provider Observability, Logging, Metrics, Tracing, and Redaction Specification v1.0

## Purpose

Define safe operational visibility for future production-provider execution.

## Observability Evidence

The system may emit:

- Invocation correlation ID
- Delivery transaction reference
- Adapter ID
- Request Plan fingerprint
- Outcome classification
- Duration
- Usage summary
- Cost summary
- Rate-limit status
- Circuit state
- Retry count
- Stable error category

## Prohibited Data

Never emit:

- Credential values
- Authorization headers
- Raw provider request bodies
- Raw Context Package content
- Full provider response bodies
- Physical filesystem paths
- Environment dumps
- Personal access tokens
- Secret-bearing URLs

## Redaction Rules

- Redaction occurs before serialization or sink delivery.
- Key-based and value-pattern redaction are both required.
- Unknown sensitive fields fail closed or are omitted under explicit policy.
- Public errors use stable logical identifiers.
- Trace attributes have bounded length and cardinality.
- Metrics labels must not contain user content or unbounded IDs.

## Milestone 14 Scope

Use deterministic in-memory observability sinks and fixtures only. Do not integrate external logging, tracing, or metrics vendors.

Each successful observability gate appends its already-redacted bundle exactly once. It returns
strict retention evidence binding the Adapter and Invocation, Observability readiness artifact,
fixed sink policy and bounds, exact ordered retained fingerprints and counts, canonical snapshot
fingerprint, and `appendCount: 1`. Readiness replay consumes that original evidence and reconstructs
the same bundle and snapshot without creating a sink or emitting again. The final verified
Decision/evidence pair is authorized only in the issuing evaluator's private four-entry,
first-issued FIFO registry. Identical repeat issuance is idempotent and does not refresh FIFO order;
a fresh evaluator or evicted pair fails closed. The registry is not caller-configurable, durable, or
cross-process evidence. Any mismatch fails at the observability gate.

## Principle

Operational visibility must never become a data-exfiltration path.
