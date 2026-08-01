# FounderOS Milestone 14 Acceptance Criteria v1.0

## Contract Criteria

- [ ] Production Adapter contract is implemented.
- [ ] Authorization Enforcement contracts are implemented.
- [ ] Credential Reference contracts are implemented.
- [ ] Transport, mapping, rate, cost, circuit, observability, health, and readiness contracts are implemented.
- [ ] Unknown fields, unsupported versions, accessors, credentials, physical paths, and forged fingerprints are rejected.
- [ ] Shared contracts remain provider-neutral and storage-independent.

## Authorization Criteria

- [ ] Only `Allowed` authorization may pass.
- [ ] Missing, expired, denied, review-required, and not-evaluated evidence fail closed.
- [ ] Authorization binds the exact Invocation, Consumer, Delivery, Context Package, Adapter, and operation.
- [ ] Authorization enforcement occurs before Credential or Transport planning.

## Credential Criteria

- [ ] Governed artifacts contain references only.
- [ ] Raw credentials are rejected.
- [ ] Secret values never enter logs, traces, metrics, errors, or canonical evidence.
- [ ] Milestone 14 does not store real credentials.

## Transport Criteria

- [ ] HTTPS and hostname allowlists are enforced in dry-run validation.
- [ ] Arbitrary URLs, redirects, private targets, metadata targets, unsafe TLS, and credentials in URLs are rejected.
- [ ] Request, response, and timeout limits are explicit.
- [ ] No socket or network request can occur.

## Admission and Containment Criteria

- [ ] Rate and capacity admission is deterministic.
- [ ] Cost ceilings and pricing availability are enforced.
- [ ] Circuit and Health states are explicit.
- [ ] Disabled, Open, and Quarantined states reject execution.
- [ ] Failure containment produces stable evidence.

## Observability Criteria

- [ ] Logs, Metrics, and Traces are redacted before emission.
- [ ] Raw Context, credentials, provider bodies, paths, and secrets are never emitted.
- [ ] Metrics cardinality and field size are bounded.
- [ ] Deterministic in-memory sinks are used.

## Harness Criteria

- [ ] Disabled Adapter Harness implements all readiness gates.
- [ ] Enabled-state configuration is rejected.
- [ ] Request and Response mapping use fixtures only.
- [ ] No network, credentials, random, or implicit time dependency exists.
- [ ] Readiness Evidence verifies independently.

## Regression Criteria

- [ ] All Milestone 04–13 tests remain green.
- [ ] No-provider-bypass guarantees remain mandatory.
- [ ] New Milestone 14 tests pass.

## Definition of Done

FounderOS can independently verify all production-provider readiness gates and produce a deterministic `Ready for dry run` or fail-closed readiness result while production transport remains structurally disabled.
