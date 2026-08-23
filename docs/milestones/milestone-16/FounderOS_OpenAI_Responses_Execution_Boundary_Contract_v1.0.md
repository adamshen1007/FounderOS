# FounderOS OpenAI Responses Execution Boundary Contract v1.0

## Status

**Architecture contract only — no executable adapter exists**

## Purpose

Define the only OpenAI request envelope that a future FounderOS production-provider adapter may implement for the selected founder decision memo use case.

## Required Authoritative Inputs

- Verified durable Context Delivery evidence
- Verified governed Context Package
- Verified governed Invocation Request
- Unexpired, unrevoked Authorization Decision permanently `claimed-by-exact-attempt` for the exact execution attempt; `allowed-unclaimed`, another attempt's claim, stale or revoked authority, and any non-authoritative claim representation are rejected
- Approved OpenAI Adapter Descriptor
- Approved immutable model-policy binding
- Approved immutable execution-instruction profile version and cryptographic fingerprint
- Valid Credential Reference
- Signed Transport Policy
- Rate, capacity, cost, Circuit, Health, privacy, and observability decisions
- Explicit operation time and bounded attempt identity

Every input must bind the same execution attempt, Consumer, Context Package, Delivery, Invocation, Adapter, provider family, operation, execution-instruction profile, model policy, and limits.

## Canonical Request Profile

The future request mapper must construct, validate, and independently reproduce one profile equivalent to:

```text
providerFamily = openai
operation = founder-decision-memo
instructionProfile = approved immutable version/fingerprint
method = POST
scheme = https
hostname = api.openai.com
port = 443
path = /v1/responses
model = approved immutable model identifier/snapshot -> provider model
processingTier = default -> provider service_tier
stream = false
background = false
store = false
tools = []
inputModalities = [text]
outputModalities = [text]
maxOutputTokens = exact authorized output-token ceiling -> provider max_output_tokens
truncation = disabled
conversation = absent
previousResponseId = absent
promptCachePolicy = approved-adapter-owned-immutable-binding
```

This is a normative semantic profile, not authorization to construct or transmit an HTTP request in Milestone 16.

The future adapter must derive `model`, `processingTier`, `maxOutputTokens`, and `truncation` only from independently verified immutable model-policy, Authorization, admission, and cost evidence. They are not caller-overridable. The first closed boundary requires explicit `service_tier = default`; omission or `auto` is prohibited because project configuration must not select the processing tier implicitly. Before credential resolution, independent request-plan reproduction must prove equality of the authorized byte and token limits, exact provider-visible model identifier or snapshot, exact `service_tier`, exact `max_output_tokens` ceiling, and disabled truncation. Omission, mismatch, a mutable alias, an unbounded or null output ceiling, an implicit or caller-selected tier, or `truncation = auto` fails closed.

## Request Content

The provider input may contain exactly:

1. One fixed, versioned FounderOS system instruction.
2. One bounded founder decision question from the governed Invocation.
3. One deterministic serialization of the verified Context Package's selected canonical content and evidence references.
4. One explicit advisory-output instruction and bounded memo-section definition.

Items 1 and 4 and the exact eight-section memo definition belong to one immutable FounderOS execution-instruction profile. The profile must define deterministic instruction serialization plus its version and cryptographic fingerprint. Its identity/fingerprint binds the Authorization Decision, request plan, Adapter/model-policy compatibility evidence, and independent reproduction. Any instruction-profile change requires a new Authorization Decision and the relevant quality and injection-resistance evaluation. A missing, substituted, stale, unapproved, or caller-controlled profile fails before credential resolution.

The mapper must distinguish trusted instructions from untrusted Knowledge content. Content that resembles system instructions, tool calls, credentials, URLs, or policy overrides remains quoted data and cannot alter the request profile.

## Prohibited Request Members

- Caller-provided endpoint, scheme, hostname, port, path, query, headers, or proxy
- Caller-provided system or developer instruction
- Raw Knowledge Objects or Query Results outside the Context Package
- Files, images, audio, URLs, remote content, or uploaded provider objects
- Tools, functions, web search, file search, code execution, MCP, computer use, or custom calls
- Streaming, background execution, Batch, Realtime, conversation objects, or previous-response linkage
- Provider-side storage, fine-tuning, assistants, threads, vector stores, or prompt mutation
- Caller-controlled `prompt_cache_key`, `prompt_cache_options`, deprecated prompt-cache retention members, or content-level prompt-cache breakpoints
- Raw credentials, organization dumps, environment values, physical paths, or secret-like text
- Caller-provided model, processing tier, output-token ceiling, or truncation policy
- Omitted or `auto` `service_tier`, including project-controlled implicit tier selection
- Mutable model aliases without an approved immutable binding, unbounded or null `max_output_tokens`, or `truncation = auto`

Unknown, duplicate, hidden, accessor-backed, inherited, or unsupported members fail before credential resolution.

## Prompt-Cache Policy Ownership

Prompt caching is provider application state, not response storage. The future adapter must bind its exact prompt-cache posture to the approved immutable model, Transport, and privacy policy after current model/project-specific retention evidence is accepted. Omitted prompt-cache members do not prove that caching is absent because supported models may apply implicit caching. No caller may select a cache key, mode, retention, option, or breakpoint, and FounderOS must not claim caching is disabled without independent evidence for the exact selected configuration.

## Authentication Header Ownership

Only the future OpenAI adapter may synthesize the provider authentication header after all non-secret gates pass and the infrastructure resolver returns a scoped credential for the exact attempt. The header is never represented in shared contracts, request plans, logs, errors, tests, durable evidence, or public results.

After credential resolution and immediately before authentication-header construction and the bounded send, the adapter must perform the distinct final pre-send revalidation defined by the core execution sequence. It verifies the existing permanent `claimed-by-exact-attempt` ownership and current expiry/revocation and disablement state; it never performs an unused-state check or creates a claim. Failure releases the ephemeral credential, emits only sanitized evidence, and performs no send. After successful final revalidation, no non-transport work may occur before the one bounded send.

## Response Acceptance Profile

A future mapper may accept only:

- one response belonging to the exact attempt;
- terminal completed status;
- one assistant message;
- text output only;
- no tool, function, reasoning-summary, file, image, audio, refusal-with-content, or unknown output item;
- bounded valid UTF-8 text within the authorized byte and token ceilings;
- bounded usage evidence consistent with the request and provider response;
- provider-reported model identity exactly matching the authorized immutable model identifier or snapshot;
- provider-reported effective `service_tier` exactly matching the permitted explicit tier;
- a sanitized provider request identifier when policy permits it.

The mapper treats provider-generated text as untrusted advisory material. It validates envelope shape and limits, not truth, correctness, or authorization.

## Error Categories

The future adapter must map failures into exactly the following versioned closed taxonomy, identified as `M16-error-taxonomy-v1`:

- `authorization-rejected`
- `credential-unavailable`
- `credential-revoked`
- `transport-policy-rejected`
- `admission-rejected`
- `provider-unavailable`
- `request-timeout-ambiguous`
- `request-timeout-not-sent`
- `provider-refused`
- `provider-rate-limited`
- `provider-response-invalid`
- `provider-response-oversized`
- `provider-output-prohibited`
- `provider-usage-invalid`
- `cancelled-before-send`
- `cancelled-after-send-ambiguous`
- `incident-disabled`

Raw provider messages remain private ephemeral adapter input and must not be copied into the public reason.

Adding, removing, renaming, splitting, or merging a category requires an explicit execution-boundary contract version change and corresponding acceptance and compatibility evidence. An implementation may not introduce an undocumented fallback category.

## Attempt and Retry Rule

The initial live operation permits one transport attempt. A failure that proves no request was accepted may be resubmitted only through a new governed attempt subject to the existing Invocation budget. An ambiguous result must never be retried automatically because it could duplicate provider cost or output.

## Verification Rule

Any future implementation must independently reproduce the request profile and sanitized response mapping from authoritative evidence without the secret. Verification proves governance and mapping integrity; it does not prove model truth or provider-side deletion.
