export interface ParsedMarkdownDocument {
  body: string;
  frontmatter: Record<string, unknown>;
  rawFrontmatter: string;
}

export type FrontmatterErrorCode =
  "missing_frontmatter" | "frontmatter_parse_error" | "frontmatter_shape_error";

export class FrontmatterError extends Error {
  public readonly code: FrontmatterErrorCode;

  public constructor(code: FrontmatterErrorCode, message: string) {
    super(message);
    this.name = "FrontmatterError";
    this.code = code;
  }
}

export class FrontmatterNormalizationError extends Error {
  public readonly fieldPath: string;

  public constructor(message: string, fieldPath: string) {
    super(message);
    this.name = "FrontmatterNormalizationError";
    this.fieldPath = fieldPath;
  }
}
