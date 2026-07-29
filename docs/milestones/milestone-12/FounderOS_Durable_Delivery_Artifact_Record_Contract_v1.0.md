# FounderOS Durable Delivery Artifact Record Contract v1.0

## Purpose

Define durable record envelopes for Milestone 11 Delivery artifacts.

## Supported Artifact Types

- Delivery Request
- Governed Delivery Envelope
- Consumer Acknowledgment
- Delivery Receipt
- Consumption Evidence placeholder
- Replay Attempt Evidence

## Durable Record Envelope

Each durable artifact record should include:

- Record schema version
- Artifact type
- Artifact ID
- Artifact contract version
- Canonical artifact payload
- Canonical artifact fingerprint
- Ledger sequence
- Transaction ID
- Previous audit fingerprint
- Committed-at evidence
- Canonical record fingerprint

## Validation Requirements

The record must:

- Strictly validate the embedded artifact
- Recompute and verify the artifact fingerprint
- Verify all referenced artifact IDs and fingerprints
- Reject unknown fields
- Reject accessor-backed or noncanonical raw input
- Preserve exact canonical Milestone 11 bytes
- Exclude physical paths and credentials

## Immutability

Committed artifact records must never be replaced, edited, or deleted by public APIs.

## Principle

Durable wrappers preserve the exact governed artifact rather than creating a looser persistence representation.
