# Knowledge engine

The Milestone 02 and 03 foundations read one Markdown file or one explicitly selected directory, parse YAML frontmatter, normalize specification-style keys, validate through `@founderos/knowledge-schema`, and return deterministic file-level and aggregate migration reports.

Directory ingestion is recursive, Markdown-only, stable in path order, and does not follow symbolic links. The implementation remains read-only and does not watch a vault or implement persistence, embeddings, retrieval, graph storage, Hermes, agents, or MCP integrations.
