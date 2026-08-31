# FounderOS OpenAI Responses Request Plan and Response Mapping Contract v1.0

## Request Plan

`OpenAIResponsesRequestPlan` is strict canonical plain data. It binds the exact preparation,
Attempt, Decision, claim, Delivery, Context, Invocation, Adapter, model, instruction, transport,
admission, privacy, observability, and policy fingerprints. The plan is constructed and verified
before M18 resolution and contains no resolution evidence.

Its provider profile is fixed to the M16 envelope: `openai`, `responses`,
`founder-decision-memo`, `POST`, `https`, `api.openai.com`, `443`, `/v1/responses`, exact immutable
model identity, explicit `service_tier = default`, exact bounded `max_output_tokens`, disabled
truncation, streaming, background mode, and storage, text-only modalities, and no tools or state.

The plan contains a deterministic bounded content projection and fingerprint. It contains no
credential, authorization header, raw Knowledge Object, caller URL, client, callback, provider
SDK object, or executable request.

The plan embeds the exact existing M14 `ProviderRequestPlan` ID/fingerprint and independently
verified construction authority. It also binds the complete verified model-policy, immutable
instruction-profile, governed input-projection, prompt-cache-policy, and M19 disabled-policy IDs,
versions, and fingerprints from the dedicated authority contract. Model, instructions, input,
tier, token limit, and cache posture are therefore derived from named authorities rather than
opaque caller values.

The plan records instruction and input Unicode-code-point counts separately from their UTF-8 byte
counts, their summed authorized-input byte count, and the canonical provider-body UTF-8 byte count.
It binds every source ceiling and compares only like units: input characters to M13
`maxInputCharacters`; response characters to M13/M14 `maxOutputCharacters`; instruction-plus-input
bytes to M17 `maximumInputBytes`; provider-body bytes to M14 `maximumRequestBytes`; response bytes
to both M14 `maximumResponseBytes` and M17 `maximumOutputBytes`, using their exact minimum; and
fixture-reported input/output token usage to M17 `maximumInputTokens`/`maximumOutputTokens`.
Every observed count and derived minimum is independently reproducible. M19 defines no tokenizer,
token estimate, or character/byte/token conversion.

## Independent Reproduction

A verifier reconstructs the exact plan from authoritative inputs and compares canonical bytes and
a domain-separated SHA-256 fingerprint. Missing, reordered, unknown, substituted, stale, mutable,
or caller-controlled values fail closed.

## Fixture Response

`OpenAIResponsesFixtureEnvelope` is a test-only strict representation of the approved response
subset. Valid success contains one terminal completed response, one assistant message, one bounded
UTF-8 text output with exactly the eight ordered non-empty level-two decision-memo sections, exact
model and effective tier equality, bounded input/output token usage, and an optional bounded
sanitized provider request reference.

Partial, refused, cancelled, multi-message, tool-bearing, reasoning-bearing, file, image, audio,
unknown, malformed, oversized, wrong-model, wrong-tier, and invalid-usage fixtures map through the
exact total `M16-error-taxonomy-v1` table in the authority contract. No generic fallback exists.
Strict parsing occurs first; the table then uses ordered first-applicable precedence for all
multi-fault fixtures.

## Mapping Evidence

`OpenAIResponsesMappingEvidence` binds the exact fixture identity and fingerprint, request-plan
identity and fingerprint, Attempt, model, tier, terminal category, bounded usage, bounded advisory
memo fingerprint, mapping profile version, and evidence fingerprint.

The public mapped result contains bounded advisory text only on strict success. It never contains
the raw fixture, provider error, headers, internal reasoning, unknown metadata, stack, path, or
credential-like value. Fixture evidence cannot be used to claim provider conformance, availability,
retention, or execution.
