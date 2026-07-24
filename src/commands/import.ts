import { readFile } from "node:fs/promises";
import { openVoicebook } from "../application.ts";
import type {
  ImportEnvelope,
  NormalizedSourceMessage,
} from "../contracts.ts";

const maximumImportBytes = 2 * 1024 * 1024;

export async function runImportCommand(input: {
  args: string[];
  workspace: string;
}): Promise<void> {
  const raw = input.args.includes("--stdin")
    ? await readStandardInput()
    : await readImportFile(input.args);
  const envelope = parseImport(raw);
  const application = openVoicebook(input.workspace);
  try {
    process.stdout.write(
      `${JSON.stringify(application.candidates.import(envelope))}\n`,
    );
  } finally {
    application.close();
  }
}

function parseImport(raw: string): ImportEnvelope {
  try {
    return JSON.parse(raw) as ImportEnvelope;
  } catch {
    const sourceMessages = raw
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as NormalizedSourceMessage);
    return { schemaVersion: 1, sourceMessages };
  }
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumImportBytes) {
      throw new Error("Import input exceeds 2 MiB.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readImportFile(args: string[]): Promise<string> {
  const path = option(args, "--file");
  if (!path) {
    throw new Error("Import requires --stdin or --file PATH.");
  }
  const contents = await readFile(path);
  if (contents.length > maximumImportBytes) {
    throw new Error("Import input exceeds 2 MiB.");
  }
  return contents.toString("utf8");
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
