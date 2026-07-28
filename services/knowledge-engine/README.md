# Knowledge engine

The Milestone 02 and 03 foundations read one Markdown file or one explicitly selected directory, parse YAML frontmatter, normalize specification-style keys, validate through `@founderos/knowledge-schema`, and return deterministic file-level and aggregate migration reports.

Milestone 04 adds manifest-controlled corpus execution. It loads a strict YAML manifest, confines every read to one physical root, rejects symbolic links and unsafe paths, verifies canonical SHA-256 digests, enforces ready/approved lifecycle gates, creates schema-valid objects from canonical document content, and writes a deterministic report artifact.

Milestone 05 adds a pure, storage-free query boundary over an explicitly supplied set of validated Knowledge Objects. It validates the query and every candidate, rejects duplicate object IDs, applies exact filters and context constraints by intersection, and sorts results by object ID. Multi-value filters match any allowed value; tag filters explicitly support `all` or `any`. Project filters match an object's domain, a project object's ID or name, or a decision object's `relatedProjectIds`. Every result includes the object's unchanged source metadata as provenance.

Milestone 06 makes repository-backed querying the primary access flow. Candidate sources emit versioned batches; the in-memory repository revalidates them, rejects duplicate source or object identities, builds a deterministic snapshot, and returns independent validated copies. It provides identity lookup and candidate discovery without persistence or search intelligence. The Milestone 05 candidate-array function remains available as the compatibility filtering core.

```typescript
import { queryKnowledgeObjects } from "@founderos/knowledge-engine";

const result = queryKnowledgeObjects(query, candidateObjects);
```

```typescript
import {
  InMemoryKnowledgeCandidateSource,
  InMemoryKnowledgeRepository,
  queryKnowledgeRepository,
} from "@founderos/knowledge-engine";

const source = new InMemoryKnowledgeCandidateSource(sourceDescriptor, candidateObjects);
const repository = await InMemoryKnowledgeRepository.create([source]);
const result = await queryKnowledgeRepository(query, repository);
```

From the repository root:

```bash
pnpm knowledge:migrate
```

Directory ingestion is recursive, Markdown-only, stable in path order, and does not follow symbolic links. Repository access is an immutable in-memory snapshot, not durable storage. Querying remains deterministic exact filtering—not full-text search, semantic retrieval, ranking, or authorization. The implementation remains read-only and does not watch a vault or implement persistence, embeddings, graph storage, Hermes, agents, or MCP integrations.
