# FounderOS M20 Dry-Run Contract Catalog v1.0

## Purpose

Close the M20 public data model so an unfamiliar implementer can build compatible schemas,
fingerprints, conductor results, and verifiers without inventing fields or failure behavior.

## Shared Primitives and Bounds

M20 reuses these accepted exported schemas without widening them:

- IDs: `ExecutionAuthorizationIdentifierSchema`
- logical references: `ProviderReadinessLogicalReferenceSchema`
- fingerprints: `Sha256DigestSchema`
- instants: `IsoTemporalSchema`
- canonical values: `DurableCanonicalJsonValueSchema`
- M17 artifacts: `ExecutionAuthorizationRequestSchema`,
  `VerifiedServiceIdentityEvidenceSchema`, `HumanExecutionApprovalEvidenceSchema`,
  `ExecutionAuthorizationDecisionSchema`, and `ExecutionAuthorizationClaimSchema`
- M18 command input: `CredentialResolutionRequestSchema`
- M19 preparation terminal: `M19PreparationResultSchema`

Arrays are bounded to 32 entries unless a smaller exact bound is stated. Human-readable purpose is
an enum, never free text. All numeric counts are non-negative safe integers. Every M20 object is
`.strict()`, satisfies the canonical-value schema, and is deeply frozen after parsing or creation.

## Fingerprint Domains

Each fingerprint is lowercase SHA-256 over repository canonical JSON, prefixed by the exact UTF-8
domain and one LF byte:

| Artifact | Domain | Excluded field |
| --- | --- | --- |
| request | `founderos/m20/dry-run-request/v1` | `requestFingerprint` |
| fault | `founderos/m20/fault/v1` | `faultFingerprint` |
| scenario | `founderos/m20/scenario/v1` | `scenarioFingerprint` |
| catalog | `founderos/m20/scenario-catalog/v1` | `catalogFingerprint` |
| stage observation | `founderos/m20/stage-observation/v1` | `observationFingerprint` |
| final-control authority | `founderos/m20/final-control-authority/v1` | derived value; no field exists in factory input |
| final-control snapshot | `founderos/m20/final-control-snapshot/v1` | `snapshotFingerprint` |
| final-control profile | `founderos/m20/final-control-profile/v1` | `profileFingerprint` |
| rehearsal evidence | `founderos/m20/final-control-rehearsal/v1` | `evidenceFingerprint` |
| report | `founderos/m20/dry-run-report/v1` | `reportFingerprint` |

No other field is omitted, normalized, sorted outside canonical serialization, or added after
fingerprinting.

## `M20DryRunRequestV1`

Exact keys:

| Key | Type or constraint |
| --- | --- |
| `schemaVersion` | literal `1.0` |
| `runId` | accepted ID schema |
| `scenarioId` | accepted ID schema |
| `scenarioFingerprint` | SHA-256 |
| `catalogFingerprint` | SHA-256 |
| `evaluatedAt` | accepted instant |
| `rehearsalEvaluatedAt` | accepted instant, not before `evaluatedAt` |
| `authorizationRequest` | exact M17 request |
| `serviceIdentityEvidence` | exact M17 evidence |
| `humanApprovalEvidence` | exact M17 evidence |
| `authorizationDecisionId` | accepted ID schema |
| `authorizationDecisionExpiresAt` | accepted instant, after `evaluatedAt` |
| `authorizationClaimId` | accepted ID schema |
| `preparationId` | accepted ID schema |
| `requestPlanId` | accepted ID schema |
| `credentialResolutionRequest` | exact M18 request |
| `finalControlSnapshotId` | accepted ID schema |
| `rehearsalEvidenceId` | accepted ID schema |
| `requestFingerprint` | request fingerprint |

The request does not accept a Decision, claim, M18 result/evidence, M19 result, scenario object,
port, callback, clock, fault, client, endpoint, credential, header, or arbitrary metadata.

## Scenario and Catalog Contracts

`M20FaultDeclarationV1` exact keys are `schemaVersion`, `faultId`, `faultKind`, `injectionStage`,
`affectedBoundary`, `fixtureReference`, and `faultFingerprint`. `faultKind`, `injectionStage`, and
`affectedBoundary` are closed enums owned by schema. `fixtureReference` uses the logical-reference
schema and cannot be a path or URL.

The exact `faultKind` enum is:

- `authorization-issuance-denied`
- `authorization-decision-non-authoritative`
- `authorization-claim-conflict`
- `authorization-claim-non-authoritative`
- `readiness-non-authoritative`
- `model-policy-invalid`
- `instruction-profile-invalid`
- `prompt-cache-policy-invalid`
- `current-control-rejected`
- `credential-unavailable`
- `credential-rotation-stale`
- `credential-revoked`
- `credential-deadline-expired`
- `credential-materialization-fault`
- `credential-release-fault`
- `m19-terminal-malformed-or-known-coordinate-mismatch`
- `final-control-snapshot-issuance-fault`
- `final-control-snapshot-non-authoritative`
- `final-control-global-disabled`
- `final-control-provider-disabled`
- `final-control-adapter-disabled`
- `final-control-model-disabled`
- `final-control-environment-disabled`
- `final-control-operation-disabled`
- `final-control-incident-active`
- `final-control-credential-revoked`
- `final-control-credential-stale`
- `final-control-circuit-not-closed`
- `final-control-health-not-healthy`
- `final-control-authorization-revoked`
- `final-control-authorization-expired`

The exact `injectionStage` enum is the eight stage names in the Stage Observations table. The exact
`affectedBoundary` enum is `m17-issuance`, `m17-claim`, `m19-readiness`,
`m19-policy`, `m18-resolution`, `m19-terminal`, or `m20-final-control-authority`.

`M20ScenarioDescriptorV1` exact keys are:

- `schemaVersion`, `scenarioId`, `scenarioVersion`, and `catalogVersion`;
- `purpose`, one of `success`, `single-fault`, `precedence`, `concurrency`, or `replay`;
- `expectedOwnerResult`, one of `dry-run-verified`, `dry-run-rejected`, or
  `integrity-rejected`;
- optional `expectedOwnerReasonCode`, present exactly when the owner result is a rejection;
- optional `expectedFollowerResult`, required only for `concurrency` and `replay`; it is
  `in-flight` for the concurrent follower and exactly equals the owner's terminal result for the
  replay follower;
- `expectedObservations`, an ordered array of 1–8 exact stage/outcome pairs;
- `expectedOwnerCallCounts`, the exact call-count object below;
- optional `expectedFollowerCallDelta`, required only for `concurrency` and `replay` and containing
  the same exact six keys all set to zero;
- `finalControlProfileReference`, a logical reference resolved only by the captured test authority;
- optional `primaryFault` and optional `precedenceFault`, each a fault declaration;
- `scenarioFingerprint`.

`M20ScenarioCatalogV1` exact keys are `schemaVersion`, `catalogVersion`, `scenarios`, and
`catalogFingerprint`. `schemaVersion` is literal `1.0`; `catalogVersion` is literal
`m20-scenario-catalog-v1`. `scenarios` contains 1–256 entries,
is ordered by ascending `scenarioId`, and has no duplicate scenario, fault, or fixture reference.
The complete runtime catalog is factory-captured; a request only identifies and fingerprints one
entry. Report-verifier mutations use a separate test-only table that is not an M20 runtime contract,
catalog entry, conductor input, result, or report.

Invalid wrappers, run-ID conflicts, and missing/substituted scenario references occur before an
authoritative catalog entry can be selected. They therefore belong to a separate preflight-negative
test matrix and never masquerade as catalog-authorized fault scenarios.

## Final-Control Profile

`M20FinalControlProfileV1` is test-only canonical data captured by the final-control authority
factory. Its exact keys are `schemaVersion`, `profileReference`, `scenarioId`, `validFrom`,
`validUntil`, the 11 exact current-control keys from the final-control contract other than
`authorizationExpiryState`, and `profileFingerprint`. Authorization expiry is derived only from
the Decision expiry and rehearsal time. A profile contains no run, Decision, claim, Attempt,
Adapter, model,
Credential Reference, caller object, callback, or port; those coordinates come only from the
authority's validated issuance command. Profile references are unique, repository-logical, and
must match exactly one authoritative scenario.

`expectedOwnerReasonCode` is exactly one of `scenario_non_authoritative`,
`authorization_issuance_rejected`,
`authorization_claim_rejected`, `preparation_rejected`, `preparation_non_authoritative`,
`final_control_issuance_rejected`, `final_control_non_authoritative`,
`final_control_rehearsal_denied`, or `internal_integrity_failure`, subject to the owner-result
discriminant and report grammar below.

## Protected Call Counts

`M20ProtectedCallCountsV1` has exactly six non-negative safe-integer keys:

- `authorizationIssuanceCalls`
- `authorizationClaimCalls`
- `authorizationVerificationCalls`
- `m19PreparationCalls`
- `finalControlIssuanceCalls`
- `finalControlVerificationCalls`

Every value is 0 or 1 except `authorizationVerificationCalls`, which is 0, 1, or 2 for Decision
and claim verification. Network attempts are a separate literal-zero report field, not a protected
port count.

## Network-Attempt Witness Port

`@founderos/knowledge-engine` declares a factory-captured read-only
`M20NetworkAttemptWitnessPort` with exactly one synchronous method:

```text
readAttemptCount() -> non-negative safe integer
```

The value is monotonic for the lifetime of one test composition. Every invocation, including a
concurrent follower and terminal replay, reads it before public-input capture and again before
return. A zero-delta follower returns `in-flight`; a zero-delta replay returns the original frozen
terminal result. A positive-delta owner stores report-free `integrity-rejected`; a positive-delta
follower or replay also returns `integrity-rejected` but never mutates or replaces the permanent
owner. A conforming report is created only from an observed zero delta. Witness reads are not
protected-boundary calls and do not enter `M20ProtectedCallCountsV1`.

Only `tests/support/milestone-20/` provides the concrete witness. It wraps every available ambient
network global before constructing any M20 dependency and increments before rejecting an attempted
call. TypeScript-aware production closure separately prohibits native network imports and dynamic
loading, so the test witness and closure proof cover both ambient and imported capability. Callers
cannot provide, reset, replace, or mutate the captured witness.

## Stage Observations

Every `M20StageObservationV1` has common keys `schemaVersion`, `stage`, `position`, `outcome`,
`observedAt`, `artifactBindings`, and `observationFingerprint`. `position` is contiguous and
one-based. `observedAt` equals request `evaluatedAt`, except final-control observation uses
`rehearsalEvaluatedAt`.

`artifactBindings` is a strict stage-discriminated object:

| Stage | Exact binding keys |
| --- | --- |
| `request-accepted` | `runId`, `requestFingerprint` |
| `scenario-authority-verified` | `scenarioId`, `scenarioFingerprint`, `catalogFingerprint` |
| `authorization-issued` | `authorizationDecisionId`, optional `authorizationDecisionFingerprint` present only on completion |
| `authorization-claimed` | `authorizationClaimId`, optional `authorizationClaimFingerprint` present only on completion |
| `preparation-started` | `preparationId`, `requestPlanId` |
| `preparation-disabled-bound` | on completion, every public M19 field listed below; on rejection, `preparationId` only |
| `final-control-rehearsal-complete` | `rehearsalEvidenceId`; `rehearsalEvidenceFingerprint` and `rehearsalOutcome` (`would-allow` or `would-deny`) are present when authoritative evidence was constructed, including an authoritative deny, and absent when issuance or verification rejects |
| `no-network-verified` | literal `networkAttemptCount: 0` |

A rejected observation also contains exactly one `reasonCode` from the M20 terminal taxonomy. A
completed observation has no reason. No private M18 or M19 artifact is represented.

The only public M19 terminal fields M20 may bind are exactly:

- `preparationId`
- `requestPlanId`
- `requestPlanFingerprint`
- `credentialResolutionEvidenceFingerprint`
- `disabledPolicyFingerprint`
- `adapterId`
- `adapterFingerprint`
- `operation`
- `disabledPolicyVersion`
- `evaluatedAt`

Credential-resolution evidence remains fingerprint-only. M20 must not add or fabricate an evidence
ID, resolution ID, secret-material identity, or private request plan.

## Exact Report Grammar

`M20DryRunReportV1` exact keys are:

- `schemaVersion`, literal `1.0`;
- `taxonomyId`, literal `M20-dry-run-taxonomy-v1`;
- `runId`, `scenarioId`, `scenarioFingerprint`, `catalogFingerprint`, `evaluatedAt`, and
  `rehearsalEvaluatedAt`;
- `requestFingerprint`;
- `status`, `dry-run-verified` or `dry-run-rejected`;
- optional `reasonCode`, absent on success and required on rejection;
- `observations`, 2–8 exact observations;
- `protectedCallCounts`;
- literal `networkAttemptCount: 0`;
- `securityAssertions`, exactly the ordered assertions below;
- `reportFingerprint`.

The report contains no source-immutability claim or fixture-response mapping result. Those are
independent test evidence outside the conductor.

### Terminal taxonomy and stage prefixes

| Terminal result or scenario condition | Exact observations and final outcome | Exact call counts `(issue, claim, verify, M19, final issue, final verify)` |
| --- | --- | --- |
| `scenario_non_authoritative` | request completed; scenario rejected | `0,0,0,0,0,0` |
| `authorization_issuance_rejected`: issuance port rejects | request/scenario completed; authorization-issued rejected | `1,0,0,0,0,0` |
| `authorization_issuance_rejected`: returned Decision fails verification | request/scenario completed; authorization-issued rejected | `1,0,1,0,0,0` |
| `authorization_claim_rejected`: claim port rejects | through authorization-issued completed; authorization-claimed rejected | `1,1,1,0,0,0` |
| `authorization_claim_rejected`: returned claim fails verification | through authorization-issued completed; authorization-claimed rejected | `1,1,2,0,0,0` |
| `preparation_rejected` | through preparation-started completed; preparation-disabled-bound rejected | `1,1,2,1,0,0` |
| `preparation_non_authoritative` | through preparation-started completed; preparation-disabled-bound rejected | `1,1,2,1,0,0` |
| `final_control_issuance_rejected` | through preparation-disabled-bound completed; final-control rehearsal rejected | `1,1,2,1,1,0` |
| `final_control_non_authoritative` | through preparation-disabled-bound completed; final-control rehearsal rejected | `1,1,2,1,1,1` |
| `final_control_rehearsal_denied` | through preparation-disabled-bound completed; final-control rehearsal rejected | `1,1,2,1,1,1` |
| `dry-run-verified` | all eight stages completed in the table order | `1,1,2,1,1,1` |

The factory-captured scenario descriptor's `expectedOwnerCallCounts` selects the one exact row for
the enacted fault; the report verifier compares against that authoritative scenario value. The
schema rejects any call-count tuple outside the rows above but does not infer which of the two
same-reason M17 rows applies without the catalog.

`invalid_input` and `conflicting_run_identity` are preflight results and never create a report.
`internal_integrity_failure` is an emergency permanent terminal result without a report because a
conductor that cannot construct or self-verify a canonical report must not return one.

### Security assertions

Reports contain exactly this ordered list, each with status `passed`, `failed`, or `not-reached`:

1. `request-canonical`
2. `scenario-authoritative`
3. `authorization-authoritative`
4. `preparation-terminal-bound`
5. `rehearsal-artifact-authoritative`
6. `rehearsal-control-allowed`
7. `rehearsal-non-executing`
8. `public-output-secret-free`
9. `network-attempts-zero`
10. `stage-sequence-exact`

The exact status tuple below follows that order; `P`, `F`, and `N` mean `passed`, `failed`, and
`not-reached`:

| Terminal result | Exact assertion tuple |
| --- | --- |
| `scenario_non_authoritative` | `P,F,N,N,N,N,N,P,P,P` |
| `authorization_issuance_rejected` or `authorization_claim_rejected` | `P,P,F,N,N,N,N,P,P,P` |
| `preparation_rejected` or `preparation_non_authoritative` | `P,P,P,F,N,N,N,P,P,P` |
| `final_control_issuance_rejected` or `final_control_non_authoritative` | `P,P,P,P,F,N,N,P,P,P` |
| `final_control_rehearsal_denied` | `P,P,P,P,P,F,P,P,P,P` |
| `dry-run-verified` | `P,P,P,P,P,P,P,P,P,P` |

`rehearsal-non-executing` proves only that any constructed rehearsal remains unusable as execution
authority; it does not assert that an M20 artifact is structurally non-authoritative. The three
final assertions always pass for a returned report because construction follows the second witness
read. The `no-network-verified` stage is appended only on success.

## `M20DryRunResultV1`

This strict `status`-discriminated union has exactly five variants with unique status literals:

1. `{ status: "preflight-rejected", reasonCode: "invalid_input" | "conflicting_run_identity" }`
2. `{ status: "in-flight", reason: "dry_run_in_progress" }`
3. `{ status: "dry-run-verified", report: M20DryRunReportV1 }`
4. `{ status: "dry-run-rejected", report: M20DryRunReportV1 }`
5. `{ status: "integrity-rejected", reasonCode: "internal_integrity_failure" }`

Only variants 3 and 4 contain reports. The owner permanently stores variants 3–5. Variants 1–2
never mutate the existing owner.

## Independent Verification Result

`M20ArtifactVerificationResultV1` is exactly:

- `{ status: "valid" }`; or
- `{ status: "invalid", reasonCode }`, where `reasonCode` is one of
  `invalid_artifact`, `fingerprint_mismatch`, `scenario_mismatch`, `stage_grammar_mismatch`,
  `call_count_mismatch`, `assertion_mismatch`, `network_count_nonzero`, or
  `terminal_discriminant_mismatch`.

The pure structural verifier accepts the report plus the exact request and factory-captured catalog.
It reconstructs the scenario, stage grammar, counts, assertions, observation fingerprints, and
report fingerprint. It proves structural consistency, not external authority. Coordinated
replacement plus re-fingerprinting of Decision, claim, snapshot, or rehearsal evidence is rejected
earlier by the conductor using its factory-captured M17 and final-control authorities and the exact
returned objects. The captured M19 preparation port is an inherited trust boundary: M20 strictly
parses its public result, exact-compares only the enumerated M20-known coordinates, and exact-copies
opaque fingerprints/version without treating that copy as equality or authority verification. It
does not claim independent proof of M19 private terminal reproduction or rejection of a malicious
captured port. Existing M19 focused
tests own that proof. M20's terminal fault coverage is limited to malformed public results and
mismatches in M20-known `preparationId`, `requestPlanId`, Adapter, operation, and evaluation-time
coordinates. Schema-valid replacement of opaque request-plan, credential-evidence, or
disabled-policy fingerprints/version by a malicious captured port is outside M20's proof. A
nonzero network delta returns report-free `integrity-rejected`; nonzero report data exists only in
adversarial verifier input.
