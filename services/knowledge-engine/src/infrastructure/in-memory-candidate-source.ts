import {
  KnowledgeCandidateBatchSchema,
  type KnowledgeCandidateBatch,
  type KnowledgeCandidateSource,
} from "@founderos/knowledge-schema";

export class InMemoryKnowledgeCandidateSource implements KnowledgeCandidateSource {
  readonly #batch: KnowledgeCandidateBatch;

  public constructor(sourceInput: unknown, candidateInputs: readonly unknown[]) {
    this.#batch = KnowledgeCandidateBatchSchema.parse({
      schemaVersion: "1.0",
      source: sourceInput,
      candidates: candidateInputs,
    });
  }

  public async loadCandidates(): Promise<KnowledgeCandidateBatch> {
    return KnowledgeCandidateBatchSchema.parse(this.#batch);
  }
}
