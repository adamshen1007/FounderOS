# FounderOS Milestone 16 Production Execution Architecture and Threat Model Specification v1.0

## Status

**Specified — documentation-only; no implementation authorized**

## Purpose

Decide whether FounderOS may prepare for one narrowly bounded production-provider execution path without weakening the governed KnowledgeOS, Delivery, Invocation, readiness, or durable-evidence foundations established through Milestone 15.

## Architecture Decision

FounderOS selects the OpenAI provider family and the OpenAI Responses API for one future non-streaming, foreground, text-only use case: generating an advisory founder decision memo from one independently verified governed Context Package.

Milestone 16 does not cross the live-execution boundary. It defines the authority, trust, credential, transport, privacy, failure, incident, and acceptance boundaries that later milestones must implement and independently verify in sequence.

## Selected Use Case

The only selected operation is `founder-decision-memo`.

It accepts:

- one verified governed Context Package;
- one existing governed Invocation Request;
- one explicit founder decision question;
- one future short-lived Authorization Decision atomically claimed by the exact execution attempt;
- one approved OpenAI Adapter and immutable model-policy binding;
- one immutable versioned execution-instruction profile binding;
- explicit input, output, time, attempt, rate, concurrency, and cost ceilings.

It produces one advisory memo. The memo cannot approve, publish, send, purchase, modify data, invoke a tool, create a follow-on request, or otherwise cause an external side effect.

## Closed Execution Envelope

A future implementation must enforce all of these controls as fixed trusted configuration:

| Control | Required value |
| --- | --- |
| Provider family | `openai` |
| API family | Responses API |
| Scheme | `https` |
| Default hostname | `api.openai.com` |
| Port | `443` |
| Method | `POST` |
| Path | `/v1/responses` |
| Model | exact approved immutable identifier or snapshot |
| Processing tier | explicit `service_tier = default` |
| Output-token ceiling | exact authorized `max_output_tokens` |
| Truncation | disabled |
| Execution instructions | immutable approved profile version and cryptographic fingerprint |
| Input modality | text only |
| Output modality | text only |
| Streaming | disabled |
| Background mode | disabled |
| Provider storage request | disabled with `store: false` |
| Tools and functions | empty and prohibited |
| Conversation state | prohibited |
| Previous response linkage | prohibited |
| Caller-supplied URL or headers | prohibited |

Region-specific OpenAI hostnames are not silently interchangeable with the default hostname. A future revision may approve one only through a new signed Transport Policy, threat review, data-residency decision, and architecture amendment.

The OpenAI Responses API supports broader inputs, outputs, streaming, and tools. Those capabilities are outside this envelope and must be rejected explicitly rather than ignored. See the [official Responses API reference](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create).

## Trust and Dependency Boundaries

```text
verified Context Package
  -> governed Invocation Request
  -> future Authorization Decision authority
  -> future infrastructure credential resolver
  -> future disabled-by-default OpenAI Responses adapter
  -> sanitized response mapper
  -> existing reasoning and consumption evidence ledgers
```

- `@founderos/knowledge-schema` may later own provider-neutral contracts and an OpenAI profile discriminator; it must not own transport or secret access.
- `@founderos/knowledge-engine` may later orchestrate verification and evidence mapping; it must not read credentials or make direct provider calls.
- A future integration adapter may own OpenAI request/response translation and transport behind the existing governed Invocation boundary.
- A future infrastructure credential resolver may return secret bytes only to that adapter for one bounded attempt.
- Applications, Agents, Hermes, MCP, and callers may not access the adapter, resolver, endpoint, or credential directly.
- Existing Milestone 12–15 ledgers preserve evidence. None grants execution authority.

## Mandatory Gate Order

1. Verify durable Context Delivery and the exact Context Package.
2. Verify the governed Invocation Request and its unexpired budgets.
3. Verify the selected operation is exactly `founder-decision-memo`.
4. Verify a short-lived `allowed-unclaimed` Authorization Decision bound to the exact execution attempt, Consumer, Delivery, Context, Invocation, Adapter, operation, execution-instruction profile, model policy, and limits; atomically transition it to `claimed-by-exact-attempt`. Only one claimant may succeed, and the claim is never released for reuse.
5. Verify Adapter capability and disabled-by-default operational state.
6. Verify Credential Reference state without resolving it.
7. Verify the signed Transport Policy and fixed endpoint envelope.
8. Verify rate, concurrency, token, byte, timeout, attempt, and cost admission.
9. Verify Circuit, Health, incident, and kill-switch state.
10. Verify privacy, retention, redaction, and observability policy.
11. Construct and independently verify the bounded request plan, including the approved execution-instruction profile version/fingerprint and deterministic serialization, exact byte and token ceilings, exact provider-visible immutable model identifier or snapshot, explicit `service_tier = default`, exact authorized `max_output_tokens`, and `truncation = disabled`.
12. In a future authorized milestone only, resolve the credential just in time.
13. After credential resolution and immediately before send, verify the existing `claimed-by-exact-attempt` ownership and revalidate current Authorization expiry/revocation; Credential Reference revocation and rotation version; every global, provider, Adapter, model, environment and operation kill switch; Circuit; Health; and incident state. Do not perform an unused-state check or create a claim here. Failure releases the ephemeral credential, emits only sanitized evidence, and performs no send.
14. In a later separately authorized live-execution milestone only, construct the adapter-private authentication header and perform one bounded request. No non-transport work may occur between successful gate 13 revalidation and this send.
15. Verify returned model and effective processing tier, then map the response into sanitized evidence and an advisory memo.

No later gate may compensate for a failed or missing earlier gate.

## Provider Data Boundary

`store: false` is mandatory but does not establish a complete retention guarantee. OpenAI documents separate default abuse-monitoring and application-state behavior, plus account-level Modified Abuse Monitoring and Zero Data Retention controls. FounderOS must treat provider retention, residency, training opt-in state, and contractual controls as externally verified human acceptance evidence. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint).

The request may contain only the minimum verified context required for the decision. Raw Knowledge Objects, vault paths, secrets, credentials, environment data, unrelated context, files, images, URLs, and hidden instructions are prohibited.

## Model Policy

Milestone 16 selects no mutable model alias and makes no model-quality claim. A future transport implementation must bind one explicitly approved immutable model identifier or snapshot, supported capabilities, explicit processing-tier policy initially fixed as `service_tier = default`, pricing evidence, region/retention eligibility, and change-control rule. The exact tier must also bind Authorization, admission, and cost evidence. Changing the model or tier binding requires new authorization and evaluation evidence; silent alias or project-controlled tier drift is prohibited.

## Failure Semantics

- Every missing, invalid, stale, ambiguous, unsupported, or mismatched authority fails closed before the next sensitive boundary.
- No automatic retry follows an ambiguous timeout or connection outcome.
- Partial, cancelled, refused, malformed, oversized, multi-message, tool-call, or unexpected output fails closed.
- Provider errors are mapped to bounded stable categories; raw response bodies, headers, stack traces, and credential material are never returned or persisted.
- A generated memo is untrusted advisory content even after successful evidence verification.
- The distinct final pre-send gate revalidates Authorization, credential-reference, kill-switch, Circuit, Health, and incident state after credential resolution; any failure releases the ephemeral credential and performs no send.
- Kill-switch, credential-revocation, Circuit, Health, and incident state take precedence over readiness and authorization.

## Required Future Milestone Sequence

1. Authorization-decision authority and service-identity boundary.
2. Credential-reference resolution and rotation boundary with no transport.
3. Disabled-by-default OpenAI request mapper and transport adapter with blocked network probes.
4. Independent end-to-end dry-run and fault-injection closure.
5. Separately authorized, human-gated live-execution closure for the single selected operation.

Each step requires its own specification, acceptance criteria, independent review, commit authority, and merge authority. No step inherits authorization from Milestone 16.

## Explicit Non-Goals

- Credentials, secret stores, environment reads, or credential resolution
- DNS, TLS, HTTP, sockets, proxies, provider SDKs, or live requests
- Model selection, purchase, account creation, billing changes, or provider configuration
- Streaming, background mode, conversation state, files, images, audio, web search, code execution, tools, or functions
- Automatic retry of ambiguous attempts
- Agents, Hermes, MCP, multi-provider routing, fallback, or autonomous planning
- Semantic retrieval, embeddings, ranking, knowledge graphs, or new databases
- UI, deployment, release, or production operations

## Terminal Acceptance Condition

Milestone 16 is complete only when the complete documentation candidate is internally consistent, placeholder-free, documentation-only, independently reviewed, and receives `GO — M16 ARCHITECTURE COMMIT READY` with no Critical, Important, or Minor findings.

That decision approves documentation only. It is not `ready-for-live-traffic`, does not enable an Adapter, and does not authorize any later milestone.
