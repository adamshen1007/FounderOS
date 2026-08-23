# FounderOS Milestone 16 Acceptance Criteria v1.0

## Status

**Documentation acceptance only — no implementation acceptance**

## Architecture Criteria

- [ ] `M16-AC-ARCH-001`: The provider family is exactly OpenAI and the sole operation is `founder-decision-memo`.
- [ ] `M16-AC-ARCH-002`: The dependency and trust boundaries preserve the governed Delivery, Context, Invocation, readiness, and durable-evidence authority chain.
- [ ] `M16-AC-ARCH-003`: M16 adds no runtime, dependency, integration, credential, transport, deployment, or provider configuration.
- [ ] `M16-AC-ARCH-004`: Later milestones are explicitly sequenced and inherit no authorization from M16.

## Request Boundary Criteria

- [ ] `M16-AC-REQ-001`: The only future endpoint profile is HTTPS POST to the approved `/v1/responses` policy binding.
- [ ] `M16-AC-REQ-002`: Input and output are text-only; streaming, background mode, storage, conversation state, previous-response linkage, tools, functions, files, images, audio, web search, code execution, MCP, and arbitrary provider capabilities are denied.
- [ ] `M16-AC-REQ-003`: Caller URLs, headers, system instructions, raw Knowledge, hidden context, credentials, and unsupported members fail before secret resolution.
- [ ] `M16-AC-REQ-004`: The independently reproduced request plan binds the exact provider-visible immutable model identifier or snapshot, the exact authorized `max_output_tokens` ceiling, and `truncation = disabled`; omission, caller override, mutable alias substitution, an unbounded or null ceiling, silent drift, and `truncation = auto` fail before credential resolution.
- [ ] `M16-AC-REQ-005`: The request plan binds adapter-derived explicit `service_tier = default` to Authorization/model/admission/cost evidence; omission, `auto`, project-controlled implicit selection, and caller override fail before credential resolution; returned model and effective tier must exactly match the authorized values or the response fails closed.
- [ ] `M16-AC-REQ-006`: An immutable versioned execution-instruction profile binds the fixed system/developer instruction, advisory-output instruction, exact eight-section memo definition, deterministic serialization, and cryptographic fingerprint into Authorization, request-plan, Adapter/model-policy compatibility, independent reproduction, and required evaluation evidence; missing, substituted, stale, unapproved, changed, or caller-controlled profiles fail before credential resolution.

## Authorization and Credential Criteria

- [ ] `M16-AC-AUTH-001`: Authentication, authorization issuance, authorization enforcement, credential lifecycle, secret resolution, provider authentication, and kill-switch ownership are separate.
- [ ] `M16-AC-AUTH-002`: Authorization binds the exact execution attempt, subject, Consumer, Delivery, Context, Invocation, Adapter, operation, execution-instruction profile, model policy, credential reference, environment, classification, and limits.
- [ ] `M16-AC-AUTH-003`: Before credential resolution, the Authorization authority atomically transitions the exact attempt-bound decision from `allowed-unclaimed` to permanently `claimed-by-exact-attempt`; only one claimant succeeds, no downstream failure releases the claim, and duplicate/stale/mismatched/already-claimed authority fails as `authorization-rejected`.
- [ ] `M16-AC-AUTH-004`: After credential resolution and immediately before send, a distinct final gate verifies the existing exact-attempt claim and revalidates Authorization expiry/revocation, Credential Reference revocation/version, all kill switches, Circuit, Health, and incident state without an unused-state check or new claim; failure releases the ephemeral credential with sanitized evidence and no send, and no non-transport work follows successful revalidation.
- [ ] `M16-AC-CRED-001`: Shared and durable artifacts contain only Credential Reference evidence and no secret value or secret-derived material.
- [ ] `M16-AC-CRED-002`: Future resolution is adapter-private, purpose-bound, short-lived, non-serializable, and occurs only after all non-secret gates pass.

## Security and Failure Criteria

- [ ] `M16-AC-SEC-001`: The threat model covers every trust boundary and all 25 named threats with controls and fail-closed results.
- [ ] `M16-AC-SEC-002`: Prompt-like Knowledge remains untrusted data and cannot alter policy, authorization, request shape, tools, or limits.
- [ ] `M16-AC-SEC-003`: Fixed endpoint, DNS/IP classification, TLS validation, redirect denial, header allowlisting, and proxy governance prevent caller-controlled egress.
- [ ] `M16-AC-SEC-004`: Global, provider, Adapter, model, environment, operation, credential, Circuit, Health, and incident disablement have restrictive precedence.
- [ ] `M16-AC-FAIL-001`: Partial, refused, cancelled, malformed, oversized, multi-message, tool-bearing, unknown, and ambiguous responses fail through a closed sanitized taxonomy.
- [ ] `M16-AC-FAIL-002`: Ambiguous requests are never automatically retried; a new governed attempt is required.

## Privacy and Observability Criteria

- [ ] `M16-AC-PRIV-001`: Data classification and minimization happen before request construction.
- [ ] `M16-AC-PRIV-002`: `store: false` is mandatory and is not represented as a complete retention guarantee.
- [ ] `M16-AC-PRIV-003`: Provider/account retention, residency, training opt-in, legal, privacy, subprocessor, and exact model/project-specific prompt-cache posture remain explicit current human acceptance evidence; caller cache controls are prohibited and any adapter cache policy is immutably bound.
- [ ] `M16-AC-PRIV-004`: The future durable-evidence inventory is closed and excludes raw provider envelopes, headers, errors, internal reasoning, physical paths, and secrets.
- [ ] `M16-AC-OBS-001`: Redaction and bounds apply before logging, metrics, tracing, or public errors.
- [ ] `M16-AC-INC-001`: Incident response supports immediate disablement, revocation, affected-attempt identification, evidence preservation, and human-approved re-enablement.

## Use-Case Criteria

- [ ] `M16-AC-USE-001`: The memo uses the eight approved sections and cites only logical evidence available in the Context Package.
- [ ] `M16-AC-USE-002`: The memo remains advisory, untrusted, and incapable of granting authority or causing a side effect.
- [ ] `M16-AC-USE-003`: A future quality evaluation covers faithfulness, uncertainty, unsupported claims, traceability, injection resistance, leakage, prohibited actions, shape, and stability.

## Documentation and Verification Criteria

- [ ] `M16-AC-DOC-001`: All nine M16 documents are versioned, indexed, linked, terminology-consistent, and placeholder-free.
- [ ] `M16-AC-DOC-002`: ADR-0020 remains Proposed until the complete documentation candidate is independently accepted and merged.
- [ ] `M16-AC-DOC-003`: Whole-branch inspection proves that only approved Markdown files changed.
- [ ] `M16-AC-VERIFY-001`: Formatting, lint, build, typecheck, test, documentation-link, and scope checks pass.
- [ ] `M16-AC-VERIFY-002`: Independent whole-candidate review reports Critical 0, Important 0, Minor 0.

## Terminal Decision

The only successful terminal review decision is:

`GO — M16 ARCHITECTURE COMMIT READY`

It authorizes only a separately requested documentation commit and push. It does not authorize implementation, credentials, provider configuration, live execution, merge, deployment, or release.
