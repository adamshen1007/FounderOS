# FounderOS Active Snapshot Context Binding Specification v1.0

## Purpose

Define how every context package binds to a durable, verified active Knowledge Snapshot.

## Required Workflow

```text
Open Durable Registry
        |
        v
Verify Registry Integrity
        |
        v
Recover Active Snapshot
        |
        v
Resolve Matching Repository Snapshot
        |
        v
Assemble Context
```

## Required Evidence

- Registry schema version
- Registry integrity fingerprint
- Active snapshot ID
- Active snapshot content fingerprint
- Active manifest fingerprint
- Repository snapshot identity and fingerprint
- Recovery or verification operation evidence

## Failure Rules

Assembly must fail before query execution when registry recovery fails, integrity verification fails, no required active snapshot exists, repository snapshot identity differs, content or manifest fingerprints differ, or evidence is incomplete or forged.

## Stability Rule

The resolved active snapshot binding remains fixed throughout the assembly operation. A later concurrent activation must not alter an in-progress context package.

## Principle

Future AI reasoning must be attributable to the exact governed knowledge state it received.
