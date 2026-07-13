import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { ROOT } from "../lib.mjs";

const DENIED = new Set([".git", ".env", ".ssh", "node_modules"]);

export function safePlatformPath(path, { allowRoot = false, mustExist = true } = {}) {
  const absolute = resolve(ROOT, path);
  const repositoryPath = relative(ROOT, absolute).split(sep).join("/") || ".";
  if ((!allowRoot && repositoryPath === ".") || repositoryPath.startsWith("../") || isAbsolute(repositoryPath)) throw new Error(`Platform path must remain inside the repository: ${path}`);
  let cursor = ROOT;
  for (const segment of repositoryPath.split("/").filter((part) => part !== ".")) {
    if (DENIED.has(segment) || segment.startsWith(".env")) throw new Error(`Platform path is denied: ${repositoryPath}`);
    cursor = resolve(cursor, segment);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Platform path cannot traverse a symbolic link: ${repositoryPath}`);
  }
  if (mustExist && !existsSync(absolute)) throw new Error(`Platform path does not exist: ${repositoryPath}`);
  if (existsSync(absolute) && absolute !== ROOT && !realpathSync(absolute).startsWith(`${realpathSync(ROOT)}${sep}`)) throw new Error(`Platform path escapes the repository: ${repositoryPath}`);
  return { absolute, relative: repositoryPath };
}

export function redactLog(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .replace(/(api[_-]?key|token|authorization|password)(\s*[:=]\s*)([^\s,;]+)/gi, "$1$2[REDACTED]")
    .slice(-20000);
}
