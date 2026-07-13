import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { PLATFORM_SCHEMA_DIRECTORY, WORKSPACE_FILE } from "./constants.mjs";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validators = Object.fromEntries(["workspace", "project-summary", "workflow-job", "pilot-session"].map((kind) => {
  const schema = JSON.parse(readFileSync(resolve(PLATFORM_SCHEMA_DIRECTORY, `${kind}.schema.json`), "utf8"));
  return [kind, ajv.compile(schema)];
}));

export function validatePlatformRecord(kind, value, label = kind) {
  const validate = validators[kind];
  if (validate(value)) return value;
  const details = validate.errors.map((error) => `${error.instancePath || "record"} ${error.message}`).join("\n- ");
  throw new Error(`${label} validation failed:\n- ${details}`);
}

export function loadWorkspace(file = WORKSPACE_FILE) {
  const workspace = parse(readFileSync(resolve(file), "utf8"));
  validatePlatformRecord("workspace", workspace, "workspace manifest");
  const ids = new Set();
  for (const project of workspace.projects) {
    if (ids.has(project.id)) throw new Error(`Duplicate workspace project ID: ${project.id}`);
    ids.add(project.id);
    if (project.kind === "kit" && !project.manifest) throw new Error(`${project.id} must declare a manifest.`);
  }
  return workspace;
}
