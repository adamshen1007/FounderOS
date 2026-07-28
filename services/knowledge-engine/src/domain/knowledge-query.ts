export class DuplicateKnowledgeObjectIdError extends Error {
  public constructor(id: string) {
    super(`Duplicate knowledge object ID: ${id}`);
    this.name = "DuplicateKnowledgeObjectIdError";
  }
}

export class DuplicateKnowledgeCandidateSourceIdError extends Error {
  public constructor(id: string) {
    super(`Duplicate knowledge candidate source ID: ${id}`);
    this.name = "DuplicateKnowledgeCandidateSourceIdError";
  }
}
