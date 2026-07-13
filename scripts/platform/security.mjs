import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
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

export function validateExternalRoot(path) {
  if (!isAbsolute(path)) throw new Error(`External root must be an absolute path: ${path}`);
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`External root does not exist: ${absolute}`);
  if (lstatSync(absolute).isSymbolicLink()) throw new Error(`External root cannot be a symbolic link: ${absolute}`);
  if (!lstatSync(absolute).isDirectory()) throw new Error(`External root must be a directory: ${absolute}`);
  const real = realpathSync(absolute);
  if ([sep, dirname(real)].includes(real)) throw new Error("External root is too broad; allow the project directory itself.");
  if (real === realpathSync(ROOT) || real.startsWith(`${realpathSync(ROOT)}${sep}`)) throw new Error("Repository-contained projects do not need an external allowlist.");
  if (!existsSync(resolve(real, "package.json"))) throw new Error("External root must be a project directory containing package.json.");
  return real;
}

export function safeExternalPath(path, allowedRoots) {
  if (!isAbsolute(path)) throw new Error(`External project path must be absolute: ${path}`);
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(`External project path does not exist: ${absolute}`);
  if (lstatSync(absolute).isSymbolicLink()) throw new Error(`External project path cannot be a symbolic link: ${absolute}`);
  const real = realpathSync(absolute);
  const roots = allowedRoots.map(validateExternalRoot);
  const allowed = roots.find((root) => real === root || real.startsWith(`${root}${sep}`));
  if (!allowed) throw new Error(`External project is not allowlisted: ${absolute}`);
  const relativePath = relative(allowed, real).split(sep).join("/") || ".";
  for (const segment of relativePath.split("/")) if (DENIED.has(segment) || segment.startsWith(".env")) throw new Error(`External project path is denied: ${absolute}`);
  return { absolute: real, relative: absolute, allowedRoot: allowed };
}

export function redactLog(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .replace(/(api[_-]?key|token|authorization|password)(\s*[:=]\s*)([^\s,;]+)/gi, "$1$2[REDACTED]")
    .slice(-20000);
}
