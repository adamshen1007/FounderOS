# FounderOS Milestone 19 Acceptance Criteria v1.0

## Decision Rule

M19 implementation may be accepted only when every row is traced to exact contracts,
implementation anchors, registered tests, and executable gates. This specification package itself
authorizes no implementation or publication.

| ID | Acceptance criterion |
| --- | --- |
| M19-AC-001 | Shared strict versioned preparation, model-policy, prompt-cache-policy, instruction-profile, input-projection, request-plan, fixture-response, mapping-evidence, disabled-policy/result, closed-taxonomy, and verification contracts are exported by `@founderos/knowledge-schema`. |
| M19-AC-002 | `@founderos/knowledge-engine` owns authority verification plus separate structural request-plan mapper and disabled-adapter ports; it imports neither the concrete integration package nor credential resolver. |
| M19-AC-003 | `@founderos/openai-responses-adapter` owns only fixed profile mapping, fixture mapping, and disabled behavior and depends only on shared schema contracts. |
| M19-AC-004 | The fixed request plan consumes the exact verified M14 plan and exactly implements the closed M16 provider, operation, method, endpoint profile, authoritative model, tier, limits, immutable instruction bytes, canonical governed input, prompt-cache posture, modality, storage, streaming, background, tool, and state rules. |
| M19-AC-005 | Caller endpoint, header, model, tier, limit, instruction, cache control, callback, client, credential, and unknown capability input rejects before protected access. |
| M19-AC-006 | Exact registered M17 Decision and claim verify before request-plan mapping; the canonical plan verifies before the factory-captured M18 orchestrator is invoked; callers cannot supply M18 evidence or authority; directly returned released evidence independently verifies before disabled-adapter access. |
| M19-AC-007 | Every Attempt, authority, readiness, provider, Adapter, model, instruction, Credential Reference, rotation, operation, environment, policy, time, and limit substitution fails closed. |
| M19-AC-008 | Zero authority, mapper, M18-orchestrator, and disabled-adapter calls occur for each rejection that precedes the respective boundary. |
| M19-AC-009 | The asynchronous operation atomically installs an `in-flight` owner reservation before its first `await`; exact concurrency returns an ephemeral non-mutating `preparation_in_progress` observation, conflict never mutates the owner, only the owner installs a permanent terminal result, and exact terminal replay invokes no protected boundary. |
| M19-AC-010 | Exact durable M15 reconstruction proves M14 `ready-for-dry-run` authority with Adapter state `dry-run-mapping`; a separate current-control authority proves every live control at one explicit time; both remain distinct from an immutable M19 disabled policy, and valid preparation can terminate only as `disabled-by-policy`. |
| M19-AC-011 | The adapter facade exposes no send, execute, request, connect, stream, retry, authentication-header, credential, client, callback, or extension capability. |
| M19-AC-012 | Canonical request plans bind the exact verified M14 plan, factory-resolved model policy, repository-owned exact instruction bytes, canonical governed question/context projection, prompt-cache posture, disabled policy, every M13/M14/M17 source ceiling, observed same-unit character/UTF-8-byte/token count, and derived output-byte minimum; both M17 input/output byte bounds, both M17 token bounds, and M14 request/response byte bounds are enforced without a tokenizer or cross-unit comparison; plan and mapping evidence are deterministic, independently reproducible, domain-separated, and tamper rejecting. |
| M19-AC-013 | Strict fixture mapping accepts only one bounded completed text response with exact model, tier, valid input/output usage, and exactly eight ordered, non-empty, level-two decision-memo sections; missing, duplicate, reordered, renamed, extra, empty, or differently leveled sections reject as `provider-response-invalid`. |
| M19-AC-014 | Every M16 prohibited, malformed, ambiguous, partial, oversized, multi-item, wrong-model, wrong-tier, invalid-section, and invalid-usage fixture maps through the ordered first-applicable `M16-error-taxonomy-v1` table, including adversarial multi-fault combinations; the separate fixed preparation precedence table maps every rejected preparation to exactly one `M19-preparation-taxonomy-v1` code with no array or fallback. |
| M19-AC-015 | Fixture mapping remains isolated from disabled-attempt results and cannot be represented as provider execution evidence. |
| M19-AC-016 | Public JSON, fingerprints, errors, logs, and snapshots contain no credential material, authentication-header value/object, raw fixture error, physical or machine-local path, or unrestricted provider envelope. Source and Git diff may contain only fixed non-secret policy constants and documentation references, never secret-shaped or caller-controlled equivalents. |
| M19-AC-017 | Complete transitive production closure rejects network, filesystem, environment, secret-source, loader, dynamic-code, provider-SDK, Agent, Hermes, and MCP capabilities and transport-capable runtime dependencies. |
| M19-AC-018 | Runtime witnesses prove zero attempted calls to every available ambient network global across valid, rejection, replay, fixture, and disabled-harness paths. |
| M19-AC-019 | Existing Milestone 04–18 behavior and bounded predecessor verification remain green. |
| M19-AC-020 | Exact documentation traceability covers AC-001 through AC-020 and preserves all explicit non-goals. |

## Non-Goals

No real credential, material handoff, authentication header, secret store, endpoint override,
network transport, provider SDK, successful final pre-send gate, dry-run or live provider attempt,
Agent, Hermes, MCP, UI, deployment, release, Milestone 20 behavior, or production authority is
accepted.
