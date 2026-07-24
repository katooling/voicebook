import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  SyncPageEnvelope,
  SyncProgress,
  SyncReceipt,
  SyncSourceMessage,
} from "./contracts.ts";
import type { SyncApplication } from "./port.ts";

type StoredRun = {
  voice_owner_author_key: string;
  scope_hash: string;
  expected_cursor: string | null;
  status: "partial" | "complete";
  pages_processed: number;
};

type StoredPage = {
  request_hash: string;
  receipt_json: string;
};

type StoredSource = {
  id: number;
  published_at: string;
  text: string;
  context_json: string;
  materials_json: string;
  source_author_key: string | null;
  conversation_key: string | null;
  conversation_kind: string | null;
  source_deleted: number;
  source_sync_key: string | null;
  review_state: string;
};

export class SqliteSyncApplication implements SyncApplication {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  applyPage(page: SyncPageEnvelope): SyncReceipt {
    if (
      page.sourceMessages.some(
        (message) => message.authorKey !== page.voiceOwnerAuthorKey,
      )
    ) {
      throw new Error(
        "Every root Source Message must be published by the Voice Owner; other authors belong only in Slack Context.",
      );
    }
    const requestHash = hash(page);
    const scopeHash = hash(page.scope);
    const windowStart = Date.parse(page.scope.windowStart);
    const selectedChannels = new Set(page.scope.selectedConversationKeys);
    const optedInDirectMessages = new Set(
      page.scope.optedInDirectMessageKeys,
    );
    const excludedConversations = new Set(
      page.scope.excludedConversationKeys,
    );
    const counts = {
      imported: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      excluded: 0,
      outsideWindow: 0,
    };

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.#database
        .prepare(`
          SELECT request_hash, receipt_json
          FROM sync_pages
          WHERE sync_key = ? AND page_key = ?
        `)
        .get(page.syncKey, page.pageKey) as StoredPage | undefined;
      if (replay) {
        if (replay.request_hash !== requestHash) {
          throw new Error(
            "A processed pageKey cannot be reused with different content.",
          );
        }
        const receipt = JSON.parse(replay.receipt_json) as SyncReceipt;
        this.#database.exec("COMMIT");
        return receipt;
      }

      const run = this.#database
        .prepare(`
          SELECT voice_owner_author_key, scope_hash, expected_cursor, status,
                 pages_processed
          FROM sync_runs
          WHERE sync_key = ?
        `)
        .get(page.syncKey) as StoredRun | undefined;
      if (!run) {
        if (page.cursor !== null) {
          throw new Error("A new synchronization must start with a null cursor.");
        }
        this.#database
          .prepare(`
            INSERT INTO sync_runs (
              sync_key, voice_owner_author_key, scope_hash, expected_cursor,
              status, pages_processed, updated_at
            ) VALUES (?, ?, ?, NULL, 'partial', 0, ?)
          `)
          .run(
            page.syncKey,
            page.voiceOwnerAuthorKey,
            scopeHash,
            new Date().toISOString(),
          );
      } else {
        if (run.status === "complete") {
          if (run.voice_owner_author_key !== page.voiceOwnerAuthorKey) {
            throw new Error(
              "A synchronization stream cannot change its Voice Owner.",
            );
          }
          if (page.cursor !== null) {
            throw new Error(
              "A new synchronization generation must start with a null cursor.",
            );
          }
          this.#database
            .prepare(`
              UPDATE sync_runs
              SET scope_hash = ?, expected_cursor = NULL, status = 'partial',
                  pages_processed = 0, updated_at = ?
              WHERE sync_key = ?
            `)
            .run(scopeHash, new Date().toISOString(), page.syncKey);
        } else {
          if (
            run.voice_owner_author_key !== page.voiceOwnerAuthorKey ||
            run.scope_hash !== scopeHash
          ) {
            throw new Error(
              "Voice Owner and synchronization scope cannot change during a partial generation.",
            );
          }
          if (run.expected_cursor !== page.cursor) {
            throw new Error(
              "Synchronization cursor does not match stored progress.",
            );
          }
        }
      }

      for (const message of page.sourceMessages) {
        if (
          !isIncluded(
            message,
            selectedChannels,
            optedInDirectMessages,
            excludedConversations,
          )
        ) {
          counts.excluded += 1;
          continue;
        }
        if (Date.parse(message.publishedAt) < windowStart) {
          counts.outsideWindow += 1;
          continue;
        }
        this.#applySourceMessage(page.syncKey, message, counts);
      }

      const status = page.nextCursor === null ? "complete" : "partial";
      const receipt: SyncReceipt = {
        syncKey: page.syncKey,
        pageKey: page.pageKey,
        status,
        resumeCursor: page.nextCursor,
        ...counts,
      };
      this.#database
        .prepare(`
          UPDATE sync_runs
          SET expected_cursor = ?, status = ?, pages_processed = pages_processed + 1,
              updated_at = ?
          WHERE sync_key = ?
        `)
        .run(
          page.nextCursor,
          status,
          new Date().toISOString(),
          page.syncKey,
        );
      this.#database
        .prepare(`
          INSERT INTO sync_pages (
            sync_key, page_key, request_hash, receipt_json, processed_at
          ) VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          page.syncKey,
          page.pageKey,
          requestHash,
          JSON.stringify(receipt),
          new Date().toISOString(),
        );
      this.#database.exec("COMMIT");
      return receipt;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  status(syncKey: string): SyncProgress {
    if (syncKey.trim() === "") {
      throw new Error("syncKey must be non-empty text.");
    }
    const run = this.#database
      .prepare(`
        SELECT status, expected_cursor, pages_processed
        FROM sync_runs
        WHERE sync_key = ?
      `)
      .get(syncKey) as
      | {
          status: "partial" | "complete";
          expected_cursor: string | null;
          pages_processed: number;
        }
      | undefined;
    if (!run) {
      throw new Error("Synchronization stream was not found.");
    }
    return {
      syncKey,
      status: run.status,
      resumeCursor: run.expected_cursor,
      pagesProcessed: run.pages_processed,
    };
  }

  #applySourceMessage(
    syncKey: string,
    message: SyncSourceMessage,
    counts: {
      imported: number;
      updated: number;
      deleted: number;
      unchanged: number;
    },
  ): void {
    const existing = this.#database
      .prepare(`
        SELECT id, published_at, text, context_json, materials_json,
               source_author_key, conversation_key, conversation_kind,
               source_deleted, source_sync_key, review_state
        FROM source_messages
        WHERE source_key = ?
      `)
      .get(message.sourceKey) as StoredSource | undefined;

    if (message.deleted) {
      if (
        !existing ||
        existing.source_sync_key !== syncKey ||
        existing.source_deleted === 1
      ) {
        counts.unchanged += 1;
        return;
      }
      this.#database
        .prepare(`
          UPDATE source_messages
          SET source_deleted = 1, revision = revision + 1, updated_at = ?,
              review_state = CASE
                WHEN review_state = 'pending' THEN 'removed'
                ELSE review_state
              END
          WHERE id = ?
        `)
        .run(new Date().toISOString(), existing.id);
      counts.deleted += 1;
      return;
    }

    if (existing?.source_sync_key && existing.source_sync_key !== syncKey) {
      throw new Error(
        "A Source Message key cannot move between synchronization streams.",
      );
    }

    const contextJson = JSON.stringify(message.context);
    const materialsJson = JSON.stringify(message.materials);
    if (!existing) {
      this.#database
        .prepare(`
          INSERT INTO source_messages (
            source_key, published_at, text, context_json, materials_json,
            updated_at, source_author_key, conversation_key, conversation_kind,
            source_deleted, source_sync_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `)
        .run(
          message.sourceKey,
          message.publishedAt,
          message.text,
          contextJson,
          materialsJson,
          new Date().toISOString(),
          message.authorKey,
          message.conversation.key,
          message.conversation.kind,
          syncKey,
        );
      counts.imported += 1;
      return;
    }

    if (
      existing.published_at === message.publishedAt &&
      existing.text === message.text &&
      existing.context_json === contextJson &&
      existing.materials_json === materialsJson &&
      existing.source_author_key === message.authorKey &&
      existing.conversation_key === message.conversation.key &&
      existing.conversation_kind === message.conversation.kind &&
      existing.source_deleted === 0 &&
      existing.source_sync_key === syncKey
    ) {
      counts.unchanged += 1;
      return;
    }

    this.#database
      .prepare(`
        UPDATE source_messages
        SET published_at = ?, text = ?, context_json = ?, materials_json = ?,
            source_author_key = ?, conversation_key = ?, conversation_kind = ?,
            source_deleted = 0, source_sync_key = ?,
            revision = revision + 1, updated_at = ?,
            review_state = CASE
              WHEN source_deleted = 1 AND review_state = 'removed' THEN 'pending'
              ELSE review_state
            END
        WHERE id = ?
      `)
      .run(
        message.publishedAt,
        message.text,
        contextJson,
        materialsJson,
        message.authorKey,
        message.conversation.key,
        message.conversation.kind,
        syncKey,
        new Date().toISOString(),
        existing.id,
      );
    counts.updated += 1;
  }
}

function isIncluded(
  message: SyncSourceMessage,
  selectedChannels: Set<string>,
  optedInDirectMessages: Set<string>,
  excludedConversations: Set<string>,
): boolean {
  if (excludedConversations.has(message.conversation.key)) {
    return false;
  }
  return message.conversation.kind === "channel"
    ? selectedChannels.has(message.conversation.key)
    : optedInDirectMessages.has(message.conversation.key);
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
