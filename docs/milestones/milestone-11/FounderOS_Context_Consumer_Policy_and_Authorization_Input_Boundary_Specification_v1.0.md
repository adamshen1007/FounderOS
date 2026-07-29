# FounderOS Context Consumer Policy and Authorization Input Boundary Specification v1.0

## Purpose

Define the evidence boundary through which a future authorization system may approve or deny Context Package delivery.

## Boundary Role

Milestone 11 records policy inputs and policy decision evidence but does not implement authentication or authorization.

## Policy Input

A policy input may include:

- Subject reference
- Consumer reference
- Context Package reference
- Active Snapshot reference
- Intended purpose
- Project or domain scope
- Data classification
- Requested operation
- Required approval or governance references
- Request timestamp evidence

## Policy Decision Evidence

A policy decision evidence record may include:

- Decision ID
- Decision version
- Input fingerprint
- Decision outcome
- Decision authority reference
- Reason codes
- Decision timestamp evidence
- Expiration evidence
- Canonical decision fingerprint

## Allowed Outcomes

- Allowed
- Denied
- Review required
- Not evaluated

`Not evaluated` must never be interpreted as `Allowed`.

## Enforcement Rule

The governed delivery service must require the policy outcome defined by the approved delivery policy. Milestone 11 may use deterministic test fixtures or caller-supplied verified decision evidence; it must not invent authorization.

## Principle

Policy evidence may cross the boundary, but authorization authority remains external and explicit.
