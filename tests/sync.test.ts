import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ImportEnvelope } from "../src/contracts.ts";
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

test("sync admits only the Voice Owner messages in the selected scope", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-sync-scope-"));
  const selectedChannel = sourceMessage({
    sourceKey: "synthetic:channel:owner",
    conversationKey: "synthetic-channel-selected",
    text: "Selected synthetic channel message.",
  });
  const optedInDirectMessage = sourceMessage({
    sourceKey: "synthetic:dm:owner",
    conversationKey: "synthetic-dm-opted-in",
    conversationKind: "directMessage",
    text: "Opted-in synthetic direct message.",
  });
  const page = syncPage({
    nextCursor: "synthetic-cursor-2",
    sourceMessages: [
      {
        ...selectedChannel,
        context: [
          {
            position: "before",
            authorLabel: "Synthetic teammate",
            text: "Synthetic surrounding context.",
            attachmentBytes: "must-never-be-retained",
          },
        ],
        materials: [
          {
            ordinal: 2,
            kind: "image",
            role: "evidence",
            label: "Synthetic evidence",
            sourceReference: "synthetic-reference",
            attachmentBytes: "must-never-be-retained",
            credential: "must-never-be-retained",
          },
          {
            ordinal: 1,
            kind: "link",
            role: "reference",
            url: "https://example.invalid/synthetic",
          },
        ],
      } as unknown as SyncSourceMessage,
      optedInDirectMessage,
      sourceMessage({
        sourceKey: "synthetic:channel:not-selected",
        conversationKey: "synthetic-channel-not-selected",
      }),
      sourceMessage({
        sourceKey: "synthetic:dm:not-opted-in",
        conversationKey: "synthetic-dm-not-opted-in",
        conversationKind: "directMessage",
      }),
      sourceMessage({
        sourceKey: "synthetic:channel:excluded",
        conversationKey: "synthetic-channel-excluded",
      }),
      sourceMessage({
        sourceKey: "synthetic:outside-window",
        conversationKey: "synthetic-channel-selected",
        publishedAt: "2024-12-31T23:59:59.000Z",
      }),
    ],
  });

  try {
    const receipt = runSync(workspace, page);
    assert.deepEqual(receipt, {
      syncKey: "synthetic-primary",
      pageKey: "synthetic-page-1",
      status: "partial",
      resumeCursor: "synthetic-cursor-2",
      imported: 2,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      excluded: 3,
      outsideWindow: 1,
    });

    const normalized: ImportEnvelope = {
      schemaVersion: 1,
      sourceMessages: [
        {
          sourceKey: selectedChannel.sourceKey,
          publishedAt: selectedChannel.publishedAt,
          text: selectedChannel.text,
          context: [
            {
              position: "before",
              authorLabel: "Synthetic teammate",
              text: "Synthetic surrounding context.",
            },
          ],
          materials: [
            {
              ordinal: 1,
              kind: "link",
              role: "reference",
              url: "https://example.invalid/synthetic",
            },
            {
              ordinal: 2,
              kind: "image",
              role: "evidence",
              label: "Synthetic evidence",
              sourceReference: "synthetic-reference",
            },
          ],
        },
        {
          sourceKey: optedInDirectMessage.sourceKey,
          publishedAt: optedInDirectMessage.publishedAt,
          text: optedInDirectMessage.text,
          context: [],
          materials: [],
        },
      ],
    };
    assert.deepEqual(importEnvelope(workspace, normalized), {
      imported: 0,
      updated: 0,
      unchanged: 2,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("sync rejects an entire page when a root message is not by the Voice Owner", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-sync-author-"));
  const invalid = syncPage({
    sourceMessages: [
      sourceMessage({ sourceKey: "synthetic:owner-valid" }),
      sourceMessage({
        sourceKey: "synthetic:foreign-root",
        authorKey: "synthetic-other-author",
      }),
    ],
  });

  try {
    const failed = runSyncFailure(workspace, invalid);
    assert.match(failed.message, /root Source Message.*Voice Owner/);

    const corrected = syncPage({
      sourceMessages: [
        sourceMessage({ sourceKey: "synthetic:owner-valid" }),
      ],
    });
    assert.deepEqual(runSync(workspace, corrected), {
      syncKey: "synthetic-primary",
      pageKey: "synthetic-page-1",
      status: "complete",
      resumeCursor: null,
      imported: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      excluded: 0,
      outsideWindow: 0,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("sync persists opaque continuation progress and recovers a lost receipt by exact retry", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-sync-pages-"));
  const first = syncPage({
    nextCursor: "synthetic-opaque-continuation",
    sourceMessages: [
      sourceMessage({ sourceKey: "synthetic:paged:first" }),
    ],
  });
  const second = syncPage({
    pageKey: "synthetic-page-2",
    cursor: "synthetic-opaque-continuation",
    sourceMessages: [
      sourceMessage({ sourceKey: "synthetic:paged:second" }),
    ],
  });

  try {
    const firstReceipt = runSync(workspace, first);
    assert.equal(firstReceipt.status, "partial");
    assert.deepEqual(runSyncStatus(workspace, "synthetic-primary"), {
      syncKey: "synthetic-primary",
      status: "partial",
      resumeCursor: "synthetic-opaque-continuation",
      pagesProcessed: 1,
    });
    assert.deepEqual(runSync(workspace, first), firstReceipt);

    const conflictingRetry = structuredClone(first);
    conflictingRetry.sourceMessages[0]!.text = "Changed retry content.";
    assert.match(
      runSyncFailure(workspace, conflictingRetry).message,
      /pageKey cannot be reused/,
    );

    const wrongContinuation = structuredClone(second);
    wrongContinuation.cursor = "synthetic-wrong-continuation";
    assert.match(
      runSyncFailure(workspace, wrongContinuation).message,
      /cursor does not match stored progress/,
    );

    const finalReceipt = runSync(workspace, second);
    assert.equal(finalReceipt.status, "complete");
    assert.deepEqual(runSyncStatus(workspace, "synthetic-primary"), {
      syncKey: "synthetic-primary",
      status: "complete",
      resumeCursor: null,
      pagesProcessed: 2,
    });
    assert.deepEqual(runSync(workspace, second), finalReceipt);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("a completed sync stream accepts a later generation with a changed scope", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-sync-generation-"));
  const original = sourceMessage({
    sourceKey: "synthetic:later-update",
    text: "Synthetic first generation.",
  });

  try {
    runSync(workspace, syncPage({ sourceMessages: [original] }));
    const later = syncPage({
      pageKey: "synthetic-generation-2-page-1",
      scope: {
        windowStart: "2025-02-01T00:00:00.000Z",
        selectedConversationKeys: ["synthetic-channel-selected"],
        optedInDirectMessageKeys: [],
        excludedConversationKeys: [],
      },
      sourceMessages: [
        sourceMessage({
          sourceKey: "synthetic:later-update",
          text: "Synthetic second generation edit.",
        }),
      ],
    });

    const receipt = runSync(workspace, later);
    assert.equal(receipt.status, "complete");
    assert.equal(receipt.updated, 1);
    assert.deepEqual(runSyncStatus(workspace, "synthetic-primary"), {
      syncKey: "synthetic-primary",
      status: "complete",
      resumeCursor: null,
      pagesProcessed: 1,
    });
    assert.deepEqual(
      importEnvelope(workspace, {
        schemaVersion: 1,
        sourceMessages: [
          {
            sourceKey: "synthetic:later-update",
            publishedAt: "2025-02-03T09:30:00.000Z",
            text: "Synthetic second generation edit.",
            context: [],
            materials: [],
          },
        ],
      }),
      { imported: 0, updated: 0, unchanged: 1 },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("sync reconciles edits and explicit tombstones without deleting absent messages", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-sync-changes-"));
  const retained = sourceMessage({
    sourceKey: "synthetic:retained-when-absent",
    text: "Synthetic retained message.",
  });
  const changed = sourceMessage({
    sourceKey: "synthetic:changed-then-deleted",
    text: "Synthetic original message.",
  });

  try {
    runSync(
      workspace,
      syncPage({
        nextCursor: "synthetic-cursor-edit",
        sourceMessages: [retained, changed],
      }),
    );
    const edited = sourceMessage({
      sourceKey: "synthetic:changed-then-deleted",
      text: "Synthetic edited message.",
    });
    const editReceipt = runSync(
      workspace,
      syncPage({
        pageKey: "synthetic-page-edit",
        cursor: "synthetic-cursor-edit",
        nextCursor: "synthetic-cursor-delete",
        sourceMessages: [edited],
      }),
    );
    assert.equal(editReceipt.updated, 1);
    assert.deepEqual(
      importEnvelope(workspace, {
        schemaVersion: 1,
        sourceMessages: [
          {
            sourceKey: "synthetic:changed-then-deleted",
            publishedAt: "2025-02-03T09:30:00.000Z",
            text: "Synthetic edited message.",
            context: [],
            materials: [],
          },
        ],
      }),
      { imported: 0, updated: 0, unchanged: 1 },
    );

    const deletionReceipt = runSync(
      workspace,
      syncPage({
        pageKey: "synthetic-page-delete",
        cursor: "synthetic-cursor-delete",
        sourceMessages: [
          {
            ...changed,
            deleted: true,
            text: "",
          },
          {
            ...sourceMessage({ sourceKey: "synthetic:unknown-tombstone" }),
            deleted: true,
            text: "",
          },
        ],
      }),
    );
    assert.equal(deletionReceipt.deleted, 1);
    assert.equal(deletionReceipt.unchanged, 1);

    const server = await startVoicebook(workspace);
    try {
      const html = await (await fetch(server.origin)).text();
      assert.match(html, /Synthetic retained message/);
      assert.doesNotMatch(html, /Synthetic edited message/);
    } finally {
      await stopVoicebook(server.process);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("sync binds each Source Message key to one synchronization stream", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-sync-binding-"));
  const source = sourceMessage({ sourceKey: "synthetic:bound-source" });

  try {
    runSync(workspace, syncPage({ sourceMessages: [source] }));
    assert.match(
      runSyncFailure(
        workspace,
        syncPage({
          syncKey: "synthetic-secondary",
          pageKey: "synthetic-secondary-page",
          sourceMessages: [source],
        }),
      ).message,
      /cannot move between synchronization streams/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

function syncPage(overrides: Partial<SyncPageEnvelope> = {}): SyncPageEnvelope {
  return {
    schemaVersion: 1,
    syncKey: "synthetic-primary",
    pageKey: "synthetic-page-1",
    cursor: null,
    nextCursor: null,
    voiceOwnerAuthorKey: "synthetic-owner",
    scope: {
      windowStart: "2025-01-01T00:00:00.000Z",
      selectedConversationKeys: [
        "synthetic-channel-selected",
        "synthetic-channel-excluded",
      ],
      optedInDirectMessageKeys: ["synthetic-dm-opted-in"],
      excludedConversationKeys: ["synthetic-channel-excluded"],
    },
    sourceMessages: [],
    ...overrides,
  };
}

function sourceMessage(
  overrides: Partial<{
    sourceKey: string;
    authorKey: string;
    conversationKey: string;
    conversationKind: "channel" | "directMessage";
    publishedAt: string;
    text: string;
  }> = {},
): SyncSourceMessage & Record<string, unknown> {
  return {
    sourceKey: overrides.sourceKey ?? "synthetic:default",
    authorKey: overrides.authorKey ?? "synthetic-owner",
    conversation: {
      key: overrides.conversationKey ?? "synthetic-channel-selected",
      kind: overrides.conversationKind ?? "channel",
    },
    publishedAt: overrides.publishedAt ?? "2025-02-03T09:30:00.000Z",
    text: overrides.text ?? "Synthetic source message.",
    deleted: false,
    context: [],
    materials: [],
  };
}

function runSync(
  workspace: string,
  page: SyncPageEnvelope,
): SyncReceipt {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "sync",
      "--workspace",
      workspace,
      "--stdin",
    ],
    {
      cwd: repositoryRoot,
      input: JSON.stringify(page),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as SyncReceipt;
}

function runSyncFailure(
  workspace: string,
  page: SyncPageEnvelope,
): { code: string; message: string } {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "sync",
      "--workspace",
      workspace,
      "--stdin",
    ],
    {
      cwd: repositoryRoot,
      input: JSON.stringify(page),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 2, result.stdout);
  return JSON.parse(result.stderr) as { code: string; message: string };
}

function runSyncStatus(
  workspace: string,
  syncKey: string,
): {
  syncKey: string;
  status: "partial" | "complete";
  resumeCursor: string | null;
  pagesProcessed: number;
} {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "sync",
      "status",
      "--sync-key",
      syncKey,
      "--workspace",
      workspace,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as {
    syncKey: string;
    status: "partial" | "complete";
    resumeCursor: string | null;
    pagesProcessed: number;
  };
}
