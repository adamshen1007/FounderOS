import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { verifyRepositoryFoundation } from "../scripts/repository-foundation";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..");

describe("Milestone 00 repository foundation", () => {
  it("contains the required structure and no excluded runtime implementations", () => {
    expect(verifyRepositoryFoundation(REPOSITORY_ROOT)).toEqual({
      forbiddenImplementations: [],
      missingDirectories: [],
      missingFiles: [],
    });
  });

  it("preserves all official bootstrap specifications in the documentation domains", () => {
    const postBootstrapDocuments = new Set([
      "FounderOS_Milestone_02_Vault_Ingestion_Foundation_Specification_v1.0.md",
      "REPOSITORY_INITIALIZATION_PLAN.md",
    ]);
    const documentationDomains = [
      "governance",
      "knowledgeos",
      "agents",
      "architecture",
      "engineering",
      "migration",
    ];

    const specificationFiles = documentationDomains.flatMap((domain) => {
      const files = readdirSync(resolve(REPOSITORY_ROOT, "docs", domain));
      return files.filter((file) => file.endsWith(".md") && !postBootstrapDocuments.has(file));
    });

    const documentationIndex = readFileSync(
      resolve(REPOSITORY_ROOT, "DOCUMENTATION_INDEX.md"),
      "utf8",
    );

    expect(specificationFiles).toHaveLength(30);
    for (const specificationFile of specificationFiles) {
      expect(documentationIndex).toContain(specificationFile);
    }
  });
});
