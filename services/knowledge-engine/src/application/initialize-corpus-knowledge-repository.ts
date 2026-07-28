import type { KnowledgeRepositorySnapshot } from "@founderos/knowledge-schema";

import {
  KnowledgeCorpusCandidateSource,
  type CreateKnowledgeCorpusCandidateSourceOptions,
} from "../infrastructure/knowledge-corpus-candidate-source.js";
import { InMemoryKnowledgeRepository } from "../infrastructure/in-memory-knowledge-repository.js";

export interface InitializedCorpusKnowledgeRepository {
  candidateSource: KnowledgeCorpusCandidateSource;
  repository: InMemoryKnowledgeRepository;
  snapshot: KnowledgeRepositorySnapshot;
}

export async function initializeCorpusKnowledgeRepository(
  options: CreateKnowledgeCorpusCandidateSourceOptions,
): Promise<InitializedCorpusKnowledgeRepository> {
  const candidateSource = await KnowledgeCorpusCandidateSource.create(options);
  const repository = await InMemoryKnowledgeRepository.create([candidateSource]);

  return { candidateSource, repository, snapshot: candidateSource.snapshot };
}
