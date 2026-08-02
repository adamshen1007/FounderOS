# FounderOS Milestone 15 Package README v1.0

## Status

**Specified — not implemented**

## Milestone

**Milestone 15 — Durable Production-Provider Readiness Evaluation Ledger and Replay Verification Registry Foundation**

## Purpose

Milestone 15 is specified to replace Milestone 14's deliberately process-local readiness-decision issuance limitation with durable transaction evidence and fresh-evaluator replay verification after restart.

It preserves Milestone 14's structural stop before credential resolution and provider transport. A stored evaluation remains an audit artifact, not live-execution authority.

## Architecture

```text
Durable Delivery and Invocation Authority
        |
        v
Non-Executing Milestone 14 Evaluator
        |
        v
Verified Canonical Evaluation Package
        |
        v
Atomic Durable Registration Transaction
        |
        v
Fresh-Evaluator Replay Attempts
```

Replay has two independent time axes: historical reconstruction always uses immutable `originalEvaluationTime`, while current admissibility uses explicit `replayEvaluatedAt`. A historical match may therefore be recorded together with current Authorization expiration or denial.

The ledger begins with one deterministic explicit genesis history/head/marker commitment. Genesis and each later event retain one immutable archived marker value. Atomic installation of byte-identical bytes at the fixed current-marker location is the sole authoritative visibility boundary; the archive preserves history but cannot activate visibility. The exact embedded head uses audit-entry, semantic-event, and subject-transaction coordinates; `readHead()` returns those same bytes, while separate `HEAD` projections and indexes are derived and rebuildable. Registration callers request every original-event ID, and both registration and replay idempotency keys and IDs are globally owned. The transaction contract contains the sole normative commitment-domain table, the local adapter contains the sole 19-row event fault-point matrix plus explicit genesis initialization fault behavior, and the acceptance criteria contain clause-level source ownership plus the normative requirement-to-scenario traceability matrix.

Contracts are intended for `@founderos/knowledge-schema`; orchestration, canonical verification, ledger ports, and the local adapter are intended for `@founderos/knowledge-engine`. Dependency direction remains `knowledge-engine -> knowledge-schema`.

## Document Inventory

1. `FounderOS_Milestone_15_Durable_Production_Provider_Readiness_Evaluation_Ledger_and_Replay_Verification_Registry_Foundation_Specification_v1.0.md`
2. `FounderOS_Milestone_15_Architecture_Specification_v1.0.md`
3. `FounderOS_Durable_Readiness_Evaluation_Transaction_Contract_v1.0.md`
4. `FounderOS_Readiness_Evaluation_Registration_and_Idempotency_Contract_v1.0.md`
5. `FounderOS_Durable_Readiness_Evaluation_Ledger_Contract_v1.0.md`
6. `FounderOS_Readiness_Replay_Verification_Registry_Contract_v1.0.md`
7. `FounderOS_Readiness_Ledger_Integrity_and_Recovery_Specification_v1.0.md`
8. `FounderOS_Local_File_Readiness_Ledger_Adapter_Specification_v1.0.md`
9. `FounderOS_Readiness_Evidence_Privacy_and_No_Execution_Policy_v1.0.md`
10. `FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md`
11. `FounderOS_Milestone_15_Verification_Checklist_v1.0.md`
12. `FounderOS_Milestone_15_Package_README_v1.0.md`
13. `FounderOS_Milestone_15_Codex_Implementation_Prompt_v1.0.md`

The package contains 13 English Markdown documents.

## Explicit Non-Goals

The specification does not authorize or implement real providers, credential resolution, secret access, environment-secret loading, outbound transport, provider dispatch, response ingestion, streaming, tools/functions, Agents, Hermes, MCP, routing, failover, distributed persistence, external observability, UI, deployment, or production enablement.

## Implementation Status

No Milestone 15 runtime contracts, source modules, tests, fixtures, package exports, dependencies, persistence adapters, commands, or CI changes are implemented by this documentation package.

ADR-0019 remains **Proposed** until separately authorized implementation and review.
