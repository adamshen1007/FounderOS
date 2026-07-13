import { existsSync } from "node:fs";
import { relative } from "node:path";
import { ROOT } from "../lib.mjs";
import { LOOPBACK_HOSTS, PLATFORM_WEB_DIRECTORY, WORKSPACE_FILE } from "./constants.mjs";
import { buildWorkspaceIndex } from "./indexer.mjs";
import { loadWorkspace } from "./model.mjs";
import { startPlatform } from "./server.mjs";

export async function runPlatformCommand(positionals, options) {
  const [command] = positionals;
  if (command === "doctor") {
    const checks = [["Workspace manifest", existsSync(WORKSPACE_FILE)], ["Dashboard assets", existsSync(PLATFORM_WEB_DIRECTORY)], ["Loopback host", LOOPBACK_HOSTS.has(options.host ?? "127.0.0.1")]];
    checks.forEach(([label, passed]) => console.log(`${passed ? "✓" : "✗"} ${label}`));
    loadWorkspace();
    if (checks.some(([, passed]) => !passed)) throw new Error("Platform doctor found setup problems.");
    return;
  }
  if (command === "index") {
    const index = buildWorkspaceIndex();
    if (options.json) console.log(JSON.stringify(index, null, 2));
    else {
      console.log(`${index.workspace.name}: ${index.projects.length} projects`);
      for (const project of index.projects) console.log(`${project.id.padEnd(22)} ${project.stage.padEnd(12)} ${project.nextAction}`);
    }
    return;
  }
  if (command === "start") {
    const host = options.host ?? "127.0.0.1";
    const port = Number(options.port ?? 4310);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer from 0 to 65535.");
    const platform = await startPlatform({ host, port });
    const address = platform.server.address();
    console.log(`FounderOS workspace: http://${host.includes(":") ? `[${host}]` : host}:${address.port}`);
    console.log(`Workspace source: ${relative(ROOT, WORKSPACE_FILE)}`);
    const stop = () => platform.server.close(() => process.exit(0));
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    return new Promise(() => {});
  }
  throw new Error("Platform command must be doctor, index, or start.");
}
