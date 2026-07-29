import { createHash } from "node:crypto";

import {
  findDurableCanonicalJsonIssue,
  type DurableCanonicalJsonValue,
  type KnowledgeObject,
} from "@founderos/knowledge-schema";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class CanonicalSerializationError extends Error {
  public readonly code = "unsupported_canonical_value";
  public readonly detail: string;
  public readonly path: readonly (number | string)[];

  public constructor(detail: string, path: readonly (number | string)[]) {
    super("Canonical serialization supports only finite canonical JSON values");
    this.name = "CanonicalSerializationError";
    this.detail = detail;
    this.path = [...path];
  }
}

function serializeValidatedCanonicalValue(value: DurableCanonicalJsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(serializeValidatedCanonicalValue).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => compareStrings(left, right));

  return `{${entries
    .map(
      ([key, entryValue]) =>
        `${JSON.stringify(key)}:${serializeValidatedCanonicalValue(entryValue)}`,
    )
    .join(",")}}`;
}

export function serializeCanonicalValue(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonicalValue).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => compareStrings(left, right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${serializeCanonicalValue(entryValue)}`)
    .join(",")}}`;
}

export function serializeDurableCanonicalJsonValue(value: unknown): string {
  const validationIssue = findDurableCanonicalJsonIssue(value);
  if (validationIssue !== null) {
    throw new CanonicalSerializationError(validationIssue.message, validationIssue.path);
  }
  return serializeValidatedCanonicalValue(value as DurableCanonicalJsonValue);
}

export function createCanonicalSha256Fingerprint(value: unknown): string {
  return createHash("sha256").update(serializeCanonicalValue(value)).digest("hex");
}

export function createDurableCanonicalJsonSha256Fingerprint(value: unknown): string {
  return createHash("sha256").update(serializeDurableCanonicalJsonValue(value)).digest("hex");
}

export function createKnowledgeObjectContentFingerprint(object: KnowledgeObject): string {
  const { metadata: _metadata, ...content } = object;
  void _metadata;
  return createCanonicalSha256Fingerprint(content);
}
