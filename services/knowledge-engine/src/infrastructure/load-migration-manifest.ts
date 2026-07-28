import { readFile } from "node:fs/promises";

import {
  KnowledgeMigrationManifestSchema,
  type KnowledgeMigrationManifest,
} from "@founderos/knowledge-schema";
import { parseDocument } from "yaml";

import { SafePathError } from "../domain/safe-path.js";
import type { MigrationError } from "../interfaces/migration-report.js";
import { resolveSafeExistingFile } from "./safe-path.js";

export type ManifestLoadResult =
  | { manifest: KnowledgeMigrationManifest; status: "accepted" }
  | { errors: MigrationError[]; status: "rejected" };

function validationErrors(error: {
  issues: ReadonlyArray<{ message: string; path: ReadonlyArray<PropertyKey> }>;
}): MigrationError[] {
  return error.issues.map((issue) => ({
    code: "manifest_validation_error",
    fieldPath: issue.path.length > 0 ? issue.path.map(String).join(".") : "$",
    message: issue.message,
  }));
}

export async function loadMigrationManifest(
  physicalRoot: string,
  manifestPath: string,
): Promise<ManifestLoadResult> {
  let resolvedManifestPath: string;

  try {
    resolvedManifestPath = await resolveSafeExistingFile(physicalRoot, manifestPath);
  } catch (error: unknown) {
    return {
      errors: [
        {
          code: error instanceof SafePathError ? "manifest_path_unsafe" : "manifest_read_error",
          message:
            error instanceof SafePathError
              ? error.message
              : `Unable to read migration manifest: ${manifestPath}`,
        },
      ],
      status: "rejected",
    };
  }

  let source: string;
  try {
    source = await readFile(resolvedManifestPath, "utf8");
  } catch {
    return {
      errors: [
        {
          code: "manifest_read_error",
          message: `Unable to read migration manifest: ${manifestPath}`,
        },
      ],
      status: "rejected",
    };
  }

  const document = parseDocument(source, {
    logLevel: "silent",
    prettyErrors: false,
    schema: "core",
    strict: true,
    version: "1.2",
  });

  if (document.errors.length > 0) {
    return {
      errors: [
        {
          code: "manifest_parse_error",
          message: document.errors.map((error) => error.message).join("; "),
        },
      ],
      status: "rejected",
    };
  }

  let input: unknown;
  try {
    input = document.toJS({ maxAliasCount: 20 }) as unknown;
  } catch (error: unknown) {
    return {
      errors: [
        {
          code: "manifest_parse_error",
          message: error instanceof Error ? error.message : "Unable to parse migration manifest",
        },
      ],
      status: "rejected",
    };
  }

  const result = KnowledgeMigrationManifestSchema.safeParse(input);
  return result.success
    ? { manifest: result.data, status: "accepted" }
    : { errors: validationErrors(result.error), status: "rejected" };
}
