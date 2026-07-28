export class SafePathError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SafePathError";
  }
}
