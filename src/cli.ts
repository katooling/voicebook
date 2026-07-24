#!/usr/bin/env node

import { homedir, platform } from "node:os";
import { join } from "node:path";
import { runImportCommand } from "./commands/import.ts";
import { runReviewCommand } from "./commands/review.ts";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const workspace = option(args, "--workspace") ?? defaultWorkspace();

  switch (command) {
    case "import":
      await runImportCommand({ args, workspace });
      return;
    case "review":
      await runReviewCommand({ args, workspace });
      return;
    default:
      fail(
        "Usage: voicebook <import|review> [--workspace PATH].",
      );
  }
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function defaultWorkspace(): string {
  const override = process.env.VOICEBOOK_WORKSPACE;
  if (override) {
    return override;
  }
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "Voicebook");
  }
  return join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "voicebook",
  );
}

function fail(message: string): never {
  throw new Error(message);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown Voicebook error.";
  process.stderr.write(`${JSON.stringify({ code: "INVALID_INPUT", message })}\n`);
  process.exitCode = 2;
});
