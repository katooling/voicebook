import { openVoicebook } from "../application.ts";
import { DraftOperationError } from "../drafting/port.ts";
import {
  parseDraftFinishInput,
  parseDraftStartInput,
} from "../drafting/validation.ts";

const maximumInputBytes = 256 * 1024;

export async function runDraftCommand(input: {
  args: string[];
  workspace: string;
}): Promise<void> {
  const operation = input.args[0];
  if (!input.args.includes("--stdin")) {
    throw new Error("Draft commands require --stdin.");
  }
  const value = await readJsonInput();
  const application = openVoicebook(input.workspace);
  try {
    if (operation === "start") {
      write(application.drafting.begin(parseDraftStartInput(value)));
      return;
    }
    if (operation === "finish") {
      const finish = parseDraftFinishInput(value);
      write(application.drafting.record(finish.runId, finish.text));
      return;
    }
    throw new Error("Usage: voicebook draft <start|finish> --stdin.");
  } catch (error) {
    if (!(error instanceof DraftOperationError)) {
      throw error;
    }
    process.stderr.write(
      `${JSON.stringify({ code: error.code, message: error.message })}\n`,
    );
    process.exitCode = 3;
  } finally {
    application.close();
  }
}

async function readJsonInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumInputBytes) {
      throw new Error("Draft input exceeds 256 KiB.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Draft input must be JSON.");
  }
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
