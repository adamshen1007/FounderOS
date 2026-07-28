import { createHash } from "node:crypto";

import {
  KnowledgeObjectSchema,
  KnowledgeObjectSchemas,
  type KnowledgeObject,
  type KnowledgeObjectType,
} from "@founderos/knowledge-schema";

import { FrontmatterError, FrontmatterNormalizationError } from "../domain/frontmatter.js";
import { parseMarkdown } from "../infrastructure/parse-markdown.js";
import { readMarkdownFile } from "../infrastructure/read-markdown-file.js";
import type {
  IngestionError,
  IngestionReport,
  SourceEvidence,
} from "../interfaces/ingestion-report.js";
import { normalizeFrontmatter } from "./normalize-frontmatter.js";

function createSourceEvidence(sourcePath: string, markdown: string): Required<SourceEvidence> {
  return {
    byteLength: Buffer.byteLength(markdown, "utf8"),
    path: sourcePath,
    sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
  };
}

function toValidationErrors(error: {
  issues: ReadonlyArray<{ message: string; path: ReadonlyArray<PropertyKey> }>;
}): IngestionError[] {
  return error.issues.map((issue) => ({
    code: "knowledge_validation_error",
    fieldPath: issue.path.length > 0 ? issue.path.map(String).join(".") : "$",
    message: issue.message,
  }));
}

function parseNormalizedObject(normalized: Record<string, unknown>) {
  const metadata = normalized.metadata;
  const objectType =
    typeof metadata === "object" && metadata !== null && "objectType" in metadata
      ? metadata.objectType
      : undefined;
  const schema =
    typeof objectType === "string" && Object.hasOwn(KnowledgeObjectSchemas, objectType)
      ? KnowledgeObjectSchemas[objectType as KnowledgeObjectType]
      : KnowledgeObjectSchema;

  return schema.safeParse(normalized);
}

export function ingestMarkdownDocument(sourcePath: string, markdown: string): IngestionReport {
  const source = createSourceEvidence(sourcePath, markdown);

  try {
    const parsedMarkdown = parseMarkdown(markdown);
    const normalized = normalizeFrontmatter(
      parsedMarkdown.frontmatter,
      parsedMarkdown.body,
      sourcePath,
    );
    const validation = parseNormalizedObject(normalized);

    if (!validation.success) {
      return {
        errors: toValidationErrors(validation.error),
        source,
        status: "rejected",
      };
    }

    return {
      object: validation.data as KnowledgeObject,
      source,
      status: "accepted",
    };
  } catch (error: unknown) {
    if (error instanceof FrontmatterError) {
      return {
        errors: [{ code: error.code, message: error.message }],
        source,
        status: "rejected",
      };
    }

    if (error instanceof FrontmatterNormalizationError) {
      return {
        errors: [
          {
            code: "frontmatter_normalization_error",
            fieldPath: error.fieldPath,
            message: error.message,
          },
        ],
        source,
        status: "rejected",
      };
    }

    throw error;
  }
}

export async function ingestMarkdownFile(
  filePath: string,
  sourcePath = filePath,
): Promise<IngestionReport> {
  let markdown: string;

  try {
    markdown = await readMarkdownFile(filePath);
  } catch (error: unknown) {
    return {
      errors: [
        {
          code: "file_read_error",
          message: error instanceof Error ? error.message : "Unable to read Markdown file",
        },
      ],
      source: { path: sourcePath },
      status: "rejected",
    };
  }

  return ingestMarkdownDocument(sourcePath, markdown);
}
