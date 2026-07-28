export class DuplicateKnowledgeObjectIdError extends Error {
  public constructor(id: string) {
    super(`Duplicate knowledge object ID: ${id}`);
    this.name = "DuplicateKnowledgeObjectIdError";
  }
}
