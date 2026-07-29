import { z } from "zod";

export const DURABLE_CANONICAL_JSON_ERROR_MESSAGE =
  "Expected a finite, plain, acyclic canonical JSON value";

export type DurableCanonicalJsonPrimitive = null | boolean | number | string;
export type DurableCanonicalJsonObject = {
  readonly [key: string]: DurableCanonicalJsonValue;
};
export type DurableCanonicalJsonValue =
  DurableCanonicalJsonPrimitive | readonly DurableCanonicalJsonValue[] | DurableCanonicalJsonObject;

export interface DurableCanonicalJsonIssue {
  readonly message: string;
  readonly path: readonly (number | string)[];
}

interface VisitFrame {
  readonly exiting: boolean;
  readonly path: readonly (number | string)[];
  readonly value: unknown;
}

function issue(path: readonly (number | string)[], detail: string): DurableCanonicalJsonIssue {
  return { message: `${DURABLE_CANONICAL_JSON_ERROR_MESSAGE}: ${detail}`, path };
}

function inspectObject(
  value: object,
): { keys: readonly PropertyKey[]; prototype: object | null } | null {
  try {
    return {
      keys: Reflect.ownKeys(value),
      prototype: Object.getPrototypeOf(value) as object | null,
    };
  } catch {
    return null;
  }
}

function dataDescriptor(value: object, key: PropertyKey): PropertyDescriptor | null {
  try {
    return Object.getOwnPropertyDescriptor(value, key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Finds the first value that cannot participate in deterministic durable JSON.
 * Shared acyclic references are allowed because JSON materializes each occurrence;
 * only references back into the active traversal are cycles.
 */
export function findDurableCanonicalJsonIssue(input: unknown): DurableCanonicalJsonIssue | null {
  const ancestors = new WeakSet<object>();
  const stack: VisitFrame[] = [{ exiting: false, path: [], value: input }];

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const value = frame.value;
    if (frame.exiting) {
      ancestors.delete(value as object);
      continue;
    }
    if (value === null || typeof value === "boolean" || typeof value === "string") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return issue(frame.path, "numbers must be finite");
      continue;
    }
    if (typeof value !== "object") {
      return issue(frame.path, `${typeof value} values are unsupported`);
    }
    if (ancestors.has(value)) return issue(frame.path, "cycles are unsupported");

    const inspected = inspectObject(value);
    if (inspected === null) return issue(frame.path, "the value could not be safely inspected");
    ancestors.add(value);
    stack.push({ exiting: true, path: frame.path, value });

    if (Array.isArray(value)) {
      if (inspected.prototype !== Array.prototype) {
        return issue(frame.path, "arrays must use the intrinsic Array prototype");
      }
      const indexKeys: string[] = [];
      for (const key of inspected.keys) {
        if (key === "length") continue;
        if (typeof key !== "string") {
          return issue(frame.path, "symbol-keyed array properties are unsupported");
        }
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index >= value.length ||
          String(index) !== key
        ) {
          return issue(frame.path, "arrays cannot contain non-index properties");
        }
        indexKeys.push(key);
      }
      if (indexKeys.length !== value.length) {
        return issue(frame.path, "sparse arrays are unsupported");
      }
      for (let index = indexKeys.length - 1; index >= 0; index -= 1) {
        const key = indexKeys[index]!;
        const descriptor = dataDescriptor(value, key);
        if (descriptor === null || !("value" in descriptor) || descriptor.enumerable !== true) {
          return issue(
            [...frame.path, Number(key)],
            "array entries must be enumerable data values",
          );
        }
        stack.push({
          exiting: false,
          path: [...frame.path, Number(key)],
          value: descriptor.value,
        });
      }
      continue;
    }

    if (inspected.prototype !== Object.prototype && inspected.prototype !== null) {
      return issue(frame.path, "objects must be plain objects");
    }
    for (let index = inspected.keys.length - 1; index >= 0; index -= 1) {
      const key = inspected.keys[index]!;
      if (typeof key !== "string") {
        return issue(frame.path, "symbol-keyed object properties are unsupported");
      }
      const descriptor = dataDescriptor(value, key);
      if (descriptor === null || !("value" in descriptor) || descriptor.enumerable !== true) {
        return issue([...frame.path, key], "object properties must be enumerable data values");
      }
      stack.push({ exiting: false, path: [...frame.path, key], value: descriptor.value });
    }
  }

  return null;
}

export function isDurableCanonicalJsonValue(value: unknown): value is DurableCanonicalJsonValue {
  return findDurableCanonicalJsonIssue(value) === null;
}

export const DurableCanonicalJsonValueSchema = z.custom<DurableCanonicalJsonValue>(
  isDurableCanonicalJsonValue,
  DURABLE_CANONICAL_JSON_ERROR_MESSAGE,
);

export const DurableCanonicalJsonObjectSchema = z.custom<DurableCanonicalJsonObject>(
  (value): value is DurableCanonicalJsonObject =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    isDurableCanonicalJsonValue(value),
  DURABLE_CANONICAL_JSON_ERROR_MESSAGE,
);
