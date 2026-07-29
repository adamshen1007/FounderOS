# FounderOS Context Provenance, Exclusion, and Omission Evidence Specification v1.0

## Purpose

Define evidence explaining how a context package was assembled.

## Included Evidence

For every included object, preserve:

- Object ID and type
- Snapshot ID
- Logical source identifier
- Source hash
- Provenance metadata
- Original object fingerprint
- Selection reason and position
- Included-content fingerprint

## Exclusion Evidence

Candidates excluded by request filters record object ID, exclusion category, applicable filter, and stable reason code.

## Omission Evidence

Candidates omitted after matching record object ID, omission category, policy rule, ordering position, and budget evidence when applicable.

## Invalid Candidates

Invalid candidates must never be silently ignored. Assembly should fail closed unless an approved governed rejection contract explicitly applies.

## Privacy and Path Safety

Public evidence must use logical identifiers and stable error paths. Machine-specific physical paths, usernames, and checkout roots must not be exposed.

## Principle

A trustworthy context package explains both what it contains and what it leaves out.
