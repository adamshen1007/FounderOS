import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { parse } from "yaml";
import { ROOT, listFiles } from "../lib.mjs";
import { loadManifest } from "../generator/manifest.mjs";
import { loadWorkspace, validatePlatformRecord } from "./model.mjs";
import { safePlatformPath } from "./security.mjs";

function count(directory, predicate) {
  return listFiles(directory, predicate).length;
}

function roadmapState() {
  const roadmap = readFileSync(resolve(ROOT, "ROADMAP.md"), "utf8");
  const sections = roadmap.split(/(?=^## M\d+ —)/m);
  const records = sections.map((section) => ({ milestone: section.match(/^## (M\d+) —/m)?.[1], status: section.match(/^\*\*Status:\*\* (.+)$/m)?.[1] })).filter((record) => record.milestone);
  const complete = records.filter((record) => record.status?.startsWith("Complete")).map((record) => record.milestone);
  const nextRecord = records.find((record) => record.status?.startsWith("Next"));
  const m5aPilot = records.find((record) => record.milestone === "M5" && record.status?.includes("M5A local workspace complete"));
  const next = nextRecord?.milestone ?? (m5aPilot ? "M5A pilot" : "Unscheduled");
  return { complete, next };
}

function repositorySummary(project, workspace) {
  const base = safePlatformPath(project.path, { allowRoot: true });
  const pkg = JSON.parse(readFileSync(resolve(base.absolute, "package.json"), "utf8"));
  const roadmap = roadmapState();
  return {
    schemaVersion: 1, id: project.id, name: "FounderOS", description: pkg.description,
    owner: workspace.workspace.owner, stage: "platform", path: base.relative,
    milestone: roadmap.next,
    signals: {
      researchTopics: count(resolve(base.absolute, "research", "topics"), (file) => file.endsWith("research.yaml")),
      agentRuns: count(resolve(base.absolute, "examples", "agent-runs"), (file) => file.endsWith("summary.json")),
      documents: count(resolve(base.absolute, "docs"), (file) => extname(file) === ".md")
    },
    workflows: ["quality-check", "research-validate", "agent-review-fake"],
    nextAction: roadmap.next === "M5A pilot" ? "Use M5A in repeated internal workflows before proposing hosted M5B." : `${roadmap.next} is next; begin with its accepted RFC boundary.`
  };
}

function kitSummary(project) {
  const base = safePlatformPath(project.path);
  const manifestPath = safePlatformPath(resolve(base.absolute, project.manifest));
  const { manifest } = loadManifest(manifestPath.absolute);
  return {
    schemaVersion: 1, id: project.id, name: manifest.project.name,
    description: manifest.project.description, owner: manifest.project.owner,
    stage: manifest.product.stage, path: base.relative, milestone: "Generated kit",
    signals: { researchTopics: 0, agentRuns: 0, documents: count(base.absolute, (file) => extname(file) === ".md") },
    workflows: ["kit-check"], nextAction: "Review the generated verification plan and choose the next milestone outcome."
  };
}

export function buildWorkspaceIndex(file) {
  const workspace = loadWorkspace(file);
  const projects = workspace.projects.map((project) => validatePlatformRecord("project-summary", project.kind === "repository" ? repositorySummary(project, workspace) : kitSummary(project), `project ${project.id}`));
  return { schemaVersion: 1, workspace: workspace.workspace, projects };
}

export function researchDetail(projectId) {
  if (projectId !== "founderos-core") return { topics: [] };
  const topicFiles = listFiles(resolve(ROOT, "research", "topics"), (file) => file.endsWith("research.yaml"));
  return { topics: topicFiles.map((file) => {
    const record = parse(readFileSync(file, "utf8"));
    return { id: record.topic.id, title: record.topic.title, status: record.research.status, asOf: record.research.asOf };
  }) };
}

export function agentRunDetail(projectId) {
  if (projectId !== "founderos-core") return { runs: [] };
  const files = listFiles(resolve(ROOT, "examples", "agent-runs"), (file) => file.endsWith("summary.json"));
  return { runs: files.map((file) => JSON.parse(readFileSync(file, "utf8"))) };
}
