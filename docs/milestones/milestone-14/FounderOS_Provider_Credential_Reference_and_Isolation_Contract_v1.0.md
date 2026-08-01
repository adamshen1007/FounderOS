# FounderOS Provider Credential Reference and Isolation Contract v1.0

## Purpose

Define how future provider credentials are referenced and isolated without entering governed artifacts.

## Credential Reference

A Credential Reference may contain:

- Contract version
- Credential reference ID
- Provider family reference
- Secret-store class
- Scope reference
- Environment class
- Rotation version
- Availability status
- Reference fingerprint

It must not contain secret material.

## Isolation Rules

- Credentials never appear in Invocation Requests, Envelopes, Results, Receipts, logs, traces, metrics, or errors.
- Credential resolution occurs only inside a future infrastructure adapter.
- Resolved secret bytes are never returned to domain or application layers.
- Credential access must be purpose bound and short lived.
- Credential references are safe to fingerprint; secret values are not.
- Milestone 14 uses fake or unavailable references only.

## Verification

Reject raw API keys, bearer tokens, secret-like values, credential-bearing URLs, environment dumps, and serialized secret objects.

## Principle

Governed artifacts may prove which credential reference was intended without ever containing the credential.
