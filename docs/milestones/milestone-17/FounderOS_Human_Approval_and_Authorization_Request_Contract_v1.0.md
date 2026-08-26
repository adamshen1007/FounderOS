# FounderOS Milestone 17 Human Approval and Authorization Request Contract v1.0

## Status and purpose

Implemented as strict storage-independent contracts for the process-local, non-production
Authorization Decision foundation.

## Authorization Request

`ExecutionAuthorizationRequestSchema` binds one exact `founder-decision-memo` execution attempt to:

- subject and Consumer identity;
- Delivery transaction, Context Package, Invocation Request, and Execution Attempt identities and
  fingerprints;
- Adapter and provider-family identity;
- explicit fixed processing tier `default`, corresponding to provider `service_tier = default`;
- model policy and execution-instruction profile;
- logical Credential Reference identity, fingerprint, and rotation version;
- environment, data classification, and purpose;
- exact byte, token, timeout, attempt, rate, concurrency, and cost ceilings;
- explicit request time and a domain-separated request fingerprint.

The Credential Reference is identity metadata only. It contains no credential value and grants no
secret-store access.

## Human approval evidence

`HumanExecutionApprovalEvidenceSchema` binds a human approval authority and approver reference to
the exact Request ID and fingerprint, purpose, operation, environment, maximum classification,
approved ceilings, validity interval, outcome, proof reference, and fingerprint.

Outcomes are closed to `allowed`, `denied`, and `review-required`. Each outcome requires exactly
its matching reason. Approval expiry must follow issuance. A valid approval artifact can still be
denied by the authority when any exact binding or ceiling does not match.

## Data safety

Both contracts reject unknown, symbolic, inherited, accessor-backed, non-enumerable, non-plain,
non-finite, unsafe, or non-canonical data. Identifiers, purpose, and references exclude paths, URLs,
headers, secret material, and unrestricted diagnostics. Constructors produce deeply immutable
artifacts; verifiers return closed sanitized results.

## Non-goals

Milestone 17 does not collect a signature, login, email address, session, legal acceptance, or
provider credential. External systems remain responsible for verifying identity and approval
before supplying their evidence.
