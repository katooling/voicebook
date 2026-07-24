import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { cliPath, fixturePath, repositoryRoot } from "./harness.ts";
import { importEnvelope } from "./harness.ts";
import type { ImportEnvelope } from "../src/contracts.ts";

test("imports a normalized Source Message into a fresh workspace", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-test-"));

  try {
    const fixture = await readFile(fixturePath, "utf8");
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
        input: fixture,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      imported: 1,
      updated: 0,
      unchanged: 0,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("import retains only normalized Context and Material fields", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-payload-test-"));
  const clean: ImportEnvelope = {
    schemaVersion: 1,
    sourceMessages: [
      {
        sourceKey: "synthetic-chat:payload:001",
        publishedAt: "2025-02-03T09:30:00.000Z",
        text: "Synthetic message with Material metadata.",
        context: [],
        materials: [
          {
            ordinal: 1,
            kind: "image",
            role: "evidence",
            label: "Synthetic image",
            sourceReference: "synthetic-image-reference",
          },
        ],
      },
    ],
  };
  const withForbiddenPayload = structuredClone(clean) as unknown as {
    schemaVersion: 1;
    sourceMessages: Array<{
      context: Array<Record<string, unknown>>;
      materials: Array<Record<string, unknown>>;
    }>;
  };
  withForbiddenPayload.sourceMessages[0]!.context = [
    {
      position: "before",
      authorLabel: "Synthetic teammate",
      text: "Synthetic context.",
      attachmentBytes: "synthetic-forbidden-context-bytes",
    },
  ];
  clean.sourceMessages[0]!.context = [
    {
      position: "before",
      authorLabel: "Synthetic teammate",
      text: "Synthetic context.",
    },
  ];
  withForbiddenPayload.sourceMessages[0]!.materials[0]!.attachmentBytes =
    "synthetic-forbidden-bytes";
  withForbiddenPayload.sourceMessages[0]!.materials[0]!.credential =
    "synthetic-forbidden-credential";

  try {
    assert.deepEqual(
      importEnvelope(
        workspace,
        withForbiddenPayload as unknown as ImportEnvelope,
      ),
      { imported: 1, updated: 0, unchanged: 0 },
    );
    assert.deepEqual(importEnvelope(workspace, clean), {
      imported: 0,
      updated: 0,
      unchanged: 1,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
