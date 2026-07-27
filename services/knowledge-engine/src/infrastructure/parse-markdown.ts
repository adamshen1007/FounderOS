import { parseDocument } from "yaml";

import { FrontmatterError, type ParsedMarkdownDocument } from "../domain/frontmatter.js";

const FRONTMATTER_PATTERN = /^(?:\uFEFF)?---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*(?:\r?\n|$)/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMarkdown(markdown: string): ParsedMarkdownDocument {
  const match = FRONTMATTER_PATTERN.exec(markdown);

  if (match === null) {
    throw new FrontmatterError(
      "missing_frontmatter",
      "Markdown must begin with YAML frontmatter enclosed by --- delimiter lines",
    );
  }

  const rawFrontmatter = match[1] ?? "";
  const document = parseDocument(rawFrontmatter, {
    logLevel: "silent",
    prettyErrors: false,
    schema: "core",
    strict: true,
    version: "1.2",
  });

  if (document.errors.length > 0) {
    throw new FrontmatterError(
      "frontmatter_parse_error",
      document.errors.map((error) => error.message).join("; "),
    );
  }

  let frontmatter: unknown;

  try {
    frontmatter = document.toJS({ maxAliasCount: 20 }) as unknown;
  } catch (error: unknown) {
    throw new FrontmatterError(
      "frontmatter_parse_error",
      error instanceof Error ? error.message : "Unable to convert YAML frontmatter",
    );
  }

  if (!isRecord(frontmatter)) {
    throw new FrontmatterError(
      "frontmatter_shape_error",
      "YAML frontmatter must contain a key-value mapping",
    );
  }

  return {
    body: markdown.slice(match[0].length),
    frontmatter,
    rawFrontmatter,
  };
}
