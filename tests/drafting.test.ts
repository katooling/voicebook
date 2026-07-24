import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium, type Page } from "playwright-core";
import type { ImportEnvelope } from "../src/contracts.ts";
import {
  cliPath,
  importEnvelope,
  repositoryRoot,
  startVoicebook,
  stopVoicebook,
} from "./harness.ts";

test("Draft Run pins one Core-only Draft Brief and records one exact multiline proposal", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-drafting-"));
  importEnvelope(workspace, draftingCandidates());
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await acceptCandidate(
      page,
      "Could we verify the synthetic callback in the first screenshot before changing the worker configuration?",
    );
    await acceptCandidate(
      page,
      "I don't think the synthetic retry is the right fix. The linked evidence points to the handoff step.",
    );
    for (const text of syntheticFallbackMessages) {
      await acceptCandidate(page, text);
    }
    installProfile(workspace, "Synthetic profile: direct, careful, and evidence-led.");

    const request = draftRequest("synthetic-request-001");
    const started = runDraft(workspace, "start", request) as DraftStartReceipt;
    assert.match(started.runId, /^[0-9a-f-]{36}$/);
    assert.match(started.draftBrief, /^# Draft Brief/m);
    assert.match(started.draftBrief, /Profile status: Current/);
    assert.match(
      started.draftBrief,
      /Synthetic profile: direct, careful, and evidence-led\./,
    );
    assert.match(started.draftBrief, /one direct question/);
    assert.match(started.draftBrief, /first screenshot/);
    assert.match(started.draftBrief, /Tags: question, evidence/);
    assert.equal(
      started.draftBrief.match(/^### Example \d+$/gm)?.length,
      4,
      "the Draft Brief must keep the deterministic Core selection small",
    );
    assert.doesNotMatch(
      started.draftBrief,
      /Synthetic pending Candidate|Synthetic private Slack Context/,
    );

    assert.deepEqual(
      runDraft(workspace, "start", request),
      started,
      "an exact start retry must return the pinned run",
    );

    await page.goto(`${server.origin}/core`);
    await page.getByRole("button", { name: "Pin", exact: true }).first().click();
    assert.deepEqual(
      runDraft(workspace, "start", request),
      started,
      "later Core changes must not alter an existing Draft Run",
    );
    const staleRun = runDraft(workspace, "start", {
      ...request,
      requestKey: "synthetic-request-002",
    }) as DraftStartReceipt;
    assert.match(staleRun.draftBrief, /Profile status: Stale/);
    assert.match(
      staleRun.draftBrief,
      /Synthetic profile: direct, careful, and evidence-led\./,
      "a new run may use the last usable stale profile",
    );

    const proposal =
      "Could we verify the callback in the first screenshot?\n\nIf it is missing, I would check the handoff step before changing retries.";
    const finished = runDraft(workspace, "finish", {
      schemaVersion: 1,
      runId: started.runId,
      text: proposal,
    }) as DraftFinishReceipt;
    assert.equal(finished.runId, started.runId);
    assert.equal(finished.status, "recorded");
    assert.match(finished.recordedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(
      runDraft(workspace, "finish", {
        schemaVersion: 1,
        runId: started.runId,
        text: proposal,
      }),
      finished,
      "an exact finish retry must return the original receipt",
    );
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Draft Run rejects reused request keys and a different second proposal", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-draft-conflict-"));
  importEnvelope(workspace, draftingCandidates());
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await acceptCandidate(
      page,
      "Could we verify the synthetic callback in the first screenshot before changing the worker configuration?",
    );
    const request = draftRequest("synthetic-request-conflict");
    const missingProfile = runDraftFailure(workspace, "start", request);
    assert.equal(missingProfile.code, "VOICE_PROFILE_MISSING");

    installProfile(workspace, "Synthetic conflict-test profile.");
    const started = runDraft(workspace, "start", request) as DraftStartReceipt;
    const requestConflict = runDraftFailure(workspace, "start", {
      ...request,
      objective: "Write a different synthetic update.",
    });
    assert.equal(requestConflict.code, "DRAFT_REQUEST_CONFLICT");

    runDraft(workspace, "finish", {
      schemaVersion: 1,
      runId: started.runId,
      text: "Synthetic first exact proposal.",
    });
    const finishConflict = runDraftFailure(workspace, "finish", {
      schemaVersion: 1,
      runId: started.runId,
      text: "Synthetic different second proposal.",
    });
    assert.equal(finishConflict.code, "DRAFT_ALREADY_FINISHED");
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

type DraftStartReceipt = {
  runId: string;
  draftBrief: string;
};

type DraftFinishReceipt = {
  runId: string;
  status: "recorded";
  recordedAt: string;
};

async function acceptCandidate(page: Page, text: string): Promise<void> {
  await page.goto(`${new URL(page.url()).origin}/?q=${encodeURIComponent(text)}`);
  await page
    .locator("article", { hasText: text })
    .getByRole("button", { name: "Accept", exact: true })
    .click();
}

function installProfile(workspace: string, text: string): void {
  const prepared = runCli(workspace, ["profile", "prepare"], undefined);
  const coreRevision = (JSON.parse(prepared.stdout) as { coreRevision: string })
    .coreRevision;
  const result = runCli(
    workspace,
    ["profile", "submit", "--stdin"],
    JSON.stringify({
      schemaVersion: 1,
      basisRevision: coreRevision,
      text,
    }),
  );
  assert.equal(result.status, 0, result.stderr);
}

function draftRequest(requestKey: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    requestKey,
    objective: "Ask whether the synthetic callback evidence is safe to rely on.",
    audience: "Synthetic service owners",
    situation: "A callback is absent after the worker reports completion.",
    constraints: ["one direct question", "mention the visible evidence"],
    destination: "#synthetic-review",
    thread: "synthetic-thread",
    currentMaterials: [
      {
        kind: "image",
        role: "evidence",
        description: "Current screenshot of the missing callback",
      },
    ],
  };
}

function draftingCandidates(): ImportEnvelope {
  return {
    schemaVersion: 1,
    sourceMessages: [
      {
        sourceKey: "synthetic:draft:question",
        publishedAt: "2025-05-01T10:00:00.000Z",
        text:
          "Could we verify the synthetic callback in the first screenshot before changing the worker configuration?",
        context: [
          {
            position: "before",
            authorLabel: "Synthetic teammate",
            text: "Synthetic private Slack Context.",
          },
        ],
        materials: [
          {
            ordinal: 1,
            kind: "image",
            role: "evidence",
            label: "First screenshot",
          },
        ],
      },
      {
        sourceKey: "synthetic:draft:disagreement",
        publishedAt: "2025-05-02T10:00:00.000Z",
        text:
          "I don't think the synthetic retry is the right fix. The linked evidence points to the handoff step.",
        context: [],
        materials: [
          {
            ordinal: 1,
            kind: "link",
            role: "reference",
            label: "Synthetic evidence",
          },
        ],
      },
      {
        sourceKey: "synthetic:draft:pending",
        publishedAt: "2025-05-03T10:00:00.000Z",
        text: "Synthetic pending Candidate must stay out.",
        context: [],
        materials: [],
      },
      ...syntheticFallbackMessages.map((text, index) => ({
        sourceKey: `synthetic:draft:fallback:${index + 1}`,
        publishedAt: `2025-05-0${index + 4}T10:00:00.000Z`,
        text,
        context: [],
        materials: [],
      })),
    ],
  };
}

const syntheticFallbackMessages = [
  "Synthetic routine update alpha is ready for review.",
  "Synthetic routine update beta is ready for review.",
  "Synthetic routine update gamma is ready for review.",
  "Synthetic routine update delta is ready for review.",
];

function runDraft(
  workspace: string,
  operation: "start" | "finish",
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result = runCli(
    workspace,
    ["draft", operation, "--stdin"],
    JSON.stringify(input),
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function runDraftFailure(
  workspace: string,
  operation: "start" | "finish",
  input: Record<string, unknown>,
): { code: string; message: string } {
  const result = runCli(
    workspace,
    ["draft", operation, "--stdin"],
    JSON.stringify(input),
  );
  assert.equal(result.status, 3, result.stdout);
  return JSON.parse(result.stderr) as { code: string; message: string };
}

function runCli(
  workspace: string,
  args: string[],
  input: string | undefined,
) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      ...args,
      "--workspace",
      workspace,
    ],
    {
      cwd: repositoryRoot,
      input,
      encoding: "utf8",
    },
  );
}
