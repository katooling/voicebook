export const initialMigration = {
  version: 1,
  sql: `
    CREATE TABLE source_messages (
      id INTEGER PRIMARY KEY,
      source_key TEXT NOT NULL UNIQUE,
      published_at TEXT NOT NULL,
      text TEXT NOT NULL,
      context_json TEXT NOT NULL
        CHECK (json_valid(context_json) AND json_type(context_json) = 'array'),
      materials_json TEXT NOT NULL
        CHECK (json_valid(materials_json) AND json_type(materials_json) = 'array'),
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
      review_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_state IN ('pending', 'accepted', 'rejected', 'sensitive', 'removed')),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE core_messages (
      id INTEGER PRIMARY KEY,
      source_message_id INTEGER NOT NULL UNIQUE
        REFERENCES source_messages(id),
      text TEXT NOT NULL,
      materials_json TEXT NOT NULL
        CHECK (json_valid(materials_json) AND json_type(materials_json) = 'array'),
      pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
      accepted_at TEXT NOT NULL
    );
  `,
} as const;
