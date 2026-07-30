# FounderOS Milestone 13 Acceptance Criteria v1.0

## Contract Criteria

- [ ] Reasoning Invocation Request contract is implemented.
- [ ] Provider Capability Descriptor contract is implemented.
- [ ] Provider-neutral input contract is implemented.
- [ ] Execution Policy contract is implemented.
- [ ] Result Envelope and execution-evidence contracts are implemented.
- [ ] Consumption Evidence finalization contract is implemented.
- [ ] Unknown fields, unsupported versions, and forged fingerprints are rejected.
- [ ] Shared contracts remain provider, model, storage, and agent independent.

## Delivery Binding Criteria

- [ ] Every invocation binds to one verified Delivery Envelope and Receipt.
- [ ] Context Package, Active Snapshot, Registry, Consumer, and Policy bindings are preserved.
- [ ] Invocation without verified durable Delivery evidence fails.
- [ ] No raw knowledge or Query Result bypass exists.

## Capability Criteria

- [ ] Provider Capability matching is deterministic.
- [ ] Input and output limits are enforced.
- [ ] Timeout, retry, cancellation, and evidence compatibility are enforced.
- [ ] Capability mismatch fails before execution.
- [ ] Provider Capability substitution is detected.

## Execution Criteria

- [ ] A deterministic fake provider is implemented.
- [ ] No network or credential access occurs.
- [ ] Success, failure, timeout, and cancellation outcomes are distinct.
- [ ] Output budget is enforced.
- [ ] Malformed provider outcomes fail closed.

## Idempotency and Retry Criteria

- [ ] Invocation idempotency is enforced.
- [ ] Identical replay returns the original finalized result.
- [ ] Conflicting key reuse fails.
- [ ] Retry creates a new immutable attempt.
- [ ] Attempt limits are enforced.
- [ ] Prior attempt evidence is never rewritten.

## Evidence Criteria

- [ ] Execution Receipt verifies independently.
- [ ] Usage Evidence verifies independently.
- [ ] Cost Evidence status and amount semantics verify.
- [ ] Failure, Timeout, and Cancellation Evidence verify.
- [ ] Result Envelope verifies independently.
- [ ] Final Consumption Evidence closes the exact Delivery-to-Result chain.

## Durability Criteria

- [ ] Finalized execution evidence is append-only through a governed durable boundary.
- [ ] Finalization survives restart when persistence is implemented.
- [ ] Identical finalization replay is idempotent.
- [ ] Conflicting finalization fails.
- [ ] Low-level persistence bypass is not publicly exposed.

## Regression Criteria

- [ ] All Milestone 04–12 tests remain green.
- [ ] Milestone 11 and 12 no-context-bypass guarantees remain mandatory.
- [ ] New Milestone 13 tests pass.

## Non-Goals

Milestone 13 does not include real provider adapters, credentials, streaming, tool calling, Agent or Hermes runtime, MCP, authorization, semantic retrieval, embeddings, vector databases, ranking, knowledge graphs, or UI.

## Definition of Done

FounderOS can execute a governed provider-neutral Reasoning Invocation through a deterministic fake provider, produce and durably bind independently verifiable result evidence, and finalize Consumption Evidence without invoking a real model provider.
