export const syncMigration = {
  version: 2,
  sql: `
    ALTER TABLE source_messages ADD COLUMN source_author_key TEXT;
    ALTER TABLE source_messages ADD COLUMN conversation_key TEXT;
    ALTER TABLE source_messages ADD COLUMN conversation_kind TEXT
      CHECK (conversation_kind IS NULL OR conversation_kind IN ('channel', 'directMessage'));
    ALTER TABLE source_messages ADD COLUMN source_deleted INTEGER NOT NULL DEFAULT 0
      CHECK (source_deleted IN (0, 1));
    ALTER TABLE source_messages ADD COLUMN source_sync_key TEXT;

    CREATE TABLE sync_runs (
      sync_key TEXT PRIMARY KEY,
      voice_owner_author_key TEXT NOT NULL,
      scope_hash TEXT NOT NULL,
      expected_cursor TEXT,
      status TEXT NOT NULL CHECK (status IN ('partial', 'complete')),
      pages_processed INTEGER NOT NULL DEFAULT 0 CHECK (pages_processed >= 0),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE sync_pages (
      sync_key TEXT NOT NULL REFERENCES sync_runs(sync_key),
      page_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL
        CHECK (json_valid(receipt_json) AND json_type(receipt_json) = 'object'),
      processed_at TEXT NOT NULL,
      PRIMARY KEY (sync_key, page_key)
    );
  `,
} as const;
