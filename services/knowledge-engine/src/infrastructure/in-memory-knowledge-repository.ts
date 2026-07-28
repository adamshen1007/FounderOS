import {
  IdentifierSchema,
  KnowledgeCandidateBatchSchema,
  KnowledgeCandidateSourceDescriptorSchema,
  KnowledgeObjectSchema,
  KnowledgeRepositoryFindRequestSchema,
  type KnowledgeCandidateBatch,
  type KnowledgeCandidateSource,
  type KnowledgeCandidateSourceDescriptor,
  type KnowledgeObject,
  type KnowledgeRepository,
  type KnowledgeRepositoryFindRequest,
} from "@founderos/knowledge-schema";

import {
  DuplicateKnowledgeCandidateSourceIdError,
  DuplicateKnowledgeObjectIdError,
} from "../domain/knowledge-query.js";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function copyObject(object: KnowledgeObject): KnowledgeObject {
  return KnowledgeObjectSchema.parse(object);
}

function copyDescriptor(
  descriptor: KnowledgeCandidateSourceDescriptor,
): KnowledgeCandidateSourceDescriptor {
  return KnowledgeCandidateSourceDescriptorSchema.parse(descriptor);
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  readonly #objects: KnowledgeObject[];
  readonly #objectsById: Map<string, KnowledgeObject>;
  readonly #sources: KnowledgeCandidateSourceDescriptor[];

  private constructor(objects: KnowledgeObject[], sources: KnowledgeCandidateSourceDescriptor[]) {
    this.#objects = objects;
    this.#objectsById = new Map(objects.map((object) => [object.metadata.id, object]));
    this.#sources = sources;
  }

  public static async create(
    candidateSources: readonly KnowledgeCandidateSource[] = [],
  ): Promise<InMemoryKnowledgeRepository> {
    const batches: KnowledgeCandidateBatch[] = [];

    for (const candidateSource of candidateSources) {
      batches.push(KnowledgeCandidateBatchSchema.parse(await candidateSource.loadCandidates()));
    }

    batches.sort((left, right) => compareStrings(left.source.sourceId, right.source.sourceId));
    const sourceIds = new Set<string>();
    const objectIds = new Set<string>();
    const objects: KnowledgeObject[] = [];

    for (const batch of batches) {
      if (sourceIds.has(batch.source.sourceId)) {
        throw new DuplicateKnowledgeCandidateSourceIdError(batch.source.sourceId);
      }
      sourceIds.add(batch.source.sourceId);

      for (const candidate of batch.candidates) {
        if (objectIds.has(candidate.metadata.id)) {
          throw new DuplicateKnowledgeObjectIdError(candidate.metadata.id);
        }
        objectIds.add(candidate.metadata.id);
        objects.push(candidate);
      }
    }

    objects.sort((left, right) => compareStrings(left.metadata.id, right.metadata.id));
    return new InMemoryKnowledgeRepository(
      objects.map(copyObject),
      batches.map((batch) => copyDescriptor(batch.source)),
    );
  }

  public async find(
    requestInput: KnowledgeRepositoryFindRequest,
  ): Promise<readonly KnowledgeObject[]> {
    const request = KnowledgeRepositoryFindRequestSchema.parse(requestInput);
    const requestedIds = new Set(request.ids);
    return this.#objects.filter((object) => requestedIds.has(object.metadata.id)).map(copyObject);
  }

  public async getById(idInput: string): Promise<KnowledgeObject | null> {
    const id = IdentifierSchema.parse(idInput);
    const object = this.#objectsById.get(id);
    return object === undefined ? null : copyObject(object);
  }

  public async getCandidates(): Promise<readonly KnowledgeObject[]> {
    return this.#objects.map(copyObject);
  }

  public async getSources(): Promise<readonly KnowledgeCandidateSourceDescriptor[]> {
    return this.#sources.map(copyDescriptor);
  }
}
