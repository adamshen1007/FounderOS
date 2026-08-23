# FounderOS Provider Data, Privacy, Retention, Observability, Incident, and Kill-Switch Policy v1.0

## Status

**Policy specification — no provider data is sent in Milestone 16**

## Purpose

Define the minimum governance required before verified FounderOS context may be processed by OpenAI and before sanitized production-provider evidence may be retained.

## Data Classification and Minimization

Each future request must carry an explicit data-classification decision. Only data approved for the selected OpenAI project, region, retention posture, and founder decision memo purpose may pass.

The request must contain the minimum Context Package content needed for the decision. It must exclude:

- credentials and secret-like values;
- physical paths and environment data;
- unrelated Knowledge or hidden context;
- personal, financial, legal, health, customer, employee, or third-party confidential data unless a separate policy explicitly permits the exact class;
- files, images, audio, URLs, external attachments, and provider-hosted objects;
- instructions that request a prohibited capability or side effect.

Redaction happens before request construction. Post-response deletion is not a substitute for correct admission.

## OpenAI Retention Decision

Every future environment must bind human-approved evidence of:

- OpenAI organization and project;
- API data-use and training opt-in state;
- default abuse-monitoring posture;
- Modified Abuse Monitoring or Zero Data Retention eligibility and configuration, when required;
- application-state behavior for the selected endpoint and parameters;
- model- and project-specific prompt-cache behavior, minimum and maximum retention, and compatibility with the approved data class;
- processing region and data-residency limitations;
- contractual, privacy, legal, and subprocessor acceptance;
- evidence review time and expiry.

`store: false` is mandatory. It does not replace the preceding evidence. According to [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint), account-level retention controls and endpoint behavior remain separate concerns and may change.

Prompt caching is provider application state and is governed separately from response storage. Omission of prompt-cache request members must not be interpreted as proving that no cache is used: supported models may apply implicit caching. The human-approved provider/account evidence must therefore identify the current behavior and retention of the exact future model, project, endpoint, and request profile.

Callers may not control `prompt_cache_key`, `prompt_cache_options`, deprecated prompt-cache retention members, or content-level prompt-cache breakpoints. Any future adapter-owned prompt-cache choice must be an explicit immutable part of the approved model, Transport, and privacy-policy binding. FounderOS must not claim that prompt caching is disabled unless independent evidence proves that the selected model/project configuration supports and enforces that behavior. See the current [OpenAI Responses request contract](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create).

If the approved retention evidence is missing, expired, inconsistent with live project configuration, or insufficient for the admitted data class, execution is denied.

## Durable Evidence Inventory

A future execution record may retain only bounded sanitized projections required for governance, such as:

- FounderOS request, attempt, Delivery, Context, Invocation, Adapter, model-policy, and Authorization identities/fingerprints;
- logical Credential Reference identity/fingerprint and rotation version;
- Transport, admission, Circuit, Health, privacy, and incident decision fingerprints;
- sanitized provider request identifier if policy permits;
- timestamps, terminal category, bounded usage, and verified cost evidence;
- bounded advisory memo text and its content fingerprint when explicitly approved;
- response-mapping and consumption-evidence fingerprints.

The authoritative inventory must be exact and closed before implementation. Anything not listed is non-persistable.

## Prohibited Durable and Observable Material

- API keys, bearer tokens, authorization headers, secret bytes, or values derived from them
- Raw request or response envelopes
- Raw Context serialization when only fingerprints/evidence are required
- Provider headers, cookies, certificates, stack traces, or unrestricted error bodies
- Internal reasoning, hidden chain-of-thought, or reasoning tokens/content
- Physical paths, environment dumps, host diagnostics, or secret-store coordinates
- Unbounded prompts, completions, logs, traces, metrics labels, or exception objects

## Observability

Redaction and bounding occur before emission. Logs, metrics, and traces use closed schemas and logical identifiers.

Required operational signals include:

- allowed/rejected gate category;
- attempt start and terminal classification;
- latency bucket, input/output token counts, bounded byte counts, and verified cost units;
- rate, Circuit, Health, cancellation, timeout, and provider-error category;
- credential-reference rotation version without secret material;
- kill-switch and incident-policy version;
- redaction and observability-retention evidence.

No high-cardinality founder content may become a metric label. Observability failure before send denies execution. Failure after an ambiguous send must preserve a sanitized terminal result and raise incident evidence without retry.

## Kill Switches

The future boundary must support independently controlled:

1. Global production-provider disablement.
2. OpenAI provider-family disablement.
3. Adapter and immutable model-policy disablement.
4. Environment disablement.
5. Credential-reference revocation.
6. Operation disablement for `founder-decision-memo`.
7. Incident-specific containment.
8. Circuit and Health denial.

The most restrictive current state wins. Disablement is checked at request admission, immediately before secret resolution, and at a distinct final pre-send gate after credential resolution. Before resolution, the Authorization authority must already have atomically and permanently transitioned the exact attempt-bound decision from `allowed-unclaimed` to `claimed-by-exact-attempt`. The final gate verifies that existing claim and revalidates Authorization expiry/revocation, Credential Reference revocation/version, all listed kill switches, Circuit, Health, and incident state; it does not perform an unused-state check or create a claim. Failure releases the ephemeral credential, emits only sanitized evidence, and performs no send. No non-transport work may occur between successful final revalidation and the bounded send. A prior readiness record, Authorization Decision, or successful attempt cannot override current state.

## Incident Response

The incident owner must be able to:

- disable all future attempts immediately;
- revoke affected Credential References;
- identify affected attempts using logical evidence;
- preserve sanitized audit evidence;
- assess provider retention and notification obligations;
- rotate credentials and review policy drift;
- require human approval before re-enablement;
- document root cause, affected data classes, cost, and corrective actions.

Re-enablement requires a new current policy decision and cannot be inferred from elapsed time, process restart, or Circuit cooldown alone.

## Retention and Deletion

FounderOS retention periods for memo content and evidence must be selected before live execution and be no longer than required for governance and user value. Provider-side deletion claims remain external evidence. Local deletion must not destroy immutable audit evidence required to prove what occurred; content and evidence retention therefore require separate classifications and policies.

## Review Triggers

Reapproval is required when OpenAI endpoint behavior, retention documentation, account configuration, prompt-cache behavior or retention, region, subprocessor posture, model policy, admitted data class, observability sink, incident ownership, or local retention policy changes.
