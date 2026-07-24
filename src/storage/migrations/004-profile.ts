export const profileMigration = {
  version: 4,
  sql: `
    CREATE TABLE voice_core_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      revision INTEGER NOT NULL CHECK (revision >= 0)
    );

    INSERT INTO voice_core_state (singleton, revision) VALUES (1, 0);

    CREATE TABLE voice_profiles (
      id INTEGER PRIMARY KEY,
      text TEXT NOT NULL CHECK (length(trim(text)) > 0),
      based_on_revision INTEGER NOT NULL CHECK (based_on_revision >= 0),
      created_at TEXT NOT NULL
    );

    CREATE TRIGGER voice_core_revision_after_insert
    AFTER INSERT ON core_messages
    BEGIN
      UPDATE voice_core_state SET revision = revision + 1 WHERE singleton = 1;
    END;

    CREATE TRIGGER voice_core_revision_after_update
    AFTER UPDATE ON core_messages
    BEGIN
      UPDATE voice_core_state SET revision = revision + 1 WHERE singleton = 1;
    END;

    CREATE TRIGGER voice_core_revision_after_delete
    AFTER DELETE ON core_messages
    BEGIN
      UPDATE voice_core_state SET revision = revision + 1 WHERE singleton = 1;
    END;
  `,
} as const;
