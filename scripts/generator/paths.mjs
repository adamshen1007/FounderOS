import { existsSync, lstatSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { ROOT } from "../lib.mjs";

export function assertRepositoryPath(target, options = {}) {
  const absoluteTarget = resolve(target);
  const repositoryRelative = relative(ROOT, absoluteTarget);
  if ((!options.allowRoot && repositoryRelative === "") || repositoryRelative.startsWith("..") || isAbsolute(repositoryRelative)) {
    throw new Error(`${options.label ?? "Path"} must resolve to a project directory inside this repository, not the repository root.`);
  }

  let cursor = ROOT;
  for (const segment of repositoryRelative.split(/[\\/]/).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`${options.label ?? "Path"} cannot traverse symbolic link: ${relative(ROOT, cursor)}`);
    }
  }
  return absoluteTarget;
}
