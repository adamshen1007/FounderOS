# FounderOS Milestone 17 Authorization Decision Claim Revocation and Verification Contract v1.0

## Status

Implemented for one process-local, non-production authority instance.

## Decision

`ExecutionAuthorizationDecisionSchema` embeds the complete Authorization Request and binds exact
Service Identity and human approval evidence fingerprints, authority, issue and expiry times,
outcome, state, reason codes, revocation version, issuer-proof reference, and Decision fingerprint.

Only an allowed Decision may be `allowed-unclaimed`. Denied and review-required Decisions are
`not-claimable`. Every Decision carries exactly one `execution_authorization_*` outcome marker,
and that marker must match its declared outcome. An allowed Decision has only the allowed marker.
Other outcomes carry their matching outcome marker plus sorted binding or policy reasons; foreign
or multiple outcome markers reject.

## Claim

`ExecutionAuthorizationClaimSchema` binds the exact Decision and Execution Attempt, permanent
state `claimed-by-exact-attempt`, claim time, authority-owned sequence, authority reference, and
claim fingerprint.

One private registry transition creates the claim. The first valid caller wins. Another attempt
fails. A same-attempt retry returns the original claim only with explicit idempotent intent and
exact matching ID, attempt, fingerprint, and timestamp. Downstream cancellation, timeout,
credential failure, final-gate failure, transport failure, or ambiguous execution cannot release
the claim. Reusing a permanently reserved claim ID with altered coordinates is an identity
conflict with fixed precedence over mutable authorization state.

The authority calculates a tentative next sequence, constructs and freezes the claim and success
result, and only then atomically publishes the sequence, claim, and permanent claim identity. An
internally rejected claim leaves all three authority-state coordinates unchanged.

## Revocation

Revocation requires the exact authority reference captured by the factory and a positive version
strictly greater than the current version. A stale or equal version fails closed. Revocation is
authority state; it does not rewrite the immutable Decision and cannot reopen or erase a claim. A
higher version cannot carry a timestamp earlier than the previous revocation, and revocation after
claim cannot be backdated before `claimedAt`.

## Inspection and verification

Inspection returns the immutable Decision, optional permanent claim, current revocation version,
and revoked flag. Unexpected internal faults return only the closed
`internal_authority_integrity_failure` inspection variant. Inspection exposes no map, mutation
method, raw error, or path.

Decision verification requires a canonical valid artifact, exact registration in the same
authority, a supplied evaluation time before expiry, and no current revocation. Claim verification
also requires the exact registered permanent claim and an evaluation time at or after its
`claimedAt`. A structurally valid artifact from another authority instance is non-authoritative.

## Results and privacy

Issuance, claim, inspection, revocation, and verification results are strict closed unions. Failure
reasons include invalid input, non-authoritative artifact, conflict, expiry, revocation, attempt
mismatch, non-claimable state, already claimed, stale revocation, not found, and normalized internal
integrity failure. Results contain no raw exception, path, URL, endpoint, header, provider body,
environment value, or credential material.

Every public authority operation catches unexpected internal faults at its operation boundary and
normalizes them to its schema-valid `internal_authority_integrity_failure` variant. Verification
uses the matching invalid reason, and inspection uses its matching rejected reason. Denied and
review-required Decisions require at least one sorted binding or policy reason in addition to their
single matching outcome marker.
