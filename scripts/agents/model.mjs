import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { AGENT_DEFINITION_DIRECTORY, AGENT_SCHEMA_DIRECTORY } from "./constants.mjs";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const schemas = new Map();
for (const file of readdirSync(AGENT_SCHEMA_DIRECTORY).filter((name) => name.endsWith(".json")).sort()) {
  const schema = JSON.parse(readFileSync(resolve(AGENT_SCHEMA_DIRECTORY, file), "utf8"));
  ajv.addSchema(schema, file);
  schemas.set(file.replace(".schema.json", ""), schema);
}

function errorMessage(error) {
  const location = error.instancePath || "record";
  if (error.keyword === "required") return `${location} must include ${error.params.missingProperty}`;
  return `${location} ${error.message}`;
}

export function validateAgentRecord(kind, record, label = kind) {
  const schema = schemas.get(kind);
  if (!schema) throw new Error(`Unknown agent schema: ${kind}`);
  const validate = ajv.compile(schema);
  if (validate(record)) return record;
  throw new Error(`${label} validation failed:\n- ${validate.errors.map(errorMessage).join("\n- ")}`);
}

export function loadAgentDefinition(id) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new Error(`Invalid agent ID: ${id}`);
  const file = resolve(AGENT_DEFINITION_DIRECTORY, `${id}.yaml`);
  let definition;
  try {
    definition = parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Agent definition not found: ${id}`);
    throw new Error(`Could not read agent definition ${id}: ${error.message}`);
  }
  return { definition: validateAgentRecord("agent-definition", definition, `agent ${id}`), file };
}

export function listAgentDefinitions() {
  return readdirSync(AGENT_DEFINITION_DIRECTORY)
    .filter((file) => [".yaml", ".yml"].includes(extname(file)))
    .sort()
    .map((file) => loadAgentDefinition(file.replace(/\.ya?ml$/, "")).definition);
}
