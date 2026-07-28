import { createHash } from "node:crypto";

import type { KnowledgeObject } from "@founderos/knowledge-schema";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => compareStrings(left, right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
    .join(",")}}`;
}

export function createCanonicalSha256Fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function createKnowledgeObjectContentFingerprint(object: KnowledgeObject): string {
  const { metadata: _metadata, ...content } = object;
  void _metadata;
  return createCanonicalSha256Fingerprint(content);
}
