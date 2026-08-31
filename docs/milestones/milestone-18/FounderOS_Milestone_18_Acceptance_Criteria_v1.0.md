# FounderOS Milestone 18 Acceptance Criteria v1.0

## Decision Rule

Milestone 18 is eligible for independent commit-readiness review only when every row is reproduced
from the exact candidate and all required gates pass. This does not authorize publication.

| ID | Acceptance criterion |
| --- | --- |
| M18-AC-001 | Shared strict versioned request, command, rotation, revocation, port-result, evidence, result, and verification contracts are exported by `@founderos/knowledge-schema`. |
| M18-AC-002 | No public M18 contract can represent credential material, a material-derived value, endpoint, header, path, callback, client, or provider body. |
| M18-AC-003 | Canonical constructors and independent verifiers reproduce domain-separated evidence fingerprints and reject tampering. |
| M18-AC-004 | Unknown, hidden, symbolic, inherited, accessor-backed, custom-prototype, non-canonical, URL-shaped, and credential-shaped input rejects before protected access. |
| M18-AC-005 | Knowledge Engine verifies the exact registered M17 Decision and claim at explicit evaluation time before resolver access. |
| M18-AC-006 | Every Decision, claim, Attempt, provider, Adapter, environment, operation, reference, fingerprint, rotation, purpose, evaluation, and deadline substitution fails closed. |
| M18-AC-007 | A counting port proves zero resolver calls for every pre-resolution rejection. |
| M18-AC-008 | Resolution IDs are permanently reserved; exact replay returns the original frozen result without rematerialization and conflicting reuse has fixed precedence. |
| M18-AC-009 | The infrastructure package owns the process-local synthetic registry and Knowledge Engine never imports its concrete implementation. |
| M18-AC-010 | Only the exact active rotation version resolves; prior, missing, unavailable, stale, and revoked versions reject. |
| M18-AC-011 | Rotation is exact and monotonic; rejected or faulted transitions consume no sequence or active state. |
| M18-AC-012 | Revocation is authority-bound, monotonic, permanent, and cannot reactivate a prior version. |
| M18-AC-013 | One new resolution identity materializes once; replay materializes zero additional times. |
| M18-AC-014 | Owned synthetic bytes are nonzero only inside one synchronous call, are overwritten in `finally`, and success returns only after zero confirmation. |
| M18-AC-015 | Materialization, evidence, and release-integrity faults return only sanitized closed failures and never skip attempted release. |
| M18-AC-016 | A non-secret fragmented canary is absent from public JSON, fingerprints, errors, logs, snapshots, source text, and Git diff. |
| M18-AC-017 | Recursive production-module closure rejects filesystem, process, loader, environment, network, provider, reflection, dynamic-code, Agent, Hermes, and MCP capabilities. |
| M18-AC-018 | The disabled harness and preflight rejection witnesses invoke neither resolver on rejected paths nor global network capability. |
| M18-AC-019 | Existing Milestone 04–17 behavior and the bounded Milestone 15 predecessor baseline remain green. |
| M18-AC-020 | Exact documentation traceability maps every criterion to contracts, implementation anchors, registered tests, and executable gates while preserving all non-goals. |

## Non-Goals

No real credential, secret store, environment read, durable registry, OpenAI mapper, header,
transport, network request, Agent, Hermes, MCP, UI, deployment, release, live execution, or
Milestone 19 behavior is accepted.
