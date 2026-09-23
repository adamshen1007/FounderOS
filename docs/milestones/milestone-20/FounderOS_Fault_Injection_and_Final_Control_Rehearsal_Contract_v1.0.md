# FounderOS Fault Injection and Final-Control Rehearsal Contract v1.0

## Purpose

Define deterministic failure probes and the non-authoritative M16 final-control rehearsal without
adding executable caller hooks or a live pre-send gate.

## Scenario Authority

Every `M20ScenarioDescriptorV1` belongs to one immutable repository-owned catalog. A descriptor
binds its ID, version, purpose, expected terminal status, expected reason, exact ordered stage
sequence, exact protected-boundary counts, primary fault, optional precedence fault, and scenario
fingerprint.

The catalog has a version, exact ordered descriptor list, catalog fingerprint, and independent
verifier. Scenario ID alone is insufficient; the exact descriptor and catalog fingerprint must
verify. Callers cannot register or replace scenarios at runtime.

## Fault Declaration

`M20FaultDeclarationV1` is plain data with exactly:

- fault ID and closed fault kind;
- one closed injection stage;
- one closed expected affected boundary;
- one deterministic fixture reference;
- one fault fingerprint.

It contains no callback, function name, module path, exception object, arbitrary payload, delay,
sleep, clock mutation, random seed, network target, credential, or header.

## Injection Safety

Only test-owned structural port implementations interpret fault declarations. The production
conductor sees authoritative scenario expectations and ordinary port results; it contains no
conditional branch that disables validation or fabricates predecessor evidence. A fault must
exercise the same public contract used by the success scenario.

## Final-Control Rehearsal

A factory-created process-local `M20FinalControlSnapshotAuthority` owns scenario control state and
exposes exactly `issueSnapshot` and `verifySnapshot`. The conductor captures that exact authority at
construction; callers cannot provide a snapshot, issuer, proof, or replacement port. The authority
permanently registers each issued snapshot in a private run-ID registry and verifies exact object
identity, canonical bytes, coordinates, issuer binding, and fingerprint. Its state is test-only,
non-durable, and cannot be imported by a live execution boundary.

`@founderos/knowledge-engine` declares only the two-method structural authority port. Its concrete
deterministic implementation and factory live under `tests/support/milestone-20/`; no production
package exports or imports that implementation.

The test-only factory accepts one strict configuration with exact keys `schemaVersion`,
`authorityId`, `catalog`, and `profiles`. `profiles` contains one exact
`M20FinalControlProfileV1` for every catalog scenario that reaches the rehearsal stage. The factory
validates the complete catalog/profile bijection and fingerprints before creating registry state.
It derives `authorityFingerprint` from that validated configuration under the closed
final-control-authority fingerprint domain; callers never provide that fingerprint. No operation
accepts a replacement catalog, profile, or authority coordinate.

The structural port signatures are synchronous and exact:

```text
issueSnapshot({
  schemaVersion: "1.0",
  snapshotId,
  runId,
  scenarioId,
  scenarioFingerprint,
  catalogFingerprint,
  rehearsalEvaluatedAt,
  decision,
  claim,
  credentialResolutionRequest,
  m19Terminal
}) -> M20FinalControlSnapshotIssuanceResultV1

verifySnapshot({
  schemaVersion: "1.0",
  runId,
  snapshot
}) -> M20FinalControlSnapshotVerificationResultV1
```

Issuance returns exactly `{ status: "issued", snapshot }` or
`{ status: "rejected", reasonCode }`, where `reasonCode` is
`invalid_snapshot_request`, `conflicting_snapshot_identity`,
`scenario_profile_non_authoritative`, `coordinate_mismatch`, `authority_expired`, or
`internal_snapshot_authority_failure`. Verification returns exactly `{ status: "valid" }` or
`{ status: "invalid", reasonCode: "snapshot_non_authoritative" }`. Both methods capture exact own
plain data before registry/profile access and normalize unexpected faults to the closed result.

The first valid issuance permanently owns both `runId` and `snapshotId`. Exact retry returns the
original frozen snapshot; conflicting reuse fails before profile or mutable state access. The
authority selects the profile only by the exact factory-captured catalog entry's
`finalControlProfileReference`; caller data cannot select or mutate control state.

`M20FinalControlSnapshotV1` has exact keys: `schemaVersion`, `snapshotId`, `runId`,
`rehearsalEvaluatedAt`, `validFrom`, `validUntil`, `authorityId`, `authorityFingerprint`,
`authorizationDecisionId`, `authorizationDecisionFingerprint`, `authorizationClaimId`,
`authorizationClaimFingerprint`, `executionAttemptId`, `executionAttemptFingerprint`, `adapterId`,
`adapterFingerprint`, `modelPolicyReference`, `modelPolicyFingerprint`, `providerFamilyReference`,
`environmentClass`, `operation`, `credentialReferenceId`, `credentialReferenceFingerprint`,
`credentialRotationVersion`, the 12 current control results below, and `snapshotFingerprint`.
`providerFamilyReference` is literal `provider-family/openai`; `operation` is literal
`founder-decision-memo`; all other coordinate types reuse their accepted M17–M19 schemas.
`validFrom <= rehearsalEvaluatedAt < validUntil`; the snapshot time cannot precede M19
`evaluatedAt`. The authority issues only after M19 `disabled-by-policy` is exact-bound.

Every identity coordinate has one normative source: Decision and claim fields come from the exact
verified returned M17 objects; Attempt, Adapter, provider, environment, operation, Credential
Reference, and rotation fields come from the exact captured `credentialResolutionRequest` after
its Decision/claim coordinates match those objects; model-policy reference and fingerprint come
from `decision.authorizationRequest`; and public M19 fields come only from the exact returned
terminal. The authority requires all overlapping coordinates to be byte-equal. The selected
profile supplies the 11 controls other than Authorization expiry. The authority derives
`authorizationExpiryState` as `current` exactly when
`rehearsalEvaluatedAt < decision.expiresAt`, otherwise `expired`; a profile cannot override it.
The snapshot's `credentialRotationVersion` equals
`credentialResolutionRequest.expectedRotationVersion` exactly.

The 12 exact control keys and values are:

| Key | Closed value |
| --- | --- |
| `globalKillSwitch` | `allow` or `deny` |
| `providerKillSwitch` | `allow` or `deny` |
| `adapterKillSwitch` | `allow` or `deny` |
| `modelKillSwitch` | `allow` or `deny` |
| `environmentKillSwitch` | `allow` or `deny` |
| `operationKillSwitch` | `allow` or `deny` |
| `incidentState` | `clear` or `active` |
| `credentialReferenceState` | `current`, `revoked`, or `stale` |
| `circuitState` | `closed`, `open`, or `half-open` |
| `healthState` | `healthy`, `unhealthy`, `unavailable`, or `quarantined` |
| `authorizationRevocationState` | `active` or `revoked` |
| `authorizationExpiryState` | `current` or `expired` |

The conductor calls `issueSnapshot` once, calls `verifySnapshot` on the exact returned object once,
then deterministically constructs and independently verifies the rehearsal evidence. A fresh,
self-consistent caller object is non-authoritative even when its fingerprint is valid.

`M20FinalControlRehearsalEvidenceV1` binds:

- contract version, rehearsal ID, run ID, and explicit evaluation time;
- exact M17 Decision, claim, Attempt, Adapter, model, provider, environment, operation, and
  Credential Reference identity/fingerprint/rotation coordinates;
- current Authorization expiry and revocation result;
- current Credential Reference rotation and revocation result;
- global, provider, Adapter, model, environment, and operation kill-switch results;
- Circuit, Health, and incident results;
- outcome `would-allow` or `would-deny`;
- exactly one closed denial reason when denied;
- policy version and rehearsal fingerprint.

Its exact keys are `schemaVersion`, `rehearsalEvidenceId`, `runId`, `snapshotId`,
`snapshotFingerprint`, `rehearsalEvaluatedAt`, `authorizationDecisionId`,
`authorizationDecisionFingerprint`, `authorizationClaimId`, `authorizationClaimFingerprint`,
`executionAttemptId`, `executionAttemptFingerprint`, `adapterId`, `adapterFingerprint`,
`modelPolicyReference`, `modelPolicyFingerprint`, `providerFamilyReference`, `environmentClass`,
`operation`, `credentialReferenceId`, `credentialReferenceFingerprint`,
`credentialRotationVersion`, `globalKillSwitch`, `providerKillSwitch`, `adapterKillSwitch`,
`modelKillSwitch`, `environmentKillSwitch`, `operationKillSwitch`, `incidentState`,
`credentialReferenceState`, `circuitState`, `healthState`, `authorizationRevocationState`,
`authorizationExpiryState`, `outcome`, optional `denialReasonCode`, `policyVersion`, and
`evidenceFingerprint`. Every copied value must equal the exact verified snapshot value.
`schemaVersion` is literal `1.0`, and `policyVersion` is literal
`m20-final-control-policy-v1`.
`denialReasonCode` is absent for `would-allow` and required for `would-deny`; it is exactly one of
`global_disabled`, `provider_disabled`, `adapter_disabled`, `model_disabled`,
`environment_disabled`, `operation_disabled`, `incident_active`, `credential_revoked`,
`credential_stale`, `circuit_not_closed`, `health_not_healthy`, `authorization_revoked`, or
`authorization_expired`.

An issuance rejection returns `final_control_issuance_rejected` without invoking verification.
Structural schema, issuer, freshness, and coordinate verification happens next and returns
`final_control_non_authoritative` without interpreting control state. For an authoritative
snapshot, any deny outcome returns `final_control_rehearsal_denied`, and the most restrictive
current state wins in this reporting order, aligned with accepted M16 containment precedence:

1. global kill switch is `deny`;
2. provider kill switch is `deny`;
3. Adapter kill switch is `deny`;
4. model kill switch is `deny`;
5. environment kill switch is `deny`;
6. operation kill switch is `deny`;
7. incident active;
8. Credential Reference revoked or rotation stale;
9. Circuit not closed;
10. Health not healthy;
11. Authorization revoked;
12. Authorization expired.

All checks use one explicit time and one immutable snapshot. Missing, stale, malformed, ambiguous,
or non-authoritative input denies.

## Non-Authority Rule

Rehearsal evidence is deliberately typed and fingerprinted as test evidence, not an Authorization
Decision, claim, Credential Resolution Evidence, M19 preparation result, Transport Plan, or future
live final-gate artifact. No production execution component may accept it. `would-allow` must never
be renamed, projected, or coerced into `allowed`, `ready`, `enabled`, or `send` authority.

The future live final pre-send gate remains separately specified and must evaluate real current
authorities after real adapter-private credential resolution, then proceed immediately to one
bounded send without intervening non-transport work. M20 does neither.

## Required Precedence Cases

Tests must include every single denial and at least these multi-fault pairs:

- every kill switch plus expired or revoked Authorization;
- expired Authorization plus revoked credential;
- revoked credential plus Circuit, Health, and Authorization denial;
- global plus provider/Adapter/model/environment/operation disablement;
- Circuit open plus unhealthy state;
- unhealthy state plus active incident.

Each pair must yield the first reason above and zero provider/network attempts.

## Recovery and Replay

Faulted runs are terminal within the conductor instance. Every replay performs the two mandatory
read-only network-witness reads. At zero delta it returns the original stored terminal result
without rerunning a protected or authority port. At positive delta it returns transient
`integrity-rejected` without mutating the permanent owner. Report call counts always describe the
original owner execution. Separate test-owned counting witnesses assert a zero protected-call delta
for an exact replay or non-owner concurrent invocation; those ephemeral deltas never alter the
original report or enter M20 public contracts. Recovery means creating a new run ID with newly
authoritative inputs; it does not reopen a claim, resolution, preparation, or report. Process
restart loses M20 run state and grants no authority.
