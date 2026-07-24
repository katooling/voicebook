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

test("Codex prepares only accepted Core Messages and submits an inspectable Voice Profile", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-profile-"));
  importEnvelope(workspace, profileCandidates());
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await acceptCandidate(page, "Synthetic accepted profile evidence.");

    assert.deepEqual(runProfile(workspace, ["status"]), {
      status: "missing",
      coreRevision: "1",
      activeProfile: null,
    });

    const prepared = runProfile(workspace, ["prepare"]) as {
      coreRevision: string;
      coreMessages: Array<{
        text: string;
        pinned: boolean;
        materials: unknown[];
      }>;
    };
    assert.equal(prepared.coreRevision, "1");
    assert.deepEqual(
      prepared.coreMessages.map((message) => message.text),
      ["Synthetic accepted profile evidence."],
    );
    assert.doesNotMatch(
      JSON.stringify(prepared),
      /Synthetic pending message|Synthetic surrounding Context/,
    );

    const submitted = submitProfile(
      workspace,
      prepared.coreRevision,
      "Synthetic Voice Profile: concise, direct, and evidence-led.",
    );
    assert.equal(submitted.status, "current");
    assert.equal(submitted.coreRevision, "1");
    assert.equal(
      submitted.activeProfile?.text,
      "Synthetic Voice Profile: concise, direct, and evidence-led.",
    );

    await page.goto(`${server.origin}/core`);
    await page.getByText("Voice Profile: Current", { exact: true }).waitFor();
    await page
      .getByText(
        "Synthetic Voice Profile: concise, direct, and evidence-led.",
        { exact: true },
      )
      .waitFor();
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Core mutations make the profile stale and stale submission preserves the last usable profile", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-profile-stale-"));
  importEnvelope(workspace, profileCandidates());
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await acceptCandidate(page, "Synthetic accepted profile evidence.");
    const initial = runProfile(workspace, ["prepare"]) as {
      coreRevision: string;
    };
    submitProfile(
      workspace,
      initial.coreRevision,
      "Synthetic last usable Voice Profile.",
    );

    await page.goto(`${server.origin}/core`);
    await page.getByRole("button", { name: "Pin", exact: true }).click();
    const stale = runProfile(workspace, ["status"]) as ProfileStatus;
    assert.equal(stale.status, "stale");
    assert.equal(stale.coreRevision, "2");
    assert.equal(
      stale.activeProfile?.text,
      "Synthetic last usable Voice Profile.",
    );
    assert.equal(stale.activeProfile?.basisRevision, "1");
    assert.match(stale.activeProfile?.createdAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

    const failed = submitProfileFailure(
      workspace,
      initial.coreRevision,
      "Synthetic stale replacement that must not become active.",
    );
    assert.equal(failed.code, "CORE_CHANGED");
    assert.match(failed.message, /Voice Core changed/);

    const afterFailure = runProfile(workspace, ["status"]) as ProfileStatus;
    assert.equal(afterFailure.status, "stale");
    assert.equal(afterFailure.coreRevision, "2");
    assert.equal(
      afterFailure.activeProfile?.text,
      "Synthetic last usable Voice Profile.",
    );

    const prepared = runProfile(workspace, ["prepare"]) as {
      coreRevision: string;
    };
    submitProfile(
      workspace,
      prepared.coreRevision,
      "Synthetic refreshed Voice Profile.",
    );
    await page.goto(`${server.origin}/core`);
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    const afterRemoval = runProfile(workspace, ["status"]) as ProfileStatus;
    assert.equal(afterRemoval.status, "stale");
    assert.equal(afterRemoval.coreRevision, "3");
    assert.equal(
      afterRemoval.activeProfile?.text,
      "Synthetic refreshed Voice Profile.",
    );
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("correcting Core tags makes the profile stale until Codex refreshes it", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-profile-tags-"));
  importEnvelope(workspace, profileCandidates());
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await acceptCandidate(page, "Synthetic accepted profile evidence.");
    const initial = runProfile(workspace, ["prepare"]) as {
      coreRevision: string;
    };
    submitProfile(
      workspace,
      initial.coreRevision,
      "Synthetic profile before tag correction.",
    );

    await page.goto(`${server.origin}/core`);
    await page.getByLabel("Edit context").fill("question, clarification");
    await page.getByRole("button", { name: "Save tags" }).click();

    const stale = runProfile(workspace, ["status"]) as ProfileStatus;
    assert.equal(stale.status, "stale");
    assert.equal(
      stale.activeProfile?.text,
      "Synthetic profile before tag correction.",
    );

    const refreshed = runProfile(workspace, ["prepare"]) as {
      coreRevision: string;
    };
    const current = submitProfile(
      workspace,
      refreshed.coreRevision,
      "Synthetic profile after tag correction.",
    );
    assert.equal(current.status, "current");
    assert.equal(
      current.activeProfile?.text,
      "Synthetic profile after tag correction.",
    );
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

type ProfileStatus = {
  status: "missing" | "current" | "stale";
  coreRevision: string;
  activeProfile: null | {
    text: string;
    basisRevision: string;
    createdAt: string;
  };
};

async function acceptCandidate(page: Page, text: string): Promise<void> {
  await page
    .locator("article", { hasText: text })
    .getByRole("button", { name: "Accept", exact: true })
    .click();
}

function profileCandidates(): ImportEnvelope {
  return {
    schemaVersion: 1,
    sourceMessages: [
      {
        sourceKey: "synthetic:profile:accepted",
        publishedAt: "2025-04-01T10:00:00.000Z",
        text: "Synthetic accepted profile evidence.",
        context: [
          {
            position: "before",
            authorLabel: "Synthetic teammate",
            text: "Synthetic surrounding Context.",
          },
        ],
        materials: [
          {
            ordinal: 1,
            kind: "link",
            role: "evidence",
            label: "Synthetic evidence",
          },
        ],
      },
      {
        sourceKey: "synthetic:profile:pending",
        publishedAt: "2025-04-02T10:00:00.000Z",
        text: "Synthetic pending message.",
        context: [],
        materials: [],
      },
    ],
  };
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

function submitProfile(
  workspace: string,
  basisRevision: string,
  text: string,
): ProfileStatus {
  const result = spawnProfileSubmission(workspace, basisRevision, text);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as ProfileStatus;
}

function submitProfileFailure(
  workspace: string,
  basisRevision: string,
  text: string,
): { code: string; message: string } {
  const result = spawnProfileSubmission(workspace, basisRevision, text);
  assert.equal(result.status, 3, result.stdout);
  return JSON.parse(result.stderr) as { code: string; message: string };
}

function spawnProfileSubmission(
  workspace: string,
  basisRevision: string,
  text: string,
) {
  return spawnSync(
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
        basisRevision,
        text,
      }),
      encoding: "utf8",
    },
  );
}
