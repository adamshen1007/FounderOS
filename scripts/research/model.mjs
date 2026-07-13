import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse, stringify } from "yaml";
import { assertRepositoryPath } from "../generator/paths.mjs";
import {
  RECORD_DIRECTORIES,
  RESEARCH_MANIFEST,
  RESEARCH_SCHEMA_DIRECTORY,
  RESEARCH_SCHEMA_VERSION
} from "./constants.mjs";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validators = Object.fromEntries(["topic", "source", "evidence", "claim"].map((name) => {
  const schema = JSON.parse(readFileSync(resolve(RESEARCH_SCHEMA_DIRECTORY, `${name}.schema.json`), "utf8"));
  return [name, ajv.compile(schema)];
}));

function validationMessage(error) {
  const location = error.instancePath || "record";
  if (error.keyword === "required") return `${location} must include ${error.params.missingProperty}`;
  return `${location} ${error.message}`;
}

export function validateRecord(kind, record, label = kind) {
  const validator = validators[kind];
  if (validator(record)) return record;
  const details = validator.errors.map(validationMessage).join("\n- ");
  throw new Error(`${label} validation failed:\n- ${details}`);
}

function loadYaml(file) {
  try {
    return parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Research file not found: ${file}`);
    throw new Error(`Could not read ${file}: ${error.message}`);
  }
}

function loadRecords(directory, kind) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => [".yaml", ".yml"].includes(extname(file).toLowerCase()))
    .sort()
    .map((file) => {
      const absolutePath = resolve(directory, file);
      assertRepositoryPath(absolutePath, { label: `${kind} record` });
      return validateRecord(kind, loadYaml(absolutePath), `${kind} record ${file}`);
    });
}

function uniqueById(records, kind) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`Duplicate ${kind} ID: ${record.id}`);
    ids.add(record.id);
  }
  return ids;
}

function daysBetween(earlier, later) {
  return Math.floor((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
}

function quoteWordCount(excerpt = "") {
  return excerpt.trim().split(/\s+/).filter(Boolean).length;
}

export function validateResearchGraph(data) {
  const sourceIds = uniqueById(data.sources, "source");
  const evidenceIds = uniqueById(data.evidence, "evidence");
  const claimIds = uniqueById(data.claims, "claim");
  const sourcesById = new Map(data.sources.map((record) => [record.id, record]));
  const evidenceById = new Map(data.evidence.map((record) => [record.id, record]));

  if (data.sources.length < data.topic.research.minimumSources) {
    throw new Error(`Research requires at least ${data.topic.research.minimumSources} sources; found ${data.sources.length}.`);
  }

  for (const evidence of data.evidence) {
    if (!sourceIds.has(evidence.source)) throw new Error(`${evidence.id} references missing source ${evidence.source}.`);
    if (evidence.kind === "quote" && quoteWordCount(evidence.excerpt) > 25) {
      throw new Error(`${evidence.id} quotation exceeds the 25-word storage limit.`);
    }
    if (evidence.kind === "observation" && sourcesById.get(evidence.source).sourceClass !== "internal") {
      throw new Error(`${evidence.id} observation must reference an internal source.`);
    }
  }

  for (const claim of data.claims) {
    for (const evidenceId of claim.evidence) {
      if (!evidenceIds.has(evidenceId)) throw new Error(`${claim.id} references missing evidence ${evidenceId}.`);
    }
    for (const contradictedId of claim.contradicts) {
      if (!claimIds.has(contradictedId)) throw new Error(`${claim.id} contradicts missing claim ${contradictedId}.`);
      if (contradictedId === claim.id) throw new Error(`${claim.id} cannot contradict itself.`);
    }
    if (["sourced-fact", "source-opinion", "observation"].includes(claim.classification) && claim.evidence.length === 0) {
      throw new Error(`${claim.id} classification ${claim.classification} requires evidence.`);
    }
    if (claim.classification === "assumption" && claim.evidence.length > 0) {
      throw new Error(`${claim.id} is an assumption and must not cite evidence.`);
    }
    if (claim.classification === "observation" && claim.evidence.some((id) => evidenceById.get(id).kind !== "observation")) {
      throw new Error(`${claim.id} observation must use observation evidence.`);
    }
    if (claim.classification === "synthesis") {
      const synthesisSources = new Set(claim.evidence.map((id) => evidenceById.get(id)?.source).filter(Boolean));
      if (synthesisSources.size < 2) throw new Error(`${claim.id} synthesis requires evidence from at least two sources.`);
    }
  }

  if (data.topic.research.status === "approved" && data.claims.some((claim) => claim.status === "proposed")) {
    throw new Error("Approved research cannot contain proposed claims.");
  }

  const staleSources = [];
  for (const source of data.sources) {
    if (daysBetween(source.published, source.accessed) < 0) {
      throw new Error(`${source.id} access date is earlier than its publication date.`);
    }
    const ageDays = daysBetween(source.accessed, data.topic.research.asOf);
    if (ageDays < 0) throw new Error(`${source.id} access date is later than research.asOf.`);
    if (ageDays > data.topic.research.freshnessDays) staleSources.push({ ...source, ageDays });
  }

  for (const evidence of data.evidence) {
    if (daysBetween(evidence.capturedAt, data.topic.research.asOf) < 0) {
      throw new Error(`${evidence.id} capture date is later than research.asOf.`);
    }
  }

  return { ...data, sourceIds, evidenceIds, claimIds, sourcesById, evidenceById, staleSources };
}

export function loadResearch(manifest = RESEARCH_MANIFEST) {
  const manifestFile = resolve(manifest);
  assertRepositoryPath(manifestFile, { label: "Research manifest" });
  const directory = dirname(manifestFile);
  const topic = validateRecord("topic", loadYaml(manifestFile), "research manifest");
  const data = {
    manifestFile,
    directory,
    topic,
    sources: loadRecords(resolve(directory, RECORD_DIRECTORIES.source), "source"),
    evidence: loadRecords(resolve(directory, RECORD_DIRECTORIES.evidence), "evidence"),
    claims: loadRecords(resolve(directory, RECORD_DIRECTORIES.claim), "claim")
  };
  return validateResearchGraph(data);
}

export function createTopic(values) {
  return validateRecord("topic", {
    schemaVersion: RESEARCH_SCHEMA_VERSION,
    topic: { id: values.id, title: values.title, question: values.question, owner: values.owner },
    research: {
      status: values.status ?? "collecting",
      minimumSources: Number(values.minimumSources ?? 5),
      freshnessDays: Number(values.freshnessDays ?? 180),
      asOf: values.asOf,
      output: "."
    }
  });
}

export function serializeResearch(record) {
  return stringify(record, { lineWidth: 100 });
}

export function sourceIdsForClaim(claim, data) {
  return [...new Set(claim.evidence.map((id) => data.evidenceById.get(id)?.source).filter(Boolean))].sort();
}
