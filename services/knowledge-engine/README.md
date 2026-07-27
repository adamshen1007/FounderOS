# Knowledge engine

The Milestone 02 foundation reads one Markdown file, parses YAML frontmatter, normalizes specification-style keys, validates the result through `@founderos/knowledge-schema`, and returns a file-level ingestion report.

The implementation is deliberately read-only. It does not crawl a vault or implement persistence, embeddings, retrieval, graph storage, Hermes, agents, or MCP integrations.
