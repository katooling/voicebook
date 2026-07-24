import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import type { ImportEnvelope } from "../src/contracts.ts";
import {
  importEnvelope,
  importFixture,
  startVoicebook,
  stopVoicebook,
} from "./harness.ts";

test("Inbox shows verbatim Candidate text with separate context and ordered Materials", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-browser-"));
  await importFixture(workspace);
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);

    await page.getByRole("heading", { name: "Inbox" }).waitFor();
    await page
      .getByText(
        "I think the second screenshot points to a different problem. The request completes in the first image, while the callback is missing in the second. Can we verify the callback logs before changing the request flow?",
        { exact: true },
      )
      .waitFor();
    await page.getByRole("heading", { name: "Slack Context" }).waitFor();
    await page
      .getByText("Could the request flow be timing out?", { exact: true })
      .waitFor();

    const materials = await page.locator("[data-material-ordinal]").allTextContents();
    assert.deepEqual(
      materials.map((text) => text.replace(/\s+/g, " ").trim()),
      [
        "1 Link · reference Synthetic request trace (source: synthetic-file-link-001)",
        "2 Image · evidence Completed request (source: synthetic-image-001)",
        "3 Image · evidence Missing callback (source: synthetic-image-002)",
      ],
    );
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Voice Owner accepts a Candidate into the Voice Core without entering tags", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-accept-"));
  await importFixture(workspace);
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Accept", exact: true }).click();

    await page.getByText("No pending Candidates found.").waitFor();
    await page.getByRole("link", { name: "Core" }).click();
    await page.getByRole("heading", { name: "Voice Core" }).waitFor();
    await page
      .getByText(
        "I think the second screenshot points to a different problem. The request completes in the first image, while the callback is missing in the second. Can we verify the callback logs before changing the request flow?",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.getByLabel("Tags").count(), 0);
    await page.getByRole("button", { name: "Pin", exact: true }).click();
    await page.getByText("Pinned", { exact: true }).waitFor();
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Voice Owner can pin, reject, and mark Candidates sensitive", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-decisions-"));
  importEnvelope(workspace, decisionFixture());
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);

    await page
      .locator("article", { hasText: "Synthetic pin candidate" })
      .getByRole("button", { name: "Pin to Core" })
      .click();
    await page
      .locator("article", { hasText: "Synthetic reject candidate" })
      .getByRole("button", { name: "Reject" })
      .click();
    await page
      .locator("article", { hasText: "Synthetic sensitive candidate" })
      .getByRole("button", { name: "Sensitive" })
      .click();

    await page.getByText("No pending Candidates found.").waitFor();
    await page.getByRole("link", { name: "Core" }).click();
    await page.getByText("Synthetic pin candidate", { exact: true }).waitFor();
    await page.getByText("Pinned", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Synthetic reject candidate", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .getByText("Synthetic sensitive candidate", { exact: true })
        .count(),
      0,
    );
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Core search keeps accepted text stable across source changes and supports removal", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-stable-core-"));
  await importFixture(workspace);
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Accept", exact: true }).click();

    const updateResult = importEnvelope(workspace, {
      schemaVersion: 1,
      sourceMessages: [
        {
          sourceKey: "synthetic-chat:work-room:message-001",
          publishedAt: "2025-02-03T09:30:00.000Z",
          text: "A simulated source edit that must not replace the Core Message.",
          context: [],
          materials: [],
        },
      ],
    });
    assert.deepEqual(updateResult, { imported: 0, updated: 1, unchanged: 0 });

    await page.getByRole("link", { name: "Core" }).click();
    await page.getByLabel("Search Voice Core").fill("callback logs");
    await page.getByRole("button", { name: "Search" }).click();
    await page
      .getByText(
        "I think the second screenshot points to a different problem. The request completes in the first image, while the callback is missing in the second. Can we verify the callback logs before changing the request flow?",
        { exact: true },
      )
      .waitFor();

    await page.getByLabel("Search Voice Core").fill("simulated source edit");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByText("No Core Messages found.").waitFor();

    await page.getByLabel("Search Voice Core").fill("");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByText("No Core Messages found.").waitFor();
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("stale review cannot promote a Candidate version the Voice Owner did not see", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-stale-review-"));
  await importFixture(workspace);
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Accept", exact: true }).waitFor();

    assert.deepEqual(
      importEnvelope(workspace, {
        schemaVersion: 1,
        sourceMessages: [
          {
            sourceKey: "synthetic-chat:work-room:message-001",
            publishedAt: "2025-02-03T09:30:00.000Z",
            text: "A newer synthetic version that was not displayed.",
            context: [],
            materials: [],
          },
        ],
      }),
      { imported: 0, updated: 1, unchanged: 0 },
    );

    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith("/candidates/1/accept"),
    );
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    assert.equal((await responsePromise).status(), 409);
    await page
      .getByText("Candidate changed. Refresh and review the latest version.")
      .waitFor();

    await page.goto(`${server.origin}/core`);
    await page.getByText("No Core Messages found.").waitFor();

    await page.goto(server.origin);
    await page
      .getByText("A newer synthetic version that was not displayed.", {
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await page.getByRole("link", { name: "Core" }).click();
    await page
      .getByText("A newer synthetic version that was not displayed.", {
        exact: true,
      })
      .waitFor();
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

function decisionFixture(): ImportEnvelope {
  return {
    schemaVersion: 1,
    sourceMessages: [
      "Synthetic pin candidate",
      "Synthetic reject candidate",
      "Synthetic sensitive candidate",
    ].map((text, index) => ({
      sourceKey: `synthetic-chat:decision:${index + 1}`,
      publishedAt: `2025-02-0${index + 1}T09:30:00.000Z`,
      text,
      context: [],
      materials: [],
    })),
  };
}
