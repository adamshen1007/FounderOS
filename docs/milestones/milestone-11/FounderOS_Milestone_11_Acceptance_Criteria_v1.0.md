# FounderOS Milestone 11 Acceptance Criteria v1.0

## Contract Criteria

- [ ] Consumer identity and capability contract is implemented.
- [ ] Delivery request contract is implemented.
- [ ] Delivery envelope contract is implemented.
- [ ] Delivery receipt contract is implemented.
- [ ] Unknown fields and unsupported versions are rejected.
- [ ] Contracts remain provider, model, storage, and agent independent.

## Context Integrity Criteria

- [ ] Every delivered package passes independent verification.
- [ ] Delivery binds to the exact Context Package fingerprint.
- [ ] Active Snapshot and Registry bindings are preserved.
- [ ] No raw or unbudgeted Knowledge Objects can bypass the package.
- [ ] Package mutation is detected.

## Consumer Compatibility Criteria

- [ ] Consumer capabilities are validated deterministically.
- [ ] Contract-version compatibility is enforced.
- [ ] Size and truncation compatibility is enforced.
- [ ] Receipt and replay capability requirements are enforced.

## Policy Boundary Criteria

- [ ] Policy input is represented explicitly.
- [ ] Policy decision evidence is fingerprinted.
- [ ] `Not evaluated` is never treated as `Allowed`.
- [ ] Missing required policy evidence fails closed.
- [ ] Authorization itself is not implemented.

## Freshness and Replay Criteria

- [ ] Freshness and expiration are explicit.
- [ ] Superseded-snapshot behavior is explicit.
- [ ] Identical idempotent replay is stable.
- [ ] Conflicting idempotency reuse fails.
- [ ] Single-use replay is rejected.

## Delivery and Receipt Criteria

- [ ] Delivery envelope is immutable and deterministic.
- [ ] Delivery fingerprint is content-derived.
- [ ] Accepted and rejected delivery outcomes produce evidence.
- [ ] Receipt binds package, consumer, request, and envelope.
- [ ] Receipt tampering is detected.

## Regression Criteria

- [ ] All Milestone 04–10 tests remain green.
- [ ] New Milestone 11 tests pass.

## Non-Goals

Milestone 11 does not include:

- LLM or prompt execution
- Provider-specific payload construction
- Agent or Hermes runtime
- Authentication or authorization implementation
- MCP integrations
- Model-output persistence
- Semantic retrieval, embeddings, vector databases, ranking, or knowledge graphs
- UI

## Definition of Done

FounderOS can deterministically create, verify, govern, and receipt a provider-neutral delivery envelope for a verified Context Package without invoking a model or agent.
