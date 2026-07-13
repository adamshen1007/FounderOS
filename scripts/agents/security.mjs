import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { ROOT } from "../lib.mjs";
import { SENSITIVE_SEGMENTS } from "./constants.mjs";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function repositoryPath(file, label = "Agent path") {
  const absolute = resolve(ROOT, file);
  const path = relative(ROOT, absolute).split(sep).join("/");
  if (!path || path.startsWith("../") || isAbsolute(path)) throw new Error(`${label} must be inside the repository.`);
  let cursor = ROOT;
  for (const segment of path.split("/")) {
    if (SENSITIVE_SEGMENTS.has(segment) || segment.startsWith(".env")) throw new Error(`${label} is sensitive and denied: ${path}`);
    cursor = resolve(cursor, segment);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} cannot traverse symbolic link: ${path}`);
  }
  if (existsSync(absolute) && !realpathSync(absolute).startsWith(`${realpathSync(ROOT)}${sep}`)) throw new Error(`${label} escapes the repository.`);
  return { absolute, path };
}

function globRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "§§").replace(/\*/g, "[^/]*").replace(/§§/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchesAny(path, patterns) {
  return patterns.some((pattern) => globRegex(pattern).test(path));
}

export function assertAllowed(file, patterns, label) {
  const safe = repositoryPath(file, label);
  if (!matchesAny(safe.path, patterns)) throw new Error(`${label} is outside the agent allowlist: ${safe.path}`);
  return safe;
}

export function fileDescriptor(file, patterns, label = "Agent input") {
  const safe = assertAllowed(file, patterns, label);
  const content = readFileSync(safe.absolute, "utf8");
  return { ...safe, content, sha256: sha256(content), bytes: Buffer.byteLength(content) };
}

export function scanPromptInjection(inputs) {
  const patterns = [/ignore (all|any|the|previous) instructions/i, /system (prompt|message)/i, /developer message/i, /tool call/i, /api[_ -]?key/i, /exfiltrat/i];
  return inputs.flatMap((input) => patterns.some((pattern) => pattern.test(input.content)) ? [input.path] : []);
}
