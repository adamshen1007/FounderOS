import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const REQUIRED_DIRECTORIES = [
  ".github",
  "apps",
  "docs",
  "infrastructure",
  "integrations",
  "packages",
  "packages/agent-contracts",
  "packages/knowledge-schema",
  "packages/memory-types",
  "packages/shared-config",
  "scripts",
  "services",
  "services/agent-router",
  "services/hermes-runtime",
  "services/knowledge-engine",
  "services/mcp-gateway",
  "services/memory-service",
  "specs",
  "tests",
] as const;

export const REQUIRED_FILES = [
  ".github/workflows/ci.yml",
  "ARCHITECTURE_DECISIONS.md",
  "DOCUMENTATION_INDEX.md",
  "README.md",
  "eslint.config.mjs",
  "package.json",
  "pnpm-workspace.yaml",
  "prettier.config.mjs",
  "tsconfig.json",
  "vitest.config.ts",
] as const;

export const EXCLUDED_MILESTONE_00_IMPLEMENTATIONS = [
  "apps/web/src",
  "services/agent-router/src",
  "services/hermes-runtime/src",
  "services/mcp-gateway/src",
] as const;

export interface FoundationVerification {
  forbiddenImplementations: string[];
  missingDirectories: string[];
  missingFiles: string[];
}

export function verifyRepositoryFoundation(rootDirectory: string): FoundationVerification {
  const missingDirectories = REQUIRED_DIRECTORIES.filter(
    (directory) => !existsSync(resolve(rootDirectory, directory)),
  );
  const missingFiles = REQUIRED_FILES.filter((file) => !existsSync(resolve(rootDirectory, file)));
  const forbiddenImplementations = EXCLUDED_MILESTONE_00_IMPLEMENTATIONS.filter((path) =>
    existsSync(resolve(rootDirectory, path)),
  );

  return {
    forbiddenImplementations: [...forbiddenImplementations],
    missingDirectories: [...missingDirectories],
    missingFiles: [...missingFiles],
  };
}
