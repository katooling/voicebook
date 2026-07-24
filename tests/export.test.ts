import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";
import type { ImportEnvelope } from "../src/contracts.ts";
import {
  cliPath,
  importEnvelope,
  repositoryRoot,
  startVoicebook,
  stopVoicebook,
} from "./harness.ts";

const coreText =
  "Synthetic Core Message verbatim.\nSYNTHETIC_SOURCE_REFERENCE_IN_TEXT_ALLOWED\n```synthetic marker```";
const profileText =
  "Synthetic active Voice Profile: concise, direct, and evidence-led.";

test("manual export is deterministic, private, portable, and excludes operational data", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-export-"));

  try {
    await prepareVoicebook(workspace);

    const first = runExport(workspace, []);
    const defaultOutput = join(
      workspace,
      "exports",
      "voicebook-private-backup.md",
    );
    assert.equal(first.output, defaultOutput);
    assert.match(first.warning, /sensitive private backup/i);
    const firstBytes = await readFile(defaultOutput);

    const secondOutput = join(workspace, "second-private-backup.md");
    const second = runExport(workspace, ["--output", secondOutput]);
    assert.equal(second.output, secondOutput);
    const secondBytes = await readFile(secondOutput);
    assert.deepEqual(secondBytes, firstBytes);
    assert.equal(second.bytes, firstBytes.length);

    const backup = firstBytes.toString("utf8");
    assert.match(backup, /^# Voicebook Private Backup/m);
    assert.match(
      backup,
      /Sensitive private backup\. This file is not sanitized for sharing\./,
    );
    assert.match(backup, /## Active Voice Profile/);
    assert.match(backup, new RegExp(escapeRegExp(profileText)));
    assert.match(backup, /## Voice Core/);
    assert.match(backup, new RegExp(escapeRegExp(coreText)));
    assert.match(backup, /````text\nSynthetic Core Message/);
    assert.match(backup, /Contextual tags: clarification, evidence/);
    assert.match(backup, /"ordinal": 1/);
    assert.match(backup, /"kind": "link"/);
    assert.match(backup, /"url": "https:\/\/example\.invalid\/export\/evidence"/);
    assert.match(backup, /"ordinal": 2/);
    assert.match(backup, /"kind": "image"/);
    assert.match(backup, /SYNTHETIC_SOURCE_REFERENCE_IN_TEXT_ALLOWED/);

    for (const forbidden of [
      "FORBIDDEN_PENDING_CANDIDATE",
      "FORBIDDEN_SLACK_CONTEXT",
      "FORBIDDEN_DB_ONLY_SOURCE_KEY",
      "FORBIDDEN_SOURCE_REFERENCE",
      "FORBIDDEN_ATTACHMENT_BYTES",
      "FORBIDDEN_CREDENTIAL",
      "FORBIDDEN_DRAFT_OBJECTIVE",
      "FORBIDDEN_DRAFT_PROPOSAL",
      "source_key",
      "voice_core_state",
      "Draft Run",
      "Draft Record",
    ]) {
      assert.doesNotMatch(backup, new RegExp(forbidden));
    }

    assert.equal((await stat(defaultOutput)).mode & 0o777, 0o600);
    assert.equal((await stat(join(workspace, "exports"))).mode & 0o777, 0o700);

    const ignored = spawnSync("git", ["check-ignore", "-q", "exports/proof.md"], {
      cwd: repositoryRoot,
    });
    assert.equal(ignored.status, 0, "exports/ must remain ignored by Git");

    const insideGit = join(
      repositoryRoot,
      "exports",
      `issue-8-private-backup-${process.pid}.md`,
    );
    const rejected = runExportResult(workspace, ["--output", insideGit]);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /outside every Git worktree/i);
    await assert.rejects(stat(insideGit), { code: "ENOENT" });

    const directoryAsOutput = join(workspace, "directory-is-not-a-file");
    await mkdir(directoryAsOutput);
    const writeFailure = runExportResult(workspace, [
      "--output",
      directoryAsOutput,
    ]);
    assert.equal(writeFailure.status, 2);
    assert.deepEqual(await readdir(directoryAsOutput), []);
    assert.equal(
      (await readdir(workspace)).some((name) => name.endsWith(".tmp")),
      false,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("an export preparation error leaves the destination and directory untouched", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-export-empty-"));
  const destinationDirectory = await mkdtemp(
    join(tmpdir(), "voicebook-export-destination-"),
  );
  const output = join(destinationDirectory, "existing-private-backup.md");
  const original = "ORIGINAL_PRIVATE_BACKUP\n";
  await writeFile(output, original, { mode: 0o600 });

  try {
    const result = runExportResult(workspace, ["--output", output]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires an active Voice Profile/i);
    assert.equal(await readFile(output, "utf8"), original);
    assert.deepEqual(await readdir(destinationDirectory), [
      "existing-private-backup.md",
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(destinationDirectory, { recursive: true, force: true });
  }
});

async function prepareVoicebook(workspace: string): Promise<void> {
  importEnvelope(workspace, exportFixture());
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(
      `${server.origin}/?q=${encodeURIComponent("Synthetic Core Message verbatim")}`,
    );
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await page.goto(`${server.origin}/core`);
    await page.getByLabel("Edit context").fill("clarification, evidence");
    await page.getByRole("button", { name: "Save tags" }).click();
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
  }

  injectForbiddenStoredMaterialFields(workspace);

  const prepared = runProfile(workspace, ["prepare"]) as {
    coreRevision: string;
  };
  const submitted = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "profile",
      "submit",
      "--workspace",
      workspace,
      "--stdin",
    ],
    {
      cwd: repositoryRoot,
      input: JSON.stringify({
        schemaVersion: 1,
        basisRevision: prepared.coreRevision,
        text: profileText,
      }),
      encoding: "utf8",
    },
  );
  assert.equal(submitted.status, 0, submitted.stderr);

  const started = runDraft(workspace, "start", {
    schemaVersion: 1,
    requestKey: "synthetic-export-private-boundary",
    objective: "FORBIDDEN_DRAFT_OBJECTIVE",
    constraints: [],
    currentMaterials: [],
  }) as { runId: string };
  runDraft(workspace, "finish", {
    schemaVersion: 1,
    runId: started.runId,
    text: "FORBIDDEN_DRAFT_PROPOSAL",
  });
}

function exportFixture(): ImportEnvelope {
  return {
    schemaVersion: 1,
    sourceMessages: [
      {
        sourceKey: "FORBIDDEN_DB_ONLY_SOURCE_KEY",
        publishedAt: "2025-05-01T10:00:00.000Z",
        text: coreText,
        context: [
          {
            position: "before",
            authorLabel: "Synthetic teammate",
            text: "FORBIDDEN_SLACK_CONTEXT",
          },
        ],
        materials: [
          {
            ordinal: 2,
            kind: "image",
            role: "evidence",
            label: "Synthetic screenshot evidence",
            sourceReference: "FORBIDDEN_SOURCE_REFERENCE",
            ...({
              attachmentBytes: "FORBIDDEN_ATTACHMENT_BYTES",
              credential: "FORBIDDEN_CREDENTIAL",
            } as Record<string, unknown>),
          },
          {
            ordinal: 1,
            kind: "link",
            role: "reference",
            label: "Synthetic linked evidence",
            url: "https://example.invalid/export/evidence",
            sourceReference: "FORBIDDEN_SOURCE_REFERENCE",
          },
        ],
      },
      {
        sourceKey: "synthetic:export:pending",
        publishedAt: "2025-05-02T10:00:00.000Z",
        text: "FORBIDDEN_PENDING_CANDIDATE",
        context: [],
        materials: [],
      },
    ],
  };
}

function injectForbiddenStoredMaterialFields(workspace: string): void {
  const database = new DatabaseSync(join(workspace, "voicebook.sqlite"));
  try {
    database
      .prepare(`
        UPDATE core_messages
        SET materials_json = json_set(
          materials_json,
          '$[0].attachmentBytes', 'FORBIDDEN_ATTACHMENT_BYTES',
          '$[0].credential', 'FORBIDDEN_CREDENTIAL'
        )
      `)
      .run();
  } finally {
    database.close();
  }
}

function runProfile(
  workspace: string,
  args: string[],
): Record<string, unknown> {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "profile",
      ...args,
      "--workspace",
      workspace,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function runDraft(
  workspace: string,
  operation: "start" | "finish",
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "draft",
      operation,
      "--workspace",
      workspace,
      "--stdin",
    ],
    {
      cwd: repositoryRoot,
      input: JSON.stringify(input),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function runExport(
  workspace: string,
  args: string[],
): { output: string; bytes: number; warning: string } {
  const result = runExportResult(workspace, args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as {
    output: string;
    bytes: number;
    warning: string;
  };
}

function runExportResult(
  workspace: string,
  args: string[],
): SpawnSyncReturns<string> {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "export",
      "--workspace",
      workspace,
      ...args,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
