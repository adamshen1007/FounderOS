import { FrontmatterNormalizationError } from "../domain/frontmatter.js";

const PROHIBITED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const METADATA_KEYS = new Set([
  "author",
  "category",
  "confidence",
  "created",
  "createdAt",
  "domain",
  "freshness",
  "id",
  "importance",
  "objectType",
  "originalCreator",
  "relationships",
  "source",
  "sourceReference",
  "sourceType",
  "status",
  "subCategory",
  "tags",
  "title",
  "type",
  "updated",
  "updatedAt",
  "validationStatus",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCamelCase(key: string): string {
  return key.replace(/_([a-z0-9])/gu, (_, character: string) => character.toUpperCase());
}

function normalizeValue(value: unknown, fieldPath: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeValue(item, `${fieldPath}.${index}`));
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = Object.create(null) as Record<string, unknown>;

  for (const [key, childValue] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new FrontmatterNormalizationError(`Frontmatter key ${key} is prohibited`, fieldPath);
    }

    const normalizedKey = toCamelCase(key);
    const childPath = fieldPath.length === 0 ? normalizedKey : `${fieldPath}.${normalizedKey}`;

    if (Object.hasOwn(normalized, normalizedKey)) {
      throw new FrontmatterNormalizationError(
        `Frontmatter keys collide after normalization at ${childPath}`,
        childPath,
      );
    }

    normalized[normalizedKey] = normalizeValue(childValue, childPath);
  }

  return normalized;
}

function createSource(
  normalized: Record<string, unknown>,
  sourcePath: string,
): Record<string, unknown> {
  const nestedSource = isRecord(normalized.source) ? normalized.source : {};

  const resolveSourceField = (field: string, fallback: unknown): unknown => {
    const nestedValue = nestedSource[field];
    const flatValue = normalized[field];

    if (nestedValue !== undefined && flatValue !== undefined && nestedValue !== flatValue) {
      throw new FrontmatterNormalizationError(
        `Nested and flat source values conflict at source.${field}`,
        `source.${field}`,
      );
    }

    return nestedValue ?? flatValue ?? fallback;
  };

  return {
    ...nestedSource,
    sourceType: resolveSourceField("sourceType", "markdown"),
    sourceReference: resolveSourceField("sourceReference", sourcePath),
    author: resolveSourceField("author", undefined),
    originalCreator: resolveSourceField("originalCreator", undefined),
  };
}

function resolveAlias(
  normalized: Record<string, unknown>,
  canonicalKey: string,
  aliasKey: string,
): unknown {
  const canonicalValue = normalized[canonicalKey];
  const aliasValue = normalized[aliasKey];

  if (canonicalValue !== undefined && aliasValue !== undefined && canonicalValue !== aliasValue) {
    throw new FrontmatterNormalizationError(
      `Frontmatter values conflict for ${canonicalKey} and ${aliasKey}`,
      canonicalKey,
    );
  }

  return canonicalValue ?? aliasValue;
}

export function normalizeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
  sourcePath: string,
): Record<string, unknown> {
  const normalizedValue = normalizeValue(frontmatter, "");

  if (!isRecord(normalizedValue)) {
    throw new FrontmatterNormalizationError("Frontmatter must be a mapping", "$");
  }

  const objectType = resolveAlias(normalizedValue, "objectType", "type");
  const metadata = {
    id: normalizedValue.id,
    title: normalizedValue.title,
    objectType,
    domain: normalizedValue.domain,
    category: normalizedValue.category,
    subCategory: normalizedValue.subCategory,
    source: createSource(normalizedValue, sourcePath),
    createdAt: resolveAlias(normalizedValue, "createdAt", "created"),
    updatedAt: resolveAlias(normalizedValue, "updatedAt", "updated"),
    status: normalizedValue.status,
    confidence: normalizedValue.confidence,
    importance: normalizedValue.importance,
    freshness: normalizedValue.freshness,
    validationStatus: normalizedValue.validationStatus,
    tags: normalizedValue.tags,
    relationships: normalizedValue.relationships,
  };
  const objectFields = Object.fromEntries(
    Object.entries(normalizedValue).filter(([key]) => !METADATA_KEYS.has(key)),
  );

  return objectType === "knowledge"
    ? { metadata, ...objectFields, content: body }
    : { metadata, ...objectFields };
}
