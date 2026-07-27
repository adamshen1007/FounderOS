# FounderOS Milestone 02 Vault Ingestion Foundation Specification v1.0

## Objective

Convert one founder-owned Markdown file into a validated `@founderos/knowledge-schema` object or a structured, actionable rejection report without modifying the source file.

## Scope

### Markdown and frontmatter input

- UTF-8 Markdown files with YAML 1.2 frontmatter enclosed by opening and closing `---` delimiter lines.
- The Markdown body remains the content of a general knowledge object.
- Object-specific data for decisions, projects, research, principles, experiments, and relationships is supplied in frontmatter.
- Each file is processed independently and produces one report.

### Canonical mapping

Frontmatter keys are normalized recursively from `snake_case` to `camelCase`. The ingestion boundary maps:

| Frontmatter | Canonical schema |
| --- | --- |
| `type` or `object_type` | `metadata.objectType` |
| `created` or `created_at` | `metadata.createdAt` |
| `updated` or `updated_at` | `metadata.updatedAt` |
| `source_type`, `source_reference`, `author`, `original_creator` | `metadata.source` |
| Identity, classification, quality, lifecycle, tags, relationships | `metadata` |
| Remaining normalized keys | Object-specific fields |
| Markdown body for `type: knowledge` | `content` |

Project files use `project_status` for the project lifecycle because `status` represents the knowledge lifecycle. Relationship files use `relationship_type` because `type` identifies the knowledge object category.

### Validation errors

Rejections use stable error codes:

- `file_read_error`
- `missing_frontmatter`
- `frontmatter_parse_error`
- `frontmatter_shape_error`
- `frontmatter_normalization_error`
- `knowledge_validation_error`

Each error contains a human-readable message and, when available, a canonical field path.

### Source preservation

- Ingestion is read-only and never rewrites the Markdown file.
- Every report records the source path, UTF-8 byte length, and SHA-256 digest.
- If source metadata is absent, ingestion creates a traceable `markdown` source referencing the file path.
- Official FounderOS specifications remain byte-for-byte unchanged. Tests use separate fixture copies with ingestion frontmatter.

## Acceptance tests

1. Parse valid YAML frontmatter and preserve the Markdown body.
2. Support LF and CRLF delimiter lines.
3. Normalize nested snake-case keys without silently overwriting collisions.
4. Reject missing, malformed, scalar, or unsafe frontmatter.
5. Map real FounderOS-derived knowledge and decision fixtures into valid schema objects.
6. Return canonical field-level errors for invalid metadata.
7. Return a file-level read error for an inaccessible path.
8. Prove that file ingestion does not modify source bytes.
9. Produce deterministic SHA-256 source evidence.

## Non-goals

- Databases or object storage
- Embeddings or vector indexes
- Retrieval or ranking
- Knowledge graph persistence or traversal
- Vault-wide crawling, watching, or scheduling
- Hermes, agent runtime, or MCP integration

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
