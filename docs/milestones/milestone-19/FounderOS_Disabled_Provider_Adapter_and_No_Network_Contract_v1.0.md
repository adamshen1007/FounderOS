# FounderOS Disabled Provider Adapter and No-Network Contract v1.0

## Request-Plan Mapper Port

Knowledge Engine first declares a narrow structural mapper port. It accepts one immutable
non-secret request-plan command after M17 and all pre-resolution non-secret gates pass. It returns
only a canonical request plan or a strict sanitized rejection. It cannot accept M18 evidence or
credential material because request-plan verification precedes credential resolution.

## Disabled Adapter Port

After the plan verifies and exact M18 released evidence verifies, Knowledge Engine invokes a
separate narrow structural disabled-adapter port. It accepts the verified plan, the exact released
evidence, and their shared non-secret coordinates and returns a strict sanitized preparation
result. The concrete integration facade is structurally compatible but is not imported by
Knowledge Engine.

The facade may expose deterministic plan construction, independent plan verification, fixture
mapping, inspection of its fixed disabled descriptor, and disabled evaluation. It must not expose
send, execute, connect, request, stream, retry, authenticate, header, credential, endpoint override,
client, callback, dispatcher, or generic extension methods.

## Terminal State

For valid authoritative input the only adapter terminal state is `disabled-by-policy`. It binds the
request-plan identity and fingerprint, Adapter identity and fingerprint, operation, fixed disabled
policy version, evaluation time, and a sanitized evidence fingerprint.

The M14 prerequisite is separately `ready-for-dry-run` under an Adapter Descriptor whose state is
`dry-run-mapping`; M14 `disabled` and `disabled-by-policy` states cannot satisfy full readiness. The
M19 disabled policy is a distinct immutable artifact bound to that exact M14 Decision, transaction,
Adapter, model, instruction, cache, and mapping authority. Its restrictive state always wins and
cannot be changed by the caller.

There is no `ready`, `enabled`, `sent`, `completed`, `live`, or equivalent state. Rejection uses a
closed bounded reason inventory.

## Capability Closure

The complete production import graph and runtime dependencies must exclude network, filesystem,
environment, secret-source, provider-SDK, dynamic-code, module-loader, worker, process-spawn, Agent,
Hermes, MCP, and caller-injected capabilities. Package manifests must contain no runtime dependency
that can provide transport.

The implementation must use TypeScript-aware transitive closure analysis and adversarial syntax
witnesses for aliases, computed access, destructuring, bracketed globals, indirect loaders, and
reflection. Runtime witnesses replace all available ambient network globals with throwing counters
and require exactly zero calls across every public operation.

## Credential Boundary

M19 consumes only verified M18 released evidence. It receives no buffer, string, lease, closure,
header, secret-store handle, or material-derived value. A valid M18 result proves only that the
synthetic resolver completed and released its owned bytes; it cannot authenticate or authorize
transport.

## Final Pre-Send Boundary

M19 stops before successful final pre-send revalidation. That gate belongs to a later closure that
can transition immediately into one separately authorized bounded send. M19 must not simulate a
successful final gate and then perform mapping, logging, or any other non-transport work.
