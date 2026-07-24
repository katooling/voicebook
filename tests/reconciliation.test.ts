import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium, type Page } from "playwright-core";
import type { ImportEnvelope, Material } from "../src/contracts.ts";
import type {
  SyncPageEnvelope,
  SyncReceipt,
  SyncSourceMessage,
} from "../src/sync/contracts.ts";
import {
  cliPath,
  importEnvelope,
  repositoryRoot,
  startVoicebook,
  stopVoicebook,
} from "./harness.ts";

test("later sync labels unmatched Source Messages Manual and one supported canonical match Agent", async () => {
  const workspace = await setupWorkspace("origin-exact");
  assert.equal(
    originStatus(workspace, "synthetic:origin-exact:core-seed").origin,
    "unknown",
    "a Source Message is not Manual until reconciliation actually finds no match",
  );
  const exactDraft =
    "Could we verify the synthetic callback?\n\nEvidence: https://example.invalid/run?case=1";
  recordDraft(workspace, "synthetic-exact-run", exactDraft, {
    destination: "synthetic-channel",
    thread: "synthetic-thread",
  });
  const publishedAt = soon();
  const page = syncPage("exact-page", [
    sourceMessage({
      sourceKey: "synthetic:origin:exact",
      publishedAt,
      text:
        "  Could  we verify the synthetic callback?\r\n\r\nEvidence: <https://example.invalid/run?case=1>  ",
      threadKey: "synthetic-thread",
    }),
    sourceMessage({
      sourceKey: "synthetic:origin:manual",
      publishedAt,
      text: "Synthetic manual update written in the normal workflow.",
    }),
  ]);

  try {
    const receipt = runSync(workspace, page);
    assert.deepEqual(runSync(workspace, page), receipt);
    const exact = originStatus(workspace, "synthetic:origin:exact");
    assert.equal(exact.origin, "agent");
    assert.equal(exact.rationale, "unique-supported-exact");
    assert.equal(exact.canonicalizerVersion, "source-format-v2");
    assert.equal(exact.matcherVersion, "composition-v2");

    const manual = originStatus(workspace, "synthetic:origin:manual");
    assert.equal(manual.origin, "manual");
    assert.equal(manual.rationale, "no-plausible-draft");

    const server = await startVoicebook(workspace);
    const browser = await chromium.launch({ headless: true });
    try {
      const pageView = await browser.newPage();
      await searchCandidate(pageView, server.origin, "synthetic callback");
      await pageView
        .getByText("Composition Origin: Agent", { exact: true })
        .waitFor();
      await searchCandidate(pageView, server.origin, "normal workflow");
      await pageView
        .getByText("Composition Origin: Manual", { exact: true })
        .waitFor();
      await pageView.goto(`${server.origin}/core`);
      assert.doesNotMatch(await pageView.locator("body").innerText(), /synthetic callback/i);
    } finally {
      await browser.close();
      await stopVoicebook(server.process);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("a unique near match shows evidence and only a current browser confirmation makes it Mixed", async () => {
  const workspace = await setupWorkspace("origin-mixed");
  const draft =
    "Could you check the synthetic callback before we change the retry setting?";
  recordDraft(workspace, "synthetic-near-run", draft, {
    destination: "synthetic-channel",
    thread: "synthetic-thread",
    currentMaterials: [{ kind: "image", role: "evidence" }],
  });
  const sourceKey = "synthetic:origin:near";
  runSync(
    workspace,
    syncPage("near-page", [
      sourceMessage({
        sourceKey,
        publishedAt: soon(),
        text:
          "Could you check the synthetic callback before we change the retry settings?",
        threadKey: "synthetic-thread",
        materials: [{ ordinal: 1, kind: "image", role: "evidence" }],
      }),
    ]),
  );

  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await searchCandidate(page, server.origin, "retry settings");
    await page.getByText("Mixed suggestion", { exact: true }).waitFor();
    await page.getByText("Destination matched", { exact: true }).waitFor();
    await page.getByText("Thread matched", { exact: true }).waitFor();
    await page.getByText("Ordered Materials matched", { exact: true }).waitFor();
    assert.ok((await page.locator("del, ins").count()) >= 1);
    const staleForm = page.locator(
      'form[action*="/composition-origin/"][action$="/confirm-mixed"]',
    );
    const staleAction = await staleForm.getAttribute("action");
    assert.ok(staleAction);
    const staleFields = await staleForm.locator("input").evaluateAll((inputs) =>
      Object.fromEntries(
        inputs.map((input) => [
          (input as HTMLInputElement).name,
          (input as HTMLInputElement).value,
        ]),
      ),
    );

    const editedSource = sourceMessage({
      sourceKey,
      publishedAt: soon(),
      text:
        "Could you please check the synthetic callback before we change the retry settings?",
      threadKey: "synthetic-thread",
      materials: [{ ordinal: 1, kind: "image", role: "evidence" }],
    });
    runSync(
      workspace,
      syncPage("near-edit-page", [
        editedSource,
      ]),
    );
    const staleResponse = await page.request.post(
      new URL(staleAction, server.origin).href,
      {
        headers: { Origin: server.origin },
        form: staleFields,
      },
    );
    assert.equal(staleResponse.status(), 409);
    assert.match(await staleResponse.text(), /changed.*refresh/i);

    await searchCandidate(page, server.origin, "please check");
    await page.getByRole("button", { name: "Confirm Mixed" }).click();
    await page
      .getByText("Composition Origin: Mixed", { exact: true })
      .waitFor();
    assert.equal(originStatus(workspace, sourceKey).origin, "mixed");
    runSync(
      workspace,
      syncPage("near-unchanged-page", [editedSource]),
    );
    assert.equal(
      originStatus(workspace, sourceKey).origin,
      "mixed",
      "an unchanged later sync must preserve the Voice Owner's confirmation",
    );

    await page.goto(`${server.origin}/core`);
    assert.doesNotMatch(await page.locator("body").innerText(), /retry settings/i);
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("generic, duplicate, old, and contradictory matches never overclaim Voicebook participation", async () => {
  const workspace = await setupWorkspace("origin-unknown");
  const duplicate =
    "Please verify the synthetic handoff before changing the worker configuration.";
  recordDraft(workspace, "synthetic-duplicate-a", duplicate);
  recordDraft(workspace, "synthetic-duplicate-b", duplicate);
  recordDraft(workspace, "synthetic-common", "Sure");
  const contradictory =
    "Please verify the synthetic destination before starting the operation.";
  recordDraft(workspace, "synthetic-wrong-destination", contradictory, {
    destination: "synthetic-other-channel",
  });
  const wrongThread =
    "Please verify the synthetic thread before starting the operation.";
  recordDraft(workspace, "synthetic-wrong-thread", wrongThread, {
    destination: "synthetic-channel",
    thread: "synthetic-other-thread",
  });
  const wrongMaterials =
    "Please verify the synthetic Material order before starting the operation.";
  recordDraft(workspace, "synthetic-wrong-materials", wrongMaterials, {
    destination: "synthetic-channel",
    currentMaterials: [
      { kind: "link", role: "reference" },
      { kind: "image", role: "evidence" },
    ],
  });
  const oldDraft =
    "Please verify the synthetic old record before starting the operation.";
  recordDraft(workspace, "synthetic-old-record", oldDraft);
  const labelledLinkDraft =
    "Please review <https://example.invalid/report|first synthetic report> before continuing.";
  recordDraft(workspace, "synthetic-labelled-link", labelledLinkDraft);
  const futureDraft =
    "Please verify the synthetic causal ordering before starting the operation.";
  recordDraft(workspace, "synthetic-future-record", futureDraft);

  try {
    runSync(
      workspace,
      syncPage("uncertain-page", [
        sourceMessage({
          sourceKey: "synthetic:origin:duplicate",
          publishedAt: soon(),
          text: duplicate,
        }),
        sourceMessage({
          sourceKey: "synthetic:origin:common",
          publishedAt: soon(),
          text: "Sure",
        }),
        sourceMessage({
          sourceKey: "synthetic:origin:wrong-destination",
          publishedAt: soon(),
          text: contradictory,
        }),
        sourceMessage({
          sourceKey: "synthetic:origin:wrong-thread",
          publishedAt: soon(),
          text: wrongThread,
          threadKey: "synthetic-thread",
        }),
        sourceMessage({
          sourceKey: "synthetic:origin:wrong-materials",
          publishedAt: soon(),
          text: wrongMaterials,
          materials: [
            { ordinal: 1, kind: "image", role: "evidence" },
            { ordinal: 2, kind: "link", role: "reference" },
          ],
        }),
        sourceMessage({
          sourceKey: "synthetic:origin:old",
          publishedAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          text: oldDraft,
        }),
        sourceMessage({
          sourceKey: "synthetic:origin:labelled-link",
          publishedAt: soon(),
          text:
            "Please review <https://example.invalid/report|second synthetic report> before continuing.",
        }),
        sourceMessage({
          sourceKey: "synthetic:origin:future-record",
          publishedAt: new Date(Date.now() - 60_000).toISOString(),
          text: futureDraft,
        }),
      ]),
    );

    assert.equal(
      originStatus(workspace, "synthetic:origin:duplicate").origin,
      "unknown",
    );
    assert.equal(
      originStatus(workspace, "synthetic:origin:common").origin,
      "unknown",
    );
    for (const suffix of [
      "wrong-destination",
      "wrong-thread",
      "wrong-materials",
    ]) {
      assert.ok(
        ["manual", "unknown"].includes(
          originStatus(workspace, `synthetic:origin:${suffix}`).origin,
        ),
      );
    }
    assert.equal(originStatus(workspace, "synthetic:origin:old").origin, "manual");
    assert.notEqual(
      originStatus(workspace, "synthetic:origin:labelled-link").origin,
      "agent",
      "different visible labels on the same URL must not collapse to an exact match",
    );
    assert.equal(
      originStatus(workspace, "synthetic:origin:future-record").origin,
      "manual",
      "a Draft Record created after publication cannot cause the Source Message",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

type OriginStatus = {
  sourceKey: string;
  origin: "manual" | "agent" | "mixed" | "unknown";
  rationale: string;
  sourceRevision: string;
  canonicalizerVersion: string;
  matcherVersion: string;
  suggestion: null | {
    score: number;
    draftText: string;
    evidence: string[];
    suggestionRevision: string;
  };
};

async function setupWorkspace(label: string): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), `voicebook-${label}-`));
  const seed: ImportEnvelope = {
    schemaVersion: 1,
    sourceMessages: [
      {
        sourceKey: `synthetic:${label}:core-seed`,
        publishedAt: "2025-01-01T00:00:00.000Z",
        text: "Could we verify the synthetic evidence before changing the configuration?",
        context: [],
        materials: [],
      },
    ],
  };
  importEnvelope(workspace, seed);
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Accept", exact: true }).click();
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
  }
  const prepared = runCli(workspace, ["profile", "prepare"]);
  const revision = (JSON.parse(prepared.stdout) as { coreRevision: string })
    .coreRevision;
  const profile = runCli(workspace, ["profile", "submit", "--stdin"], {
    schemaVersion: 1,
    basisRevision: revision,
    text: "Synthetic profile for Composition Origin tests.",
  });
  assert.equal(profile.status, 0, profile.stderr);
  return workspace;
}

function recordDraft(
  workspace: string,
  requestKey: string,
  text: string,
  hints: {
    destination?: string;
    thread?: string;
    currentMaterials?: Array<{
      kind: Material["kind"];
      role: Material["role"];
    }>;
  } = {},
): void {
  const started = runCli(workspace, ["draft", "start", "--stdin"], {
    schemaVersion: 1,
    requestKey,
    objective: "Write one synthetic test message.",
    constraints: [],
    currentMaterials: hints.currentMaterials ?? [],
    ...(hints.destination ? { destination: hints.destination } : {}),
    ...(hints.thread ? { thread: hints.thread } : {}),
  });
  assert.equal(started.status, 0, started.stderr);
  const runId = (JSON.parse(started.stdout) as { runId: string }).runId;
  const finished = runCli(workspace, ["draft", "finish", "--stdin"], {
    schemaVersion: 1,
    runId,
    text,
  });
  assert.equal(finished.status, 0, finished.stderr);
}

function syncPage(
  pageKey: string,
  sourceMessages: SyncSourceMessage[],
): SyncPageEnvelope {
  return {
    schemaVersion: 1,
    syncKey: "synthetic-reconciliation",
    pageKey,
    cursor: null,
    nextCursor: null,
    voiceOwnerAuthorKey: "synthetic-owner",
    scope: {
      windowStart: "2025-01-01T00:00:00.000Z",
      selectedConversationKeys: [
        "synthetic-channel",
        "synthetic-other-channel",
      ],
      optedInDirectMessageKeys: [],
      excludedConversationKeys: [],
    },
    sourceMessages,
  };
}

function sourceMessage(input: {
  sourceKey: string;
  publishedAt: string;
  text: string;
  conversationKey?: string;
  threadKey?: string;
  materials?: Material[];
}): SyncSourceMessage {
  return {
    sourceKey: input.sourceKey,
    authorKey: "synthetic-owner",
    conversation: {
      key: input.conversationKey ?? "synthetic-channel",
      kind: "channel",
    },
    ...(input.threadKey ? { threadKey: input.threadKey } : {}),
    publishedAt: input.publishedAt,
    deleted: false,
    text: input.text,
    context: [],
    materials: input.materials ?? [],
  };
}

function soon(): string {
  return new Date(Date.now() + 5_000).toISOString();
}

function runSync(
  workspace: string,
  page: SyncPageEnvelope,
): SyncReceipt {
  const result = runCli(workspace, ["sync", "--stdin"], page);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as SyncReceipt;
}

function originStatus(workspace: string, sourceKey: string): OriginStatus {
  const result = runCli(workspace, [
    "origin",
    "status",
    "--source-key",
    sourceKey,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as OriginStatus;
}

async function searchCandidate(
  page: Page,
  origin: string,
  query: string,
): Promise<void> {
  await page.goto(`${origin}/?q=${encodeURIComponent(query)}`);
  await page.getByRole("heading", { name: "Search results" }).waitFor();
}

function runCli(
  workspace: string,
  args: string[],
  input?: unknown,
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
      input: input === undefined ? undefined : JSON.stringify(input),
      encoding: "utf8",
    },
  );
}
