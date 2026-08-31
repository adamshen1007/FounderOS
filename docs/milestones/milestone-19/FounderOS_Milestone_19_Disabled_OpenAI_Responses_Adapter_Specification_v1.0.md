# FounderOS Milestone 19 Disabled OpenAI Responses Adapter Specification v1.0

## Status

Implementation specification candidate for a deterministic, disabled, no-network adapter
foundation. No implementation or publication action is authorized by this document.

## Objective

Implement deterministic OpenAI Responses request-plan mapping, strict fixture-response mapping,
and a disabled adapter facade for `founder-decision-memo` while retaining a structural prohibition
on credential material, authentication headers, and network capability.

## Required Package Boundaries

- `@founderos/knowledge-schema` owns strict serializable contracts and closed taxonomies.
- `@founderos/knowledge-engine` owns M14–M18 authority verification, exact coordinate comparison,
  idempotency, and structural-port orchestration.
- `@founderos/openai-responses-adapter` under `integrations/openai-responses/` owns only fixed
  OpenAI profile mapping, deterministic fixture mapping, and the disabled facade.

Dependencies flow from the service and integration packages to the shared schema. Knowledge Engine
declares separate structural request-plan mapper and disabled-adapter ports and never imports the
concrete integration package. The integration package never imports Knowledge Engine or the
credential resolver.

## Mandatory Behavior

1. Capture exact plain own-key input before protected access.
2. Reject unknown, hidden, symbolic, inherited, accessor-backed, custom-prototype, non-canonical,
   secret-shaped, URL-shaped, callback, client, or executable input.
3. Apply permanent conflicting preparation-identity precedence.
4. Verify exact registered M17 Decision and claim authority at explicit time.
5. Before the first `await`, install the process-local owner reservation; then use factory-captured
   asynchronous ports to verify the exact durable M15/M14 transaction and a fresh signed snapshot
   of current admission, budget, privacy, retention, observability, Circuit, Health, incident, and
   kill-switch state at one explicit `evaluatedAt`. M15 current admissibility alone is insufficient.
6. Construct one provider-neutral immutable request-plan command.
7. Resolve and verify the exact model-policy authority, immutable instruction profile, canonical
   governed input projection, prompt-cache policy, and separate M19 disabled policy.
8. Invoke the request-plan mapper once and independently reproduce the fixed provider-specific plan
   from the exact verified M14 `ProviderRequestPlan` and those authorities.
9. Only after plan verification, invoke the factory-captured existing M18 orchestration boundary;
   reject all caller-supplied M18 results, evidence, ports, and alternate orchestrators.
10. Compare every Decision, claim, Attempt, Credential Reference, rotation, resolver, Adapter,
   provider, environment, operation, purpose, and deadline binding.
11. Invoke the disabled-adapter port once with the verified plan and released M18 evidence.
12. Return only a frozen `disabled-by-policy` result with sanitized preparation evidence.

Exact replay performs no second mapper, resolver, or adapter invocation. Conflicting reuse fails
before mutable or protected authority access.

## Structural Stop

The adapter exposes no send-like operation and contains no transport dependency. M19 cannot reach
a successful final pre-send gate, construct an authentication header, receive credential material,
or produce a provider response. Fixture-response mapping is isolated test behavior and cannot be
invoked as proof that a disabled attempt executed.

## Request and Response Rules

The canonical request plan uses only the fixed M16 envelope and independently verified governed
inputs. Unknown provider members and caller overrides reject rather than being ignored.

Fixture responses must conform to the exact accepted subset. Mapping verifies shape, bounds, model,
tier, usage, and prohibited output kinds. It does not verify model truth. Public preparation
failures use exactly `M19-preparation-taxonomy-v1`. Isolated fixture mapping uses exactly the
unchanged `M16-error-taxonomy-v1` total mapping. No undocumented fallback is permitted.

## Security Closure

Production M19 modules and runtime dependencies may not acquire filesystem, environment, process,
module-loader, DNS, TLS, HTTP, HTTPS, socket, proxy, network-global, provider-SDK, credential,
Agent, Hermes, or MCP capabilities. Runtime witnesses must prove zero attempted network calls.

## Explicit Non-Goals

- Real credential or secret-store integration
- Material-bearing adapter ports or authentication headers
- HTTP request serialization or outbound transport
- Successful final pre-send revalidation
- Live, simulated-live, or dry-run provider execution
- Deployment, release, provider configuration, billing, Agents, Hermes, MCP, or UI
- Milestone 20 behavior

## Completion Boundary

Implementation completion requires focused red-green evidence, exact acceptance traceability, all
repository gates, secret and capability scans, and an independent whole-candidate review with no
unresolved Critical, Important, or Minor finding. Completion does not authorize Git publication
or any external action.
