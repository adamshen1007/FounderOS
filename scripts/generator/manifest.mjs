import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse, stringify } from "yaml";
import { DEFAULT_MANIFEST, SCHEMA_FILE, SCHEMA_VERSION } from "./constants.mjs";
import { assertRepositoryPath } from "./paths.mjs";

const schema = JSON.parse(readFileSync(SCHEMA_FILE, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

function formatValidationError(error) {
  const location = error.instancePath || "manifest";
  if (error.keyword === "required") return `${location} must include ${error.params.missingProperty}`;
  return `${location} ${error.message}`;
}

export function validateManifest(manifest) {
  if (validateSchema(manifest)) return manifest;
  const details = validateSchema.errors.map(formatValidationError).join("\n- ");
  throw new Error(`Manifest validation failed:\n- ${details}`);
}

export function loadManifest(file = DEFAULT_MANIFEST) {
  const manifestFile = resolve(file);
  let manifest;
  try {
    manifest = parse(readFileSync(manifestFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Manifest not found: ${manifestFile}`);
    throw new Error(`Could not read manifest ${manifestFile}: ${error.message}`);
  }
  validateManifest(manifest);
  return { manifest, manifestFile };
}

export function resolveOutputDirectory(manifest, manifestFile) {
  const rawOutput = manifest.generation.output;
  if (isAbsolute(rawOutput)) throw new Error("generation.output must be a relative path.");
  const base = dirname(manifestFile);
  const outputDirectory = resolve(base, rawOutput);
  return assertRepositoryPath(outputDirectory, { label: "generation.output" });
}

export function createManifest(values) {
  return validateManifest({
    schemaVersion: SCHEMA_VERSION,
    project: {
      name: values.name,
      slug: values.slug,
      description: values.description,
      owner: values.owner
    },
    product: {
      audience: values.audience,
      problem: values.problem,
      stage: values.stage
    },
    generation: { template: "default", output: values.output ?? "." }
  });
}

export function serializeManifest(manifest) {
  return stringify(manifest, { lineWidth: 100 });
}
