# FounderOS Secure Outbound Provider Transport Policy v1.0

## Purpose

Define the future outbound transport controls required for a production provider call.

## Policy Fields

- Contract version
- Transport policy ID
- Provider family reference
- Allowed scheme
- Allowed hostnames
- Allowed ports
- DNS resolution policy
- Redirect policy
- TLS requirement
- Minimum TLS version
- Certificate validation policy
- Connection timeout
- Request timeout
- Response size limit
- Retry transport policy
- Proxy policy
- Egress classification
- Policy fingerprint

## Required Controls

- HTTPS only
- Explicit hostname allowlist
- No user-supplied arbitrary URL
- No redirects by default
- Certificate verification required
- Private, loopback, link-local, metadata, and reserved-address targets rejected unless an approved internal-provider policy explicitly allows them
- Request and response size limits
- Explicit timeouts
- Sanitized network errors
- No credentials in URLs
- No provider call in Milestone 14

## Authoritative Configuration

The public readiness input carries only the candidate signed Transport Policy. A provider-neutral,
deterministic configuration authority is captured once when the readiness evaluator or disabled
harness is created, and no request may replace it. Only authorities produced by the approved static
factory are accepted. The authority is keyed by the exact authorized Adapter ID, Adapter fingerprint,
provider family, and Transport Policy version. It exposes only one synchronous policy-lookup
operation: no URL, provider client, network, credential, secret, DNS, TLS, or socket operation is
permitted. The readiness facade may invoke this authority only after Authorization has been allowed,
and it must reject a candidate Policy that is not canonically identical to the trusted signed Policy
returned for that exact Adapter binding.

## Milestone 13 Compatibility

- Invocation timeout must be less than or equal to Transport request timeout.
- Milestone 13 application-attempt retry governs invocation attempts, budgets every attempt, and may
  retry even when the Transport Policy is `no-transport-retry`.
- Milestone 14 Transport retry governs only future outbound transport behavior. Both allowed
  Transport retry values are valid independently of the Invocation retry mode and attempt count.
- Request Plan construction and independent replay verification must reconstruct and enforce these
  timeout and independent-retry rules, including for coherently re-signed substitutions.
- `maximumResponseBytes` is at most `Number.MAX_SAFE_INTEGER - 1`, reserving one representable byte
  for deterministic oversized-response evidence.

## Dry-Run Rule

Milestone 14 may construct and verify a transport plan but must not open sockets, resolve live provider DNS, or send traffic.

## Principle

Provider transport must be policy generated and independently verifiable, never caller controlled.
