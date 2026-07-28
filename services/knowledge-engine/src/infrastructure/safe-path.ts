import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { MigrationPathSchema } from "@founderos/knowledge-schema";

import { SafePathError } from "../domain/safe-path.js";

function isInside(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
  );
}

async function assertNoSymbolicLinkComponents(
  rootPath: string,
  logicalPath: string,
  includeLeaf: boolean,
): Promise<void> {
  const segments = logicalPath.split("/");
  const limit = includeLeaf ? segments.length : segments.length - 1;
  let currentPath = rootPath;

  for (const segment of segments.slice(0, limit)) {
    currentPath = resolve(currentPath, segment);
    const status = await lstat(currentPath);
    if (status.isSymbolicLink()) {
      throw new SafePathError(`Symbolic links are not allowed in migration paths: ${logicalPath}`);
    }
  }
}

export async function resolvePhysicalRoot(rootPath: string): Promise<string> {
  const resolvedRoot = resolve(rootPath);
  const status = await lstat(resolvedRoot);

  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new SafePathError("Migration root must be a physical directory");
  }

  return realpath(resolvedRoot);
}

export async function resolveSafeExistingFile(
  physicalRoot: string,
  logicalPath: string,
): Promise<string> {
  const validation = MigrationPathSchema.safeParse(logicalPath);
  if (!validation.success) {
    throw new SafePathError(`Unsafe migration path: ${logicalPath}`);
  }

  const resolvedPath = resolve(physicalRoot, ...logicalPath.split("/"));
  if (!isInside(physicalRoot, resolvedPath)) {
    throw new SafePathError(`Migration path escapes the approved root: ${logicalPath}`);
  }

  await assertNoSymbolicLinkComponents(physicalRoot, logicalPath, true);
  const status = await lstat(resolvedPath);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new SafePathError(`Migration path must identify a physical file: ${logicalPath}`);
  }

  const physicalPath = await realpath(resolvedPath);
  if (!isInside(physicalRoot, physicalPath)) {
    throw new SafePathError(`Migration path resolves outside the approved root: ${logicalPath}`);
  }

  return physicalPath;
}

export async function resolveSafeOutputPath(
  physicalRoot: string,
  logicalPath: string,
): Promise<string> {
  const validation = MigrationPathSchema.safeParse(logicalPath);
  if (!validation.success) {
    throw new SafePathError(`Unsafe migration output path: ${logicalPath}`);
  }

  if (logicalPath !== "migration-report.json") {
    throw new SafePathError("Migration output path must be migration-report.json");
  }

  const resolvedPath = resolve(physicalRoot, ...logicalPath.split("/"));
  if (!isInside(physicalRoot, resolvedPath)) {
    throw new SafePathError(`Migration output escapes the approved root: ${logicalPath}`);
  }

  await assertNoSymbolicLinkComponents(physicalRoot, logicalPath, false);
  const parentPath = await realpath(dirname(resolvedPath));
  if (!isInside(physicalRoot, parentPath)) {
    throw new SafePathError(`Migration output resolves outside the approved root: ${logicalPath}`);
  }

  try {
    const status = await lstat(resolvedPath);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new SafePathError(`Migration output must be a physical file: ${logicalPath}`);
    }
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  return resolvedPath;
}
