# FounderOS Knowledge Migration Manifest Specification v1.0

## Purpose

Define the manifest used to control and audit KnowledgeOS migrations.

## Manifest Fields

Each entry should contain:

-   Object ID
-   Object type
-   Source path
-   Destination path
-   Source hash
-   Review status

## Example

``` yaml
documents:
  - id: founderos-constitution
    type: principle
    source: docs/governance/FounderOS_Constitution_v1.0.md
    status: approved
```

## Validation Rules

Migration fails when:

-   Source file is missing
-   IDs conflict
-   Hash validation fails
-   Metadata is invalid

## Principle

The migration manifest is the audit contract between human knowledge and
machine processing.
