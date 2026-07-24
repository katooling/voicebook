import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";
import type { ImportEnvelope } from "../src/contracts.ts";
import {
  importEnvelope,
  repositoryRoot,
  startVoicebook,
  stopVoicebook,
} from "./harness.ts";

const queueFixturePath = join(
  repositoryRoot,
  "tests",
  "fixtures",
  "suggested-queue.json",
);

test("Suggested Queue is deterministic and deprioritized Candidates remain searchable", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-queue-"));
  const fixture = JSON.parse(
    await readFile(queueFixturePath, "utf8"),
  ) as ImportEnvelope;
  importEnvelope(workspace, fixture);
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await page.getByRole("heading", { name: "Suggested Queue" }).waitFor();

    const expectedMessages = [
      "Synthetic explanation candidate: the refresh completes before the cache entry becomes visible because the worker publishes its result in a later step. This means changing the request timeout would hide the ordering problem instead of resolving it.",
      "Could we verify the synthetic callback marker before changing the worker configuration?",
      "I don't think the synthetic retry is the right fix. The evidence points to the handoff step, not the request step.",
      "Synthetic reference details are available in the linked runbook.",
      "The first synthetic screenshot shows the completed request, while the second shows the missing callback.",
    ];
    const visibleMessages = await page.locator("article .message").allTextContents();
    assert.deepEqual(visibleMessages, expectedMessages);

    await page.reload();
    assert.deepEqual(
      await page.locator("article .message").allTextContents(),
      expectedMessages,
    );
    assert.deepEqual(
      await page.locator("[data-ranking-reason]").allTextContents(),
      [
        "Explanation",
        "Question",
        "Disagreement",
        "Linked reference",
        "Screenshot evidence",
      ],
    );

    await page.getByLabel("Search Candidates").fill("Sounds good");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("heading", { name: "Search results" }).waitFor();
    await page.getByText("Sounds good", { exact: true }).waitFor();
    assert.equal(await page.locator("article").count(), 1);

    await page
      .getByLabel("Search Candidates")
      .fill("before we change the worker configuration");
    await page.getByRole("button", { name: "Search" }).click();
    await page
      .getByText(
        "Could we verify the synthetic callback marker before we change the worker configuration?",
        { exact: true },
      )
      .waitFor();
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("suggested contextual tags never block acceptance and Core corrections persist", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-core-tags-"));
  const fixture = JSON.parse(
    await readFile(queueFixturePath, "utf8"),
  ) as ImportEnvelope;
  importEnvelope(workspace, fixture);
  let server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    const question = page.locator("article", {
      hasText:
        "Could we verify the synthetic callback marker before changing the worker configuration?",
    });
    await question.getByText("question", { exact: true }).waitFor();
    await question.getByRole("button", { name: "Accept", exact: true }).click();

    await page.getByRole("link", { name: "Core" }).click();
    const tagInput = page.getByLabel("Edit context");
    assert.equal(await tagInput.inputValue(), "question");

    await tagInput.fill("clarification, evidence");
    await page.getByRole("button", { name: "Save tags" }).click();
    assert.deepEqual(
      await page.locator(".contextual-tags .tag").allTextContents(),
      ["clarification", "evidence"],
    );

    await stopVoicebook(server.process);
    server = await startVoicebook(workspace);
    await page.goto(`${server.origin}/core`);
    assert.deepEqual(
      await page.locator(".contextual-tags .tag").allTextContents(),
      ["clarification", "evidence"],
    );
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("queue suggestions and tags stored on acceptance stay in parity", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-tag-parity-"));
  const fixture = JSON.parse(
    await readFile(queueFixturePath, "utf8"),
  ) as ImportEnvelope;
  importEnvelope(workspace, fixture);
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });
  const examples = [
    {
      search: "refresh completes",
      text: fixture.sourceMessages[0]!.text,
      tags: ["explanation"],
    },
    {
      search: "callback marker before changing",
      text: fixture.sourceMessages[1]!.text,
      tags: ["question"],
    },
    {
      search: "retry is the right fix",
      text: fixture.sourceMessages[2]!.text,
      tags: ["disagreement"],
    },
    {
      search: "review the synthetic maintenance",
      text: fixture.sourceMessages[9]!.text,
      tags: ["request"],
    },
    {
      search: "first synthetic screenshot",
      text: fixture.sourceMessages[4]!.text,
      tags: ["evidence"],
    },
  ];

  try {
    const page = await browser.newPage();
    for (const example of examples) {
      await page.goto(`${server.origin}/?q=${encodeURIComponent(example.search)}`);
      const candidate = page.locator("article", { hasText: example.text });
      assert.deepEqual(
        await candidate.locator("[data-suggested-tag]").allTextContents(),
        example.tags,
      );
      await candidate
        .getByRole("button", { name: "Accept", exact: true })
        .click();
    }

    await page.goto(`${server.origin}/core`);
    for (const example of examples) {
      const coreMessage = page.locator("article", { hasText: example.text });
      assert.deepEqual(
        await coreMessage.locator(".contextual-tags .tag").allTextContents(),
        example.tags,
      );
    }
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});
