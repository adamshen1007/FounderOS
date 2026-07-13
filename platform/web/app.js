const state = { csrfToken: "", data: null };
const $ = (selector) => document.querySelector(selector);
const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; };

function workflowLabel(value) {
  return ({ "quality-check": "Run all checks", "research-validate": "Validate research", "agent-review-fake": "Run safe agent review", "kit-check": "Check generated kit" })[value] ?? value;
}

function projectCard(project, index) {
  const card = node("article", `project-card${index === 0 ? " primary" : ""}`);
  const meta = node("div", "project-meta");
  meta.append(node("span", "", project.stage), node("span", "", project.milestone));
  card.append(meta, node("h3", "", project.name), node("p", "description", project.description));
  const signals = node("div", "signals");
  [[project.signals.researchTopics, "Research"], [project.signals.agentRuns, "Agent runs"], [project.signals.documents, "Documents"]].forEach(([value, label]) => { const signal = node("div", "signal"); signal.append(node("strong", "", value), node("span", "", label)); signals.append(signal); });
  card.append(signals, node("p", "next", project.nextAction));
  const actions = node("div", "actions");
  project.workflows.forEach((workflow) => { const button = node("button", "action", workflowLabel(workflow)); button.type = "button"; button.addEventListener("click", () => runWorkflow(project, workflow, button)); actions.append(button); });
  card.append(actions);
  return card;
}

function renderJobs(jobs) {
  const container = $("#jobs"); container.replaceChildren();
  if (!jobs.length) return container.append($("#empty-jobs").content.cloneNode(true));
  jobs.forEach((job) => {
    const article = node("article", "job"); const head = node("div", "job-head");
    const identity = node("div"); identity.append(node("div", "job-id", job.id), node("div", "", `${job.projectId} · ${workflowLabel(job.workflow)}`));
    head.append(identity, node("span", `status ${job.status}`, job.status)); article.append(head);
    const details = node("details"); details.append(node("summary", "", "View local log"), node("pre", "", job.log || "No output yet.")); article.append(details); container.append(article);
  });
}

function render(data) {
  state.data = data; $("#workspace-title").textContent = data.workspace.name; $("#project-count").textContent = `${data.projects.length} projects / local`;
  const projects = $("#projects"); projects.replaceChildren(...data.projects.map(projectCard)); renderJobs(data.jobs ?? []);
}

async function refresh() {
  const response = await fetch("/api/workspace"); if (!response.ok) throw new Error("Workspace state could not be loaded."); render(await response.json());
}

async function runWorkflow(project, workflow, button) {
  if (!window.confirm(`Start “${workflowLabel(workflow)}” for ${project.name}? The result will be recorded locally.`)) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/projects/${project.id}/workflows/${workflow}`, { method: "POST", headers: { "content-type": "application/json", "x-founderos-csrf": state.csrfToken }, body: JSON.stringify({ confirm: true }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message); await refresh();
  } catch (error) { window.alert(error.message); } finally { button.disabled = false; }
}

$("#refresh").addEventListener("click", refresh);
try { state.csrfToken = (await (await fetch("/api/session")).json()).csrfToken; await refresh(); setInterval(refresh, 5000); } catch (error) { $("#projects").append(node("div", "empty", error.message)); }
