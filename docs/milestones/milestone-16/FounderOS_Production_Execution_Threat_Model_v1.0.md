# FounderOS Production Execution Threat Model v1.0

## Status

**Architecture threat model — no live boundary exists**

## Scope

This threat model covers the proposed future path from a verified governed Invocation through authorization, credential resolution, one OpenAI Responses request, sanitized mapping, and durable evidence for the `founder-decision-memo` operation.

It does not claim protection for capabilities excluded from the closed envelope.

## Protected Assets

- Founder Knowledge and Context content
- Authorization and governance evidence
- OpenAI credential material and Credential References
- Transport and model policy
- Provider request and response content
- Usage and cost budgets
- Durable Delivery, Invocation, readiness, execution, and consumption evidence
- Incident, kill-switch, Circuit, and Health authority
- Human strategic and external-action authority

## Trust Boundaries

1. Caller to governed Context/Invocation verification
2. Governed orchestration to external Authorization authority
3. Domain/application orchestration to infrastructure credential resolver
4. FounderOS process to approved OpenAI endpoint
5. Raw provider envelope to sanitized response mapper
6. Ephemeral execution material to durable evidence
7. Advisory memo to human decision-maker

## Threat Matrix

| ID | Threat | Required control | Failure result |
| --- | --- | --- | --- |
| `M16-T01` | Direct provider bypass | Sole governed Invocation facade; dependency and import-closure enforcement | reject before credential access |
| `M16-T02` | Confused-deputy authorization | Exact Consumer/Delivery/Context/Invocation/Adapter/operation/model binding | authorization rejected |
| `M16-T03` | Replay or concurrent claim of authority | Decision binds exact attempt; Authorization authority atomically transitions `allowed-unclaimed` to permanent `claimed-by-exact-attempt` before credential resolution; duplicate/stale/mismatched claims fail; final gate verifies the existing claim | authorization rejected |
| `M16-T04` | Raw secret submission | Credential Reference only; strict shape and secret-like-value rejection | input rejected |
| `M16-T05` | Credential disclosure | Resolver-to-adapter-only secret flow; redaction by construction | disable and incident response |
| `M16-T06` | Credential overreach | Project scope, least privilege, rotation version, revocation, purpose binding | credential rejected |
| `M16-T07` | SSRF or endpoint substitution | Fixed signed scheme/host/port/method/path; no redirects or caller URL | transport rejected |
| `M16-T08` | DNS rebinding/private target | Trusted DNS policy, IP classification before connect, connection binding | transport rejected |
| `M16-T09` | TLS downgrade or interception | TLS minimum, certificate/hostname validation, no insecure override | transport rejected |
| `M16-T10` | Proxy or header injection | Trusted configuration only; exact header allowlist | request rejected |
| `M16-T11` | Prompt injection or trusted-instruction substitution | Immutable execution-instruction profile binds fixed system/developer and advisory-output instructions, eight-section definition, deterministic serialization, version/fingerprint, Authorization, request plan, compatibility evidence, and evaluation; quoted untrusted context cannot override it | output remains advisory or request rejected |
| `M16-T12` | Hidden context injection | Context Package is sole context source; exact serialization and fingerprint | request rejected |
| `M16-T13` | Model alias or returned-model drift | Exact request and response model identity must match the immutable model identifier/snapshot derived from verified model-policy and Authorization evidence; no caller override; explicit change control | admission or response rejected |
| `M16-T14` | Unsupported provider capability | Explicit denials for tools, streaming, background, files, images, state | request/response rejected |
| `M16-T15` | Data over-disclosure | Minimum-context selection, privacy classification, byte limits | privacy gate rejected |
| `M16-T16` | Provider storage, application-state, or prompt-cache retention mismatch | Human-approved model/project-specific response-storage and prompt-cache evidence; `store: false`; immutable adapter-owned cache policy; no caller cache controls | privacy gate rejected |
| `M16-T17` | Cost or capacity exhaustion | Explicit adapter-derived `service_tier = default`; exact returned tier match; exact input byte/token and provider `max_output_tokens` ceilings; `truncation = disabled`; rate/concurrency/cost ceilings and one-attempt rule | admission or response rejected |
| `M16-T18` | Duplicate execution after timeout | No automatic retry after ambiguous send; new governed attempt only | ambiguous terminal failure |
| `M16-T19` | Oversized or malformed response | Streaming byte cap, terminal shape validation, closed output taxonomy | response rejected |
| `M16-T20` | Raw provider error leakage | Stable error mapping and bounded redacted diagnostics | sanitized failure |
| `M16-T21` | False model claim treated as fact | Advisory classification, evidence references, human review | no automatic action |
| `M16-T22` | Generated action instruction executes | No tool path or downstream auto-dispatch; human-only authority | no side effect |
| `M16-T23` | Kill switch bypass | Distinct final pre-send revalidation after credential resolution covers Authorization, credential-reference version/revocation, global/provider/Adapter/model/environment/operation kill switches, Circuit, Health, and incident state; failure releases credential and does not send | execution denied |
| `M16-T24` | Ledger evidence treated as execution authority | Separate authority types and gate verification | execution denied |
| `M16-T25` | Compromised privileged host | Explicit threat-model limitation; external host hardening and secret isolation | human incident response |

## Prompt-Injection Rule

Knowledge and founder-authored content are data, even when they contain imperative language. They cannot change system instructions, request parameters, policies, authorization, tool state, model binding, limits, or evidence rules. Because the selected operation has no tools or downstream execution, a successful injection can affect advisory prose but cannot directly create an external side effect.

## Retry and Ambiguity Rule

The adapter must distinguish a failure proven to occur before send from a failure that may have reached OpenAI. An ambiguous attempt is terminal and non-retryable under the same attempt identity. A human or governed caller may create a new Invocation attempt only if budgets and policy allow it and the duplicate-output risk is accepted explicitly.

## Kill-Switch Precedence

The most restrictive of global, provider-family, Adapter, credential, Circuit, Health, incident, and environment states wins. A previously allowed Authorization Decision or readiness record cannot override a later disablement.

## Residual Risks

- A model may produce inaccurate, biased, incomplete, or misleading prose.
- Provider-side processing and retention cannot be independently proven from FounderOS alone.
- A privileged host compromise can bypass process-level controls and steal secrets.
- DNS, certificate, provider, pricing, model, and policy behavior can change after review.
- Redaction cannot repair data that was incorrectly admitted before request construction.
- A valid human decision may still be poor; governance preserves authority, not judgment quality.

These risks require external controls, periodic review, evaluation, and explicit human acceptance. They are not grounds for weakening fail-closed behavior.

## Review Triggers

Repeat threat review before any change to provider family, endpoint, region, model binding, modality, tools, streaming, background mode, state retention, retry policy, credential system, proxy, deployment topology, data classification, or allowed side effect.
