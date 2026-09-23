# FounderOS Milestone 20 End-to-End Dry-Run and Fault-Injection Specification v1.0

## Status

**Implementation specification candidate. Inactive until independent documentation review and
separate human acceptance.**

## Objective

Implement the smallest complete no-network closure that composes the accepted M17, M18, and M19
boundaries, produces independently verifiable deterministic reports, and proves fixed failure
behavior under controlled faults without creating any live provider capability.

## Required Boundaries

- `@founderos/knowledge-schema` owns strict serializable M20 contracts and taxonomies.
- `@founderos/knowledge-engine` owns the structural-port conductor and report authority.
- Existing infrastructure and integration packages retain their accepted M18 and M19 ownership.
- `tests/` owns concrete composition and the closed scenario catalog.
- No application, CLI, daemon, deployment, provider configuration, or network transport is added.

Dependencies remain directed to shared schema contracts. Knowledge Engine must not import the
concrete credential resolver or OpenAI Responses adapter. Neither existing concrete package may
import Knowledge Engine.

## Required Contracts

The M20 schema module must define and export exact versioned contracts for:

1. `M20DryRunRequestV1`
2. `M20ScenarioDescriptorV1`
3. `M20FaultDeclarationV1`
4. `M20StageObservationV1`
5. `M20FinalControlRehearsalEvidenceV1`
6. `M20DryRunResultV1`
7. `M20DryRunReportV1`
8. `M20ArtifactVerificationResultV1`
9. `M20ScenarioCatalogV1`
10. `M20FinalControlProfileV1`
11. `M20FinalControlSnapshotV1`

Every persisted or fingerprinted artifact is strict canonical plain data with exact own enumerable
data properties, closed enums, explicit bounds, domain-separated fingerprints, and no
`undefined`, non-finite number, accessor, symbol, inherited member, custom prototype, function,
class instance, mutable collection, or unknown key. Exact keys, bounds, discriminants, domains, and
report grammar are normative in the
[M20 Dry-Run Contract Catalog](./FounderOS_M20_Dry_Run_Contract_Catalog_v1.0.md).

## Required Run Identity

One run request owns only the exact scenario and catalog references, run ID, two explicit times,
M17 issuance inputs and expected Decision/claim IDs, M19 preparation/request-plan IDs, exact M18
Credential Resolution Request, final-control snapshot/evidence IDs, and its request fingerprint.
The factory-captured catalog owns expected outcomes and fault data. The factory-captured M17
authority, inherited-trust M19 preparation dependency, and test-only final-control authority own or
generate Decision, claim, readiness, policy, Adapter, model, instruction, cache, Credential
Reference release, M19 terminal, snapshot, and rehearsal artifacts.
The caller cannot supply those generated or authority-owned artifacts.

Run IDs are permanently reserved inside one conductor instance. When the two replay witness reads
observe zero delta, exact replay returns the original terminal result: report-bearing
`dry-run-verified`/`dry-run-rejected` or report-free `integrity-rejected`. A positive-delta replay
returns transient `integrity-rejected` without mutating that permanent owner. Conflicting reuse
fails before mutable or protected authority access. Only the owner may replace `in-flight` with one
of those three permanent terminal results.

## Mandatory Gate Order

1. Read the captured monotonic network-attempt witness, then capture the complete public wrapper
   without invoking accessors or inherited behavior.
2. Validate the exact M20 request and apply conflict precedence.
3. Install the owner reservation before the first `await`.
4. Invoke the factory-captured M17 scenario authority to issue a Decision.
5. Independently verify the exact returned registered M17 Decision through the captured M17
   authority; stop before claim when verification fails.
6. Claim the verified Decision for the exact attempt.
7. Independently verify the exact returned registered claim through the captured M17 authority.
8. Invoke the factory-captured M19 preparation port exactly once.
9. Strictly validate the returned M19 `disabled-by-policy` result; compare only the M20-known
   preparation ID, request-plan ID, Adapter, operation, and evaluation-time coordinates; and carry
   its schema-valid opaque request-plan, credential-evidence, and disabled-policy
   fingerprints/version without claiming independent verification. Treat the captured M19 port as
   an inherited trust boundary; do not claim access to its private plan/internal release evidence
   or detection of a malicious captured port.
10. Invoke the factory-captured final-control snapshot issuer once, verify the exact returned
   snapshot once when issuance succeeds, and construct and verify rehearsal evidence purely from
   that authoritative snapshot.
11. Read the same witness before return and verify an observed zero delta together with expected
   rehearsal outcome, stage sequence, and call counts; a positive delta returns report-free
   integrity rejection.
12. Construct and independently verify one canonical report.

A reported rejection records the exact completed prefix followed by one rejected observation from
the contract-catalog grammar. Every later port must have call count zero. Preflight and emergency
integrity rejection contain no observations or report.

## Success Semantics

Success requires:

- exact M17 Decision issuance and permanent exact-attempt claim;
- exact M19 preparation, including its existing M18 resolution path;
- a strictly parsed, M20-known-coordinate-bound, inherited-trust M19 terminal status
  `disabled-by-policy`;
- a verified final-control rehearsal result `would-allow`;
- the exact eight-stage success sequence;
- zero attempted network calls;
- zero exposed credential/header/material value; and
- a self-verifying deterministic report.

The only successful M20 result is `dry-run-verified`. It is non-authoritative outside M20 testing.

## Failure Semantics

Preflight rejection occurs before a report and uses exactly `invalid_input` or
`conflicting_run_identity`. Reported terminal rejection uses taxonomy ID
`M20-dry-run-taxonomy-v1` and exactly one first-applicable code:

| Precedence | Condition | Reason code |
| ---: | --- | --- |
| 1 | scenario is absent, substituted, or not catalog-authoritative | `scenario_non_authoritative` |
| 2 | M17 issuance rejects or returns no authoritative Decision | `authorization_issuance_rejected` |
| 3 | M17 claim rejects or returns no authoritative claim | `authorization_claim_rejected` |
| 4 | M19 preparation returns its governed rejection | `preparation_rejected` |
| 5 | returned M19 terminal result is invalid or an M20-known preparation ID, request-plan ID, Adapter, operation, or evaluation-time coordinate mismatches | `preparation_non_authoritative` |
| 6 | final-control snapshot issuance rejects | `final_control_issuance_rejected` |
| 7 | final-control snapshot/evidence is non-authoritative | `final_control_non_authoritative` |
| 8 | authoritative final-control rehearsal denies | `final_control_rehearsal_denied` |

An otherwise unclassified caught implementation fault returns report-free permanent status
`integrity-rejected` with reason `internal_integrity_failure`. Stage, count, assertion,
network-count, and report tampering are
independent verifier failures, not conductor-produced reports.

No arrays of reasons, generic fallback, raw exception, stack, path, endpoint, header, credential,
provider body, or fault payload may appear in a result.

## Fault-Injection Requirements

The repository-owned runtime catalog must cover at least these named categories:

1. denied, expired, revoked, mismatched, or already-claimed M17 authority;
2. non-authoritative or stale M14/M15 readiness;
3. model, instruction, cache, privacy, retention, admission, Circuit, Health, incident, or kill-switch
   rejection in M19;
4. unavailable, rotated, revoked, deadline-expired, materialization-faulted, or release-faulted M18
   resolution;
5. malformed M19 public terminal data or mismatch of M20-known preparation, request-plan ID,
   Adapter, operation, or evaluation-time coordinates;
6. final-control rehearsal denial for every M16 final-gate control family;
7. multi-fault precedence at each adjacent taxonomy boundary;
8. exact concurrency and exact replay.

A separate preflight-negative matrix covers malformed or hidden-capability input, missing or
substituted scenario references, and conflicting run identities because no authoritative scenario
may authorize its own non-authoritative selection. A separate report-verifier mutation table covers
report, observation, fingerprint, order, count, and network-count tampering.

Schema-valid replacement of opaque M19 request-plan, credential-evidence, or disabled-policy
fingerprints/version by a malicious captured port is explicitly outside M20's proof because those
authoritative private inputs are not public M19 output. Existing M19 focused verification retains
that responsibility.

The catalog declares data only. Production code receives no arbitrary fault callback or executable
hook. Test-owned structural ports enact cataloged faults.

## Source Preservation

The conductor treats all M12–M19 source artifacts as immutable inputs. Independent tests must
fingerprint and deep-snapshot the exact supplied artifacts before a run, then prove byte and
semantic equality after success, rejection, fault, concurrency, and replay. That evidence remains
outside the conductor and report because the conductor owns no source or filesystem port. No source
document, ledger, registry, manifest, credential reference, or prior milestone evidence may be
modified to create M20 proof.

## Isolated Fixture-Regression Matrix

Existing M19 fixture-response mapping success and every closed response failure category remain a
separate test-only regression matrix. The matrix is not part of the M20 scenario catalog, conductor,
result, or report and cannot be attached to a run as provider-response evidence.

## Report Requirements

Every report-bearing terminal run returns one `M20DryRunReportV1`. An emergency
`integrity-rejected` terminal returns no report and remains permanently replayable. The report
contract is defined separately. The same canonical request, catalog, configured authorities, and
explicit time must produce identical canonical report bytes and fingerprint across fresh
process-local conductors. Operational duration, host, path, process ID, random value, ambient time,
stack, and machine metadata are prohibited.

## Structural Security

TypeScript-aware transitive production closure must cover every new production module and reject
transport, provider SDK, credential-material, environment, filesystem, process, dynamic-loader,
reflection, worker, Agent, Hermes, and MCP capability acquisition. Adversarial syntax witnesses and
runtime ambient-global traps are mandatory.

## Explicit Non-Goals

No real credential, secret store, authentication header, successful live final pre-send gate,
network transport, provider SDK, provider request, production model, deployment, release, external
observability, durable/distributed M20 state, Agent, Hermes, MCP, UI, or Milestone 21 behavior is
implemented or authorized.

## Completion Boundary

Implementation may begin only after the exact documentation candidate receives independent review
with no unresolved finding and a separate explicit human acceptance. Implementation completion
later requires focused red-green evidence, exact traceability, all repository gates, security
closure, and another independent exact-candidate review. Commit, publication, merge, deployment,
release, and live execution each remain separate authorization boundaries.
