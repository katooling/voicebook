import { readFile } from "node:fs/promises";
import { openVoicebook } from "../application.ts";
import { parseSyncPage } from "../sync/validation.ts";

const maximumSyncBytes = 4 * 1024 * 1024;

export async function runSyncCommand(input: {
  args: string[];
  workspace: string;
}): Promise<void> {
  if (input.args[0] === "status") {
    const syncKey = option(input.args, "--sync-key");
    if (!syncKey) {
      throw new Error("Sync status requires --sync-key KEY.");
    }
    const application = openVoicebook(input.workspace);
    try {
      process.stdout.write(
        `${JSON.stringify(application.sync.status(syncKey))}\n`,
      );
    } finally {
      application.close();
    }
    return;
  }
  const raw = input.args.includes("--stdin")
    ? await readStandardInput()
    : await readSyncFile(input.args);
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("Sync input must be one JSON page.");
  }
  const page = parseSyncPage(decoded);
  const application = openVoicebook(input.workspace);
  try {
    process.stdout.write(`${JSON.stringify(application.sync.applyPage(page))}\n`);
  } finally {
    application.close();
  }
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumSyncBytes) {
      throw new Error("Sync input exceeds 4 MiB.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readSyncFile(args: string[]): Promise<string> {
  const path = option(args, "--file");
  if (!path) {
    throw new Error("Sync requires --stdin or --file PATH.");
  }
  const contents = await readFile(path);
  if (contents.length > maximumSyncBytes) {
    throw new Error("Sync input exceeds 4 MiB.");
  }
  return contents.toString("utf8");
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
