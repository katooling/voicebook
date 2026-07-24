import { openVoicebook } from "../application.ts";
import { CoreChangedError } from "../profile/port.ts";

const maximumSubmissionBytes = 256 * 1024;

export async function runProfileCommand(input: {
  args: string[];
  workspace: string;
}): Promise<void> {
  const operation = input.args[0];
  const application = openVoicebook(input.workspace);
  try {
    if (operation === "status") {
      write(application.profile.status());
      return;
    }
    if (operation === "prepare") {
      write(application.profile.prepare());
      return;
    }
    if (operation === "submit") {
      if (!input.args.includes("--stdin")) {
        throw new Error("Profile submit requires --stdin.");
      }
      const submission = parseSubmission(await readStandardInput());
      try {
        write(
          application.profile.submit(
            submission.basisRevision,
            submission.text,
          ),
        );
      } catch (error) {
        if (!(error instanceof CoreChangedError)) {
          throw error;
        }
        process.stderr.write(
          `${JSON.stringify({ code: error.code, message: error.message })}\n`,
        );
        process.exitCode = 3;
      }
      return;
    }
    throw new Error("Usage: voicebook profile <prepare|status|submit>.");
  } finally {
    application.close();
  }
}

function parseSubmission(value: string): {
  basisRevision: string;
  text: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Profile submission must be JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Profile submission must be an object.");
  }
  const submission = parsed as Record<string, unknown>;
  if (submission.schemaVersion !== 1) {
    throw new Error("Profile submission must use schemaVersion 1.");
  }
  if (typeof submission.basisRevision !== "string") {
    throw new Error("basisRevision must be text.");
  }
  if (typeof submission.text !== "string") {
    throw new Error("Voice Profile text must be text.");
  }
  return {
    basisRevision: submission.basisRevision,
    text: submission.text,
  };
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumSubmissionBytes) {
      throw new Error("Profile submission exceeds 256 KiB.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
