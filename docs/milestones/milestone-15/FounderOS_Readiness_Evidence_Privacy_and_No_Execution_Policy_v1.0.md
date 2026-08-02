# FounderOS Readiness Evidence Privacy and No-Execution Policy v1.0

## Status

**Specified — not implemented**

## Purpose

Prevent the Milestone 15 durable ledger, registration facade, replay verifier, adapter, logs, errors, and indexes from becoming a credential, context, provider-payload, or execution bypass.

## Allowed Durable Material

Durable records may contain only strict non-secret governance evidence such as:

- contract versions;
- logical IDs and lowercase SHA-256 fingerprints;
- bounded provider family references;
- exact Milestone 14 Decision status and stable reason codes;
- ordered gate-trace evidence;
- retained redacted observability evidence;
- evaluator configuration projection;
- Delivery and Invocation identity projection;
- explicit timestamps, sequences, latest audit-entry fingerprints, ledger-head fingerprints, and marker coordinates;
- deterministic comparison and integrity results.

## Prohibited Material

Every public boundary and durable representation must reject or exclude:

- raw Knowledge Objects;
- full Query Results;
- hidden Context or Context Package content;
- Delivery Ledger objects, ports, or filesystem handles;
- credential values, secret bytes, tokens, keys, passwords, certificates, or cookies;
- environment-variable contents or environment dumps;
- authorization headers or signed provider requests;
- arbitrary URLs, endpoints, host overrides, query strings, or URL credentials;
- provider request or response bodies;
- provider-native payloads or executable response objects;
- network clients, sockets, callbacks, functions, promises, streams, or SDK instances;
- raw logs, traces, metrics, or errors containing prohibited values;
- physical filesystem paths in public results;
- caller-supplied record writers, index writers, commit markers, locks, or ledger-head mutations;
- Agents, Hermes, MCP, or tool/function-calling payloads.

## Input Safety

Before reading nested values or consulting authority, public inputs must be captured as exact plain, acyclic, enumerable own data properties. Reject:

- accessors without invoking them;
- symbols;
- non-enumerable fields;
- inherited properties;
- custom prototypes;
- unsupported built-ins;
- aliases that could mutate captured state;
- functions and executable values;
- unknown fields and unsupported versions.

Captured values are deeply immutable or defensively copied before asynchronous work or lock acquisition.

## Credential Reference Rule

Only the exact Milestone 14 logical Credential Reference ID and fingerprint may be persisted. Milestone 15 has no resolver interface, secret lease, environment read, secret-store client, authorization-header builder, or credential cache.

Values that resemble credential material fail closed even if placed in an otherwise unknown or optional field.

## No-Execution Rule

- Registration invokes only the existing non-executing Milestone 14 evaluator.
- Replay invokes only a fresh non-executing Milestone 14 evaluator.
- No status beyond Milestone 14's dry-run and fail-closed statuses is valid.
- A committed transaction is audit evidence, not a capability or authorization token.
- No public API accepts a transport hook, provider client, endpoint, callback, or enabled Adapter.
- No durable record may be supplied directly to a future transport layer as sufficient execution authority.
- A future execution milestone must independently re-establish current authorization, credential, transport, and Invocation authority.

## Authorization Expiration

Persistence freezes evidence; it does not freeze validity (`M15-REPLAY-001`). Historical reconstruction always evaluates the immutable original input at `originalEvaluationTime`, even when current Authorization is expired. Separately, current admissibility evaluates the original Authorization evidence at `replayEvaluatedAt`. Expiration produces `currentAdmissibilityStatus = authorization-expired`; it does not prevent or invalidate a historical `matched` result. Replay cannot extend, refresh, replace, or renew Authorization, and neither assessment grants execution authority.

## Redaction and Errors

- Redaction occurs before any retained diagnostic evidence.
- Public errors use stable reason codes and logical identifiers.
- Comparison evidence reports bounded canonical field paths, not raw values.
- Physical paths, stack-derived secrets, environment values, provider bodies, and headers are excluded.
- Metrics and indexes use bounded low-cardinality logical identifiers.

## Production Import Closure

Future implementation verification must prove that Milestone 15 production modules contain no dependency or dynamic path for:

- HTTP, HTTPS, DNS, TLS, sockets, proxies, or provider SDKs;
- environment-variable secret reads;
- credential or secret resolution;
- random or implicit-clock authority;
- executable provider payloads;
- Agents, Hermes, MCP, or tools/functions.

Standard filesystem and cryptographic hashing APIs are allowed only inside the local persistence adapter and canonical fingerprint implementation.

## Stored-Data Inspection

Acceptance tests must inspect every authoritative record, staging envelope used by fixtures, public result, error, derived index, and observability artifact for prohibited keys and representative secret-like sentinels.

## Principle

Durability must increase auditability without increasing execution authority or the amount of sensitive material FounderOS can access.
