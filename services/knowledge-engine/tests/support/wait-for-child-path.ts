import type { ChildProcess } from "node:child_process";
import { lstat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export interface ChildPathWaitOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function waitForChildPath(
  child: ChildProcess,
  path: string,
  options: ChildPathWaitOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollIntervalMs = options.pollIntervalMs ?? 10;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (await pathExists(path)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("child-exited-before-initialization-barrier");
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error("child-initialization-barrier-timeout");
    await delay(Math.min(pollIntervalMs, remainingMs));
  }
}
