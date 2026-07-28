import type { KnowledgeQueryResult, KnowledgeRepository } from "@founderos/knowledge-schema";

import { queryKnowledgeObjects } from "./query-knowledge.js";

export async function queryKnowledgeRepository(
  queryInput: unknown,
  repository: KnowledgeRepository,
): Promise<KnowledgeQueryResult> {
  const candidates = await repository.getCandidates();
  return queryKnowledgeObjects(queryInput, candidates);
}
