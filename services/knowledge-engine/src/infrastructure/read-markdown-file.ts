import { readFile } from "node:fs/promises";

export function readMarkdownFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}
