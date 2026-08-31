# FounderOS Milestone 19 Acceptance Traceability v1.0

## Purpose

This ledger maps every Milestone 19 acceptance criterion to its implementation and executable proof.
It records implementation evidence only; it does not authorize Git publication, provider access,
deployment, release, live execution, or Milestone 20 work.

| Acceptance | Implementation anchor | Executable proof |
| --- | --- | --- |
| M19-AC-001 | `packages/knowledge-schema/src/openai-responses-adapter.ts` | `packages/knowledge-schema/tests/openai-responses-adapter.test.ts` |
| M19-AC-002 | `services/knowledge-engine/src/application/openai-responses-preparation-orchestrator.ts` | `services/knowledge-engine/tests/openai-responses-preparation.test.ts` |
| M19-AC-003 | `integrations/openai-responses/src/index.ts` | `integrations/openai-responses/tests/openai-responses-adapter.test.ts` |
| M19-AC-004 | Fixed `providerProjection` construction | deterministic request-mapping test |
| M19-AC-005 | strict durable public-input capture | accessor, symbol, and exact-profile substitution tests |
| M19-AC-006 | M17 verification, authority-reproduced request-plan verification, captured M18 orchestration, returned-evidence verification, and independently rebound disabled terminal verification | authority-first, self-consistent-plan substitution, and protected-boundary tests |
| M19-AC-007 | exact coordinate and fingerprint checks across readiness, model, cache, current control, credential evidence, and disabled terminal | substitution, tamper, cross-environment coordinate-mismatch, and current-control rejection tests |
| M19-AC-008 | ordered orchestration boundaries | zero-call rejection assertions |
| M19-AC-009 | process-local `reservations` owner registry | concurrency, conflict, and replay test |
| M19-AC-010 | concrete durable M15/M14 source authority plus separate current-control and disabled-policy artifacts | durable source-authority implementation, happy-path disabled terminal, and current-control rejection tests |
| M19-AC-011 | three-method disabled facade | exact facade-key assertion |
| M19-AC-012 | same-unit counts, ceilings, derived byte minimum, source-bound M13 projection authority, and independently reproduced fingerprints | deterministic, multibyte, token-bound, precedence, self-consistent substitution, and tamper tests |
| M19-AC-013 | exact eight-section validator | missing, duplicate, reordered, renamed, extra, empty, level, carriage-return, and leading-prose tests |
| M19-AC-014 | closed ordered `fixtureCategory` and preparation taxonomy | adversarial multi-fault and closed-enum tests |
| M19-AC-015 | fixture-only mapping evidence contract distinct from preparation result, with constructor-owned fixture fingerprints | shared contract, fixture-fingerprint substitution, and fixture-mapping tests |
| M19-AC-016 | Secret-free public surface and logical references only | diff inspection plus schema and closure tests |
| M19-AC-017 | schema, engine, and integration production-module closure | TypeScript-aware transitive closure test and dependency allowlist |
| M19-AC-018 | disabled facade with no transport capability | ambient network-call runtime witness |
| M19-AC-019 | unchanged predecessor behavior | full repository gates and `pnpm verify:m15-predecessor` |
| M19-AC-020 | this exact AC-001 through AC-020 ledger | documentation traceability test |

## Authority Clarifications Recorded During Implementation

The model and prompt-cache policy graph is acyclic. The model policy binds the prompt-cache policy
ID. The prompt-cache policy then binds the completed model-policy fingerprint. The request plan and
disabled policy bind both completed policy fingerprints. This ordering permits independent
reproduction without weakening any substitution boundary.

`createDurableM19ReadinessAuthority` reads and verifies the exact committed M15 transaction before
projecting M14 readiness; it does not accept readiness evidence from the preparation caller. The
same factory captures and verifies a distinct `M19PolicyAuthorityEvidenceV1` artifact for privacy,
provider/account retention, operation, and cache evidence that M14 does not define. M14 pricing is
cross-bound to that artifact, and every model/cache policy source field is compared with the
captured projection. Observability and telemetry-retention evidence are never relabeled as privacy
or provider-retention authority.
`createSourceBoundFounderDecisionMemoInputProjectionAuthority` independently verifies the committed
M12 Delivery, M13 Invocation, and Context Package, derives the sole request-author question and every
ordered included context entry, computes the canonical projection and counts once, then rechecks its
exact Delivery, Invocation, and Context bindings against the registered M17 Decision at resolution
time.

Decision-memo text must start with the first exact level-two heading and contain exactly the eight
ordered non-empty sections. Text following the eighth heading is that section's body; it cannot
also be classified as separately detectable trailing non-heading prose. Leading prose remains
invalid.

## Preserved Non-Goals

No real credential, credential material handoff, authentication header, secret store, endpoint
override, network transport, provider SDK, successful final pre-send gate, live or dry-run provider
attempt, deployment, release, Agent, Hermes, MCP, UI, Milestone 20 behavior, or production authority
is included.
