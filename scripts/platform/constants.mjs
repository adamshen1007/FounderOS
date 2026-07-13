import { resolve } from "node:path";
import { ROOT } from "../lib.mjs";

export const WORKSPACE_FILE = resolve(ROOT, "workspace", "founderos.workspace.yaml");
export const PLATFORM_SCHEMA_DIRECTORY = resolve(ROOT, "schemas", "platform");
export const PLATFORM_WEB_DIRECTORY = resolve(ROOT, "platform", "web");
export const PLATFORM_JOB_DIRECTORY = resolve(ROOT, ".founderos", "platform", "jobs");
export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
