import type { ChildProcess } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export interface ChildPathWaitOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly expectedUtf8Content?: string;
}

async function pathIsReady(path: string, expectedUtf8Content?: string): Promise<boolean> {
  try {
    if (expectedUtf8Content === undefined) {
      await lstat(path);
      return true;
    }
    return (await readFile(path, "utf8")) === expectedUtf8Content;
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
    if (await pathIsReady(path, options.expectedUtf8Content)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("child-exited-before-initialization-barrier");
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error("child-initialization-barrier-timeout");
    await delay(Math.min(pollIntervalMs, remainingMs));
  }
}
