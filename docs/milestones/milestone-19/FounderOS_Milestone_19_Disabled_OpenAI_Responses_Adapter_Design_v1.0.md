# FounderOS Milestone 19 Disabled OpenAI Responses Adapter Design v1.0

## Status

Approved design direction; documentation candidate only. No implementation, Git publication,
credential operation, provider configuration, transport, deployment, release, or live execution
is authorized.

## Objective

Milestone 19 specifies the third separately gated component in the accepted Milestone 16 sequence:
a disabled-by-policy OpenAI Responses adapter foundation for the sole operation
`founder-decision-memo`.

The milestone will prove deterministic construction and independent reproduction of one closed,
non-secret provider request plan; deterministic validation and sanitization of bounded fixture
responses; and a structural stop that makes outbound execution impossible. It will not read or
retain credential material, construct an authentication header, create a network client, or send
a request.

## Authority Chain

M19 preserves the existing sequence without broadening any prior acceptance:

1. M12–M15 provide governed Delivery, Invocation, readiness, and durable evidence.
2. M16 defines the sole provider family, operation, request envelope, and threat boundary.
3. M17 provides exact process-local Authorization Decision and permanent claim authority.
4. M18 provides synthetic, process-local, released credential-resolution evidence without
   transport or material handoff.
5. M19 may verify exact M17 authority, construct and verify a non-secret request plan, then verify
   exact M18 released evidence and return only `disabled-by-policy` from its adapter facade.
6. A later milestone owns independent end-to-end dry-run and fault-injection closure.
7. Live execution remains separately human-authorized after that closure.

Readiness, a claimed Authorization Decision, released credential-resolution evidence, or a valid
request plan is never permission to send.

## Selected Approach

Create one provider-specific package under `integrations/openai-responses/` with no transport
capability. It owns fixed OpenAI profile constants, deterministic request-plan mapping,
deterministic fixture-response mapping, and a disabled facade. Shared packages own strict
serializable contracts. Knowledge Engine owns orchestration and authority verification through a
narrow structural port, but it does not import the concrete integration package.

The disabled facade has no `send`, `execute`, `fetch`, `request`, `connect`, `stream`, `retry`,
`authenticate`, or header-construction operation. Its terminal adapter result is always a strict,
sanitized `disabled-by-policy` result after valid non-secret preparation, or a closed rejection
before preparation.

## Rejected Alternatives

1. **Real HTTP client behind a feature flag.** A dormant executable egress path is materially
   weaker than a production closure that contains no network capability.
2. **Provider mapping inside Knowledge Engine.** This violates the M16 ownership boundary and
   couples provider schema drift to core application orchestration.
3. **Passing M18 synthetic bytes into the adapter.** M18 intentionally releases its owned bytes
   before returning and exposes no lease. Reintroducing a material-bearing public port would
   invalidate the accepted M18 containment boundary.
4. **Documentation-only repetition of M16.** M16 already selected the provider and envelope. M19
   must specify executable mapping and structural proof boundaries for a later implementation.

## Package Ownership

### `@founderos/knowledge-schema`

Owns strict versioned serializable contracts for:

- disabled-adapter preparation requests and results;
- canonical provider request plans and fingerprints;
- fixture response envelopes and sanitized response-mapping evidence;
- closed request, response, and disabled-adapter failure taxonomies;
- independent verification results.

The package contains no client, callback, credential, header, endpoint override, provider SDK, or
network capability. The fixed endpoint profile is represented only as literal policy-bound data.

### `@founderos/knowledge-engine`

Owns application orchestration:

- strict wrapper capture before authority access;
- exact registered M17 Decision and claim verification;
- exact M18 resolution-evidence verification and coordinate comparison;
- verification of the existing M14/M15 readiness authority required by M16;
- request-plan and mapping-evidence reproduction;
- invocation of a narrow request-plan mapper before credential resolution and a separate
  disabled-adapter port only after exact M18 released evidence verifies.

Knowledge Engine never constructs OpenAI request objects, handles credential bytes, builds an
authentication header, or calls a concrete provider package.

### `@founderos/openai-responses-adapter`

A future package at `integrations/openai-responses/` owns:

- the fixed OpenAI Responses profile for `founder-decision-memo`;
- deterministic mapping from a verified provider-neutral command to a canonical request plan
  through a request-plan mapper facade;
- deterministic mapping from closed, inert fixture envelopes to sanitized evidence;
- a factory-created disabled adapter facade;
- a test-only deterministic fixture harness.

It depends only on shared schema contracts. It has no dependency on Knowledge Engine, the concrete
credential resolver, Node network modules, a provider SDK, or ambient process configuration.

## Canonical Request Plan

The plan binds the exact attempt, Authorization Decision and claim, Delivery, Context, Invocation,
Adapter, provider family, operation, model policy, instruction profile, transport policy,
admission, privacy, observability, and explicit evaluation time. It is constructed and
independently verified before M18 credential resolution and therefore does not contain or depend
on M18 resolution evidence.

The provider profile is fixed to:

- provider family `openai`;
- API family `responses`;
- operation `founder-decision-memo`;
- method `POST`, scheme `https`, hostname `api.openai.com`, port `443`, path `/v1/responses`;
- exact approved immutable model identifier or snapshot;
- explicit `service_tier = default`;
- exact authorized `max_output_tokens`;
- `truncation = disabled`, `stream = false`, `background = false`, `store = false`;
- text input and output only;
- no tools, functions, state, files, images, audio, URLs, or caller headers.

The provider-specific plan must consume and independently verify the exact existing M14
`ProviderRequestPlan`; it does not replace that authority. It additionally binds the
factory-resolved `OpenAIModelPolicy`, repository-owned
`FounderDecisionMemoInstructionProfileV1`, canonical
`FounderDecisionMemoInputProjectionV1`, `OpenAIPromptCachePolicyV1`, and
`M19DisabledAdapterPolicyV1` defined by the dedicated authority contract. Their exact canonical
bytes, bounds, sources, fingerprints, and compatibility rules are normative.

The plan is an evidence artifact, not an HTTP request. It contains no credential, authentication
header, raw provider body, executable callback, or transport handle.

## Fixture Response Mapping

The integration package accepts only strict inert test fixtures representing the approved subset.
A successful mapping requires one terminal completed response, one assistant message, one bounded
valid UTF-8 text output, exact model and effective tier equality, bounded usage, and no unknown or
prohibited output item.

Mapping returns sanitized evidence and bounded advisory memo text. Raw fixture envelopes, unknown
provider fields, reasoning content, tool calls, errors, headers, paths, and unrestricted metadata
never cross the integration facade.

Fixture mapping proves parser and evidence behavior only. It does not prove compatibility with a
current provider response, provider availability, output truth, retention, or live readiness.

## Required Disabled Flow

1. Capture and validate an exact plain-data orchestration wrapper.
2. Apply permanent conflicting-attempt identity precedence.
3. Verify the exact M17 Decision and permanent claim at explicit time.
4. Verify required M14/M15 readiness, the separately captured M19 privacy/retention/cache-policy
   evidence, admission, observability, and disablement authority without treating any of it as
   execution permission.
5. Construct the provider-neutral request-plan command.
6. Invoke the structural request-plan mapper once and independently verify the canonical plan.
7. Invoke the factory-captured existing M18 orchestration boundary exactly once, only after the
   request plan verifies; caller-supplied M18 result or release evidence is forbidden.
8. Compare the successful released M18 evidence with every shared coordinate.
9. Invoke the structural disabled-adapter port once with the verified plan and released evidence.
10. Return `disabled-by-policy` and sanitized preparation evidence.

The flow stops before final pre-send revalidation, authentication-header construction, material
handoff, or send. A successful final pre-send gate is intentionally impossible in M19 because M16
forbids non-transport work between that success and a bounded send.

Fixture-response mapping is a separate deterministic test boundary and is never presented as the
result of the disabled flow.

## Failure and Idempotency Semantics

The public operation is asynchronous because it must establish durable M15/M14 authority and fresh
current-control state. After strict input capture and conflict checking, it installs an `in-flight`
reservation before the first `await`. Exact concurrency returns the ephemeral non-terminal
`preparation_in_progress` observation; conflict returns `conflicting_preparation_identity`; neither
mutates the owner or invokes a protected port. Only the owner installs a permanent terminal result.
Exact terminal replay returns that result without reinvoking an authority, mapper, M18 orchestrator,
or adapter.

Failure precedence is:

1. invalid public input;
2. conflicting preparation identity;
3. invalid or non-authoritative M17 evidence;
4. durable readiness, named policy, coordinate, and expiry checks in the exact taxonomy table;
5. fresh current-control rejection;
6. request-plan construction or verification failure;
7. governed M18 rejection or non-authoritative returned evidence;
8. disabled-policy failure;
9. mandatory `disabled-by-policy` terminal result.

All failures use exactly `M19-preparation-taxonomy-v1`. Fixture mapping uses the unchanged
`M16-error-taxonomy-v1` and the total condition-to-category matrix in the authority contract. Raw
values, errors, fixtures, stack traces, physical paths, authentication-header values, and
provider-like bodies remain private.

## Security and No-Network Closure

The complete M19 production-module closure must reject:

- `node:http`, `node:https`, `node:http2`, `node:net`, `node:tls`, `node:dns`, UDP, sockets,
  WebSocket, `fetch`, `XMLHttpRequest`, EventSource, proxy, tunneling, and provider SDKs;
- child processes, workers, VM, dynamic import, alternate module loaders, reflection-based
  capability acquisition, and ambient network globals;
- environment, filesystem, Keychain, credential-file, secret-manager, or external-store reads;
- caller callbacks, clients, dispatchers, agents, headers, URLs, request functions, or retry hooks;
- runtime package dependencies capable of transport.

Static TypeScript closure analysis and package-manifest checks are supplemented by runtime witnesses
that replace ambient network globals with throwing counters and prove zero calls across success,
rejection, replay, fixture mapping, and disabled-harness paths.

## Test Strategy

- Strict contract, hidden-capability, canonicalization, and fingerprint tests.
- Exact M17/M18 evidence binding, request-plan-before-resolution ordering, and zero-port-call
  preflight tests.
- Request-plan field, instruction hierarchy, model/tier/limit, and deterministic-byte tests.
- Valid and adversarial fixture response mapping tests for every closed M16 response category.
- Permanent identity, exact replay, conflict precedence, immutability, and sanitization tests.
- Transitive import-closure, dependency, secret scan, and runtime no-network witnesses.
- Complete Milestone 04–18 regression and predecessor-bound verification.

## Explicit Non-Goals

- Real or provider-valid credentials, material handoff, authentication headers, or secret stores
- DNS, TLS, sockets, HTTP, `fetch`, proxies, provider SDKs, endpoints selected by callers, or send
- Successful final pre-send revalidation or any live/dry-run transport attempt
- Provider account, model purchase, billing, retention, or deployment configuration
- Provider contract conformance claims based only on fixtures
- Streaming, background mode, state, tools, functions, files, images, audio, web search, or retries
- Agents, Hermes, MCP, routing, failover, UI, autonomous side effects, deployment, or release
- Milestone 20 dry-run closure or later live-execution authorization

## Acceptance Boundary

M19 implementation may begin only after the complete specification package is consistent,
placeholder-free, independently reviewed, and explicitly approved. Implementation completion will
require all focused and repository gates plus an independent exact-candidate review. Neither this
design nor a later green test run authorizes commit, publication, provider access, deployment,
release, or live execution.
