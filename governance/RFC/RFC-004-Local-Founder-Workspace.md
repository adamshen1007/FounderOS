# RFC-004 — Local Founder Workspace

## Status

Accepted for M5A implementation

## Evidence and Assumptions

Repository evidence shows four validated workflows: publishing, engineering-kit
generation, research automation, and governed agent review. The product
requirements call for a founder dashboard and multi-project analytics, while
the strategy recommends internal validation before a commercial product.

No user interviews are claimed. M5A assumes that one local view over existing
artifacts will reduce context switching; the pilot must test that assumption.

## Product Boundary

M5A provides a local-only workspace that registers repository-contained
projects, derives read models from canonical files, and launches a small
allowlist of existing CLI workflows. Markdown and YAML remain authoritative.

Primary journeys:

1. Open one workspace and understand which project needs attention.
2. Inspect research, milestone, and agent-run health without reading raw files.
3. Launch a validated workflow, observe its result, and retain human approval.

## Included

- Versioned workspace, summary, and job schemas
- Deterministic multi-project indexer
- Loopback-only HTTP API and responsive dashboard
- Allowlisted, single-concurrency workflow jobs
- Redacted logs, request validation, CSRF defense, and restart recovery
- A committed two-project workspace example

## Deferred

Authentication, remote access, cloud storage, teams, billing, marketplace,
mobile clients, autonomous jobs, automatic Git operations, and publication are
outside M5A. Any one of them requires a new RFC and threat-model update.

## Success Measures

- A fresh clone can start the workspace with one documented command.
- Two projects index without copying their canonical content.
- Dashboard values match CLI-derived state.
- Invalid paths and unapproved workflow requests fail closed.
- Restarted servers retain terminal job records.
- CI uses no secret, cloud service, or live model.

## Exit Criteria

M5A is accepted after the two-project example, API tests, adversarial tests,
responsive browser review, clean-tree quality suite, and operator guide pass.

## M5A.1 Amendment

The internal-pilot release adds registry commands, live derived indexing,
project dossiers, cancellable and rerunnable jobs, sanitized diagnostics, and
pilot evidence records. It does not expand the local trust boundary. Hosted
M5B remains blocked until completed pilot records meet the published protocol.
