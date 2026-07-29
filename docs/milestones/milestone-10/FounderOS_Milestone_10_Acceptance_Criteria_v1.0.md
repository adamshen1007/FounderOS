# FounderOS Milestone 10 Acceptance Criteria v1.0

## Contract Criteria

- [ ] Versioned context request contract is implemented.
- [ ] Versioned context package contract is implemented.
- [ ] Unknown fields and invalid versions are rejected.
- [ ] Shared contracts remain storage, model, and agent independent.

## Active Snapshot Binding Criteria

- [ ] Registry integrity is verified before assembly.
- [ ] Context binds to exactly one active snapshot.
- [ ] Repository snapshot matches active snapshot evidence.
- [ ] Binding remains stable for the complete operation.
- [ ] Invalid integrity or binding fails before output.

## Selection Criteria

- [ ] Existing query contracts are reused.
- [ ] Selection and ordering are deterministic.
- [ ] Required IDs and types are enforced.
- [ ] Equivalent duplicates are handled deterministically.
- [ ] Conflicting duplicates fail.
- [ ] Required objects cannot be silently omitted.

## Budget Criteria

- [ ] Object-count budget is enforced.
- [ ] Character-count budget is enforced.
- [ ] Optional per-object limit is enforced.
- [ ] Truncation is explicit and deterministic.
- [ ] Over-budget, omitted, and truncated evidence is complete.
- [ ] Budget arithmetic independently verifies.

## Evidence Criteria

- [ ] Included objects preserve identity, provenance, and source hash.
- [ ] Exclusion and omission evidence is machine-readable.
- [ ] Truncation evidence binds original and included content.
- [ ] Physical machine paths are not leaked.

## Reproducibility Criteria

- [ ] Context package fingerprint is content-derived.
- [ ] Wall-clock timestamps do not break identity.
- [ ] Identical inputs produce byte-identical canonical output.
- [ ] Independent package verification detects tampering.

## Regression Criteria

- [ ] All Milestone 04–09 tests remain green.
- [ ] New Milestone 10 tests pass.

## Non-Goals

Milestone 10 does not include LLM execution, prompt execution, agents, Hermes, MCP, authorization enforcement, embeddings, vector search, semantic ranking, knowledge graph persistence, or UI.

## Definition of Done

FounderOS can assemble and independently verify a deterministic, budget-bounded, provenance-complete context package from the durably governed active Knowledge Snapshot.
