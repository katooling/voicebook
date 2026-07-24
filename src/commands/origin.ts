import { openVoicebook } from "../application.ts";

export function runOriginCommand(input: {
  args: string[];
  workspace: string;
}): void {
  if (input.args[0] !== "status") {
    throw new Error("Usage: voicebook origin status --source-key KEY.");
  }
  const index = input.args.indexOf("--source-key");
  const sourceKey = index >= 0 ? input.args[index + 1] : undefined;
  if (!sourceKey) {
    throw new Error("Origin status requires --source-key KEY.");
  }
  const application = openVoicebook(input.workspace);
  try {
    process.stdout.write(
      `${JSON.stringify(application.reconciliation.status(sourceKey))}\n`,
    );
  } finally {
    application.close();
  }
}
