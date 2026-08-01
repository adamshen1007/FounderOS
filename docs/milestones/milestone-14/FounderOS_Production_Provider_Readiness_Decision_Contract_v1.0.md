# FounderOS Production Provider Readiness Decision Contract v1.0

## Purpose

Define the canonical result of evaluating all production-provider readiness gates.

## Decision Fields

- Contract version
- Readiness Decision ID
- Adapter ID and fingerprint
- Invocation Request ID and fingerprint
- Authorization Decision fingerprint
- Credential Reference fingerprint
- Capability Result fingerprint
- Transport Policy fingerprint
- Request Plan fingerprint
- Rate and Capacity Decision fingerprint
- Cost and Budget Decision fingerprint
- Circuit State fingerprint
- Health Evidence fingerprint
- Observability Readiness fingerprint
- Observability Retention fingerprint
- Evaluation timestamp
- Readiness status
- Blocking reason codes
- Warning reason codes
- Canonical Decision fingerprint

## Readiness Status

Milestone 14 supports:

- Not assessed
- Not ready
- Ready for dry run
- Disabled by policy

It must not support `Ready for live traffic`.

## Rules

- All mandatory gates must verify.
- Blocking reasons are deterministic and ordered.
- Warnings cannot override blockers.
- Enabled Adapter state fails.
- Any credential, path, secret, or network-execution evidence fails.
- A retention-bound Decision is verifiable only with its original exact retention evidence,
  authoritative input, and the same evaluator instance while its private issued-pair entry remains
  resident. Verification reconstructs observability deterministically and must not emit another
  retained artifact. This Milestone 14 issuance authority is bounded in memory and is not durable or
  cross-process evidence.

## Principle

Production readiness is an evidence-backed governance artifact, not an informal checklist.
