# FounderOS Milestone 04 Acceptance Criteria v1.0

## Purpose

Define the completion criteria for FounderOS Milestone 04 --- Core Vault
Materialization.

## Functional Acceptance Criteria

The milestone is complete when:

-   [ ] Migration manifest format is implemented.
-   [ ] Manifest validation is implemented.
-   [ ] FounderOS Priority 1 knowledge corpus can be migrated.
-   [ ] Migration workflow produces deterministic reports.
-   [ ] Migration execution does not modify source documents.

## Migration Criteria

The migration system must verify:

-   [ ] Every document has a unique knowledge object ID.
-   [ ] Every source document exists.
-   [ ] Every document type is supported.
-   [ ] Source hashes can be verified.
-   [ ] Provenance information is preserved.

## Error Handling Criteria

The system must fail clearly when:

-   [ ] Duplicate object IDs are detected.
-   [ ] Source documents are missing.
-   [ ] Metadata validation fails.
-   [ ] Manifest entries are invalid.
-   [ ] Source content has changed unexpectedly.

## Engineering Acceptance Criteria

Required:

-   [ ] TypeScript implementation follows existing conventions.
-   [ ] Existing package boundaries are preserved.
-   [ ] Tests are added for new behavior.
-   [ ] Documentation is updated where necessary.

## Verification Requirements

The following commands must pass:

``` bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

## Definition of Done

Milestone 04 is complete when the KnowledgeOS migration process is:

-   Repeatable
-   Auditable
-   Deterministic
-   Safe for future corpus expansion

## Principle

A knowledge foundation must be trustworthy before it becomes
intelligent.
