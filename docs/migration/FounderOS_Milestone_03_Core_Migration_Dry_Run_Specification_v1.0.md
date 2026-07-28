# FounderOS Milestone 03 Core Migration Dry Run Specification v1.0

## Objective

Prove that a founder-selected directory of Markdown files can be processed as a deterministic, read-only migration batch and produce validated KnowledgeOS objects or actionable file-level rejection reports.

## Scope

### Canonical templates

FounderOS provides one valid Markdown/frontmatter template for each canonical object type: knowledge, principle, decision, project, research, experiment, and relationship. Templates use the Milestone 02 snake-case input convention and validate through `@founderos/knowledge-schema` without special cases.

### Directory input

- The caller supplies one explicit directory.
- Discovery is recursive, includes regular `.md` files only, and uses stable path ordering.
- Symbolic links are never followed.
- Every reported source path is relative to the supplied directory and uses `/` separators.
- An unreadable path, symbolic-link root, or non-directory root returns a structured directory error.

### Batch validation

Every discovered file passes through the existing single-file parser, normalizer, and schema validator. One invalid file does not prevent other files from being processed.

After file validation, the batch detects duplicate canonical object IDs and duplicate SHA-256 source hashes. Every member of a duplicate set is rejected for migration and reported with the full, sorted set of conflicting paths. Accepted objects therefore have unique identity and source content within the batch.

### Migration report

The report contains:

- report schema version and normalized root path
- overall accepted or rejected status
- file reports in stable relative-path order
- accepted, rejected, and total counts
- accepted object counts by object type
- duplicate object-ID and source-hash findings
- stable error codes and canonical field paths where available

Serialization uses two-space JSON indentation and one trailing newline. It contains no timestamp, random identifier, or machine-generated path, so repeated runs against the same directory are byte-for-byte identical.

### FounderOS Core pilot

Acceptance fixtures are derived from the FounderOS Constitution, Design Principles, Decision Framework, System Architecture, and Repository Architecture documents. Canonical specifications remain unchanged; the pilot uses frontmatter-enabled fixture copies and verifies their bytes before and after ingestion.

## Acceptance tests

1. All seven canonical templates ingest as their declared object types.
2. Recursive discovery includes Markdown files only and returns stable relative paths.
3. Invalid files produce file-level reports without stopping valid files.
4. Duplicate IDs reject every conflicting file and list sorted paths.
5. Duplicate source hashes reject every conflicting file and list sorted paths.
6. Accepted objects have unique IDs and source hashes.
7. Symbolic links are not followed and no content outside the supplied directory is read.
8. Repeated runs and JSON serialization are deterministic.
9. FounderOS Core pilot fixtures are accepted and remain byte-for-byte unchanged.
10. An inaccessible, symbolic-link, or non-directory root returns a structured rejection report.

## Non-goals

- Database, object-store, or knowledge-graph persistence
- Embeddings, vector indexes, retrieval, or ranking
- Filesystem watching, background scheduling, or automatic vault mutation
- Semantic extraction or AI-authored frontmatter
- Hermes, agents, MCP integrations, or UI

## Verification

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
```
