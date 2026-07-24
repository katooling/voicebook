import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ImportEnvelope } from "../src/contracts.ts";

export const repositoryRoot = resolve(import.meta.dirname, "..");
export const cliPath = join(repositoryRoot, "src", "cli.ts");
export const fixturePath = join(
  repositoryRoot,
  "tests",
  "fixtures",
  "source-message.json",
);

export async function importFixture(workspace: string): Promise<void> {
  const fixture = await readFile(fixturePath, "utf8");
  importJson(workspace, fixture);
}

export function importEnvelope(
  workspace: string,
  envelope: ImportEnvelope,
): { imported: number; updated: number; unchanged: number } {
  return importJson(workspace, JSON.stringify(envelope));
}

function importJson(
  workspace: string,
  json: string,
): { imported: number; updated: number; unchanged: number } {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "import",
      "--workspace",
      workspace,
      "--stdin",
    ],
    {
      cwd: repositoryRoot,
      input: json,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return JSON.parse(result.stdout) as {
    imported: number;
    updated: number;
    unchanged: number;
  };
}

export async function startVoicebook(
  workspace: string,
): Promise<{ process: ChildProcessWithoutNullStreams; origin: string }> {
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "review",
      "--workspace",
      workspace,
      "--port",
      "0",
      "--no-open",
    ],
    {
      cwd: repositoryRoot,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const origin = await new Promise<string>((resolveOrigin, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Voicebook did not start. ${stderr}`));
    }, 10_000);

    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Voicebook exited with ${code}. ${stderr}`));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const newline = stdout.indexOf("\n");
      if (newline === -1) {
        return;
      }
      clearTimeout(timeout);
      const ready = JSON.parse(stdout.slice(0, newline)) as {
        event: string;
        origin: string;
      };
      if (ready.event !== "ready") {
        reject(new Error(`Unexpected startup event: ${ready.event}`));
        return;
      }
      resolveOrigin(ready.origin);
    });
  });

  return { process: child, origin };
}

export async function stopVoicebook(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
  });
}
