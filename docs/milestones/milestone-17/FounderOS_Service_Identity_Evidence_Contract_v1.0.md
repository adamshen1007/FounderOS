# FounderOS Milestone 17 Service Identity Evidence Contract v1.0

## Status and purpose

Implemented as a non-production, provider-neutral contract. This contract carries evidence from an
external identity-verification authority into the process-local Milestone 17 evaluator. FounderOS
does not authenticate a workload or integrate an identity provider in this milestone.

## Contract

`VerifiedServiceIdentityEvidenceSchema` binds:

- schema and evidence identity;
- authenticated subject and workload references;
- issuer, assurance profile, environment, and audience;
- issue, not-before, and expiry times;
- active or revoked state plus a monotonic revocation version;
- a logical issuer-proof reference;
- a domain-separated canonical evidence fingerprint.

An active artifact requires revocation version zero. A revoked artifact requires a positive
version. The not-before time cannot precede issuance, and expiry must follow not-before.

## Verification boundary

`createVerifiedServiceIdentityEvidence` constructs deterministic fixtures or externally verified
representations. `verifyVerifiedServiceIdentityEvidence` independently reproduces the fingerprint
and rejects tampering. The in-memory authority then compares the evidence ID, workload reference,
issuer-proof reference, issuer, assurance, audience, subject, environment, activity, and freshness
against its captured configuration and exact Authorization Request.

The proof reference is a safe logical reference only. It is not a token, certificate, signing key,
session, secret, path, or URL. No credential or personal contact data may appear in this artifact.

## Failure behavior

Invalid canonical structure or fingerprints are rejected as non-authoritative artifacts. Validly
formed but expired, inactive, revoked, or mismatched evidence produces a fail-closed denied
Decision with closed sanitized reasons. Raw identity-provider responses and exceptions never cross
the public boundary.
