# FounderOS Activation Audit Record Contract v1.0

## Purpose

Define the durable evidence generated when an approved snapshot becomes the active KnowledgeOS state.

## Activation Audit Record

The record should include:

- Record schema version
- Activation ID
- Transaction ID
- Candidate snapshot ID
- Previous active snapshot ID, if any
- Expected active snapshot ID used as a concurrency precondition
- Approval decision ID
- Change-set ID
- Activation actor
- Activation reason
- Activation timestamp
- Candidate snapshot fingerprint
- Previous snapshot fingerprint, if any
- Resulting active snapshot ID
- Resulting lifecycle transitions
- Previous audit record fingerprint
- Canonical record fingerprint

## Required Preconditions

Activation must fail unless:

- The candidate snapshot is registered.
- The candidate is approved.
- The referenced approval decision is valid.
- The referenced change set matches the candidate and baseline snapshots.
- The expected active snapshot matches recovered active state.
- The candidate is not already superseded or archived.
- All evidence fingerprints verify.

## Audit Guarantees

The record must prove:

- Which snapshot became active
- Which snapshot was superseded
- Who approved and activated it
- Why activation occurred
- Which exact content fingerprints were involved
- Whether concurrency preconditions were satisfied

## Principle

Activation is a governed transaction with durable evidence, not a simple pointer update.
