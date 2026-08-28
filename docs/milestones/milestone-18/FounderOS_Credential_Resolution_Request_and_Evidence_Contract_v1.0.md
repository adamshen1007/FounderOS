# FounderOS Credential Resolution Request and Evidence Contract v1.0

## Request

`CredentialResolutionRequest` binds schema version, resolution ID, M17 Decision and claim IDs and
fingerprints, exact Attempt coordinates, subject, Consumer, Delivery, Context, Invocation,
provider, Adapter, environment, operation, Credential Reference and rotation, the canonical
`purpose/<authorized operation>` reference, `evaluatedAt`, and a deadline no later than the M17
Decision expiry. It is strict canonical plain data and cannot represent a secret,
endpoint, header, callback, client, path, or provider body.

`CredentialResolutionCommand` is the immutable subset sent through the structural resolver port
only after registered M17 verification and coordinate comparison succeed. It carries no authority
object or caller-controlled capability.

## Evidence

Successful `CredentialResolutionEvidence` binds the exact request, Decision, claim, Attempt,
Credential Reference and rotation, provider, Adapter, environment, operation, resolver identity,
evaluation time, deadline, source class `deterministic-synthetic`, release status `released`, and a
domain-separated SHA-256 fingerprint.

It cannot represent material length, bytes, characters, prefix, suffix, material-derived digest,
secret-store location, environment name, authorization header, endpoint, or request payload.

## Result and Replay

Success is `{ status: "resolved", evidence }`. Failure is `{ status: "rejected", reasonCodes }`
using a sorted unique closed inventory. Exact replay returns the original frozen result. A reused
resolution ID with different canonical request content returns `conflicting_identity` before
authority or resolver access.

Independent verification recomputes the evidence fingerprint and validates all request/evidence
bindings. It returns only `{ status: "valid" }` or a closed sanitized invalid result.
