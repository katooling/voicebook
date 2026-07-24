export const reconciliationMigration = {
  version: 6,
  sql: `
    ALTER TABLE source_messages ADD COLUMN source_thread_key TEXT;

    CREATE TABLE composition_origins (
      source_message_id INTEGER PRIMARY KEY REFERENCES source_messages(id),
      source_revision INTEGER NOT NULL CHECK (source_revision >= 1),
      origin TEXT NOT NULL CHECK (origin IN ('manual', 'agent', 'mixed', 'unknown')),
      rationale TEXT NOT NULL,
      matched_draft_run_id TEXT REFERENCES draft_runs(id),
      suggested_draft_run_id TEXT REFERENCES draft_runs(id),
      suggestion_revision INTEGER NOT NULL CHECK (suggestion_revision >= 0),
      score REAL,
      evidence_json TEXT NOT NULL
        CHECK (json_valid(evidence_json) AND json_type(evidence_json) = 'array'),
      difference_json TEXT
        CHECK (difference_json IS NULL OR (json_valid(difference_json) AND json_type(difference_json) = 'object')),
      draft_text TEXT,
      canonicalizer_version TEXT NOT NULL,
      matcher_version TEXT NOT NULL,
      confirmed_at TEXT,
      analyzed_at TEXT NOT NULL
    );

    CREATE INDEX draft_records_by_recorded_at
      ON draft_records(recorded_at);

    INSERT INTO composition_origins (
      source_message_id, source_revision, origin, rationale,
      suggestion_revision, evidence_json, canonicalizer_version,
      matcher_version, analyzed_at
    )
    SELECT id, revision, 'unknown', 'historical-unreconciled', 0, '[]',
           'source-format-v2', 'composition-v2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM source_messages;

    CREATE TRIGGER composition_origin_after_source_insert
    AFTER INSERT ON source_messages
    BEGIN
      INSERT INTO composition_origins (
        source_message_id, source_revision, origin, rationale,
        suggestion_revision, evidence_json, canonicalizer_version,
        matcher_version, analyzed_at
      ) VALUES (
        NEW.id, NEW.revision, 'unknown', 'not-yet-reconciled', 0, '[]',
        'source-format-v2', 'composition-v2',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
    END;

    CREATE TRIGGER composition_origin_after_source_revision
    AFTER UPDATE OF revision ON source_messages
    WHEN NEW.revision <> OLD.revision
    BEGIN
      UPDATE composition_origins
      SET source_revision = NEW.revision,
          origin = 'unknown',
          rationale = 'not-yet-reconciled',
          matched_draft_run_id = NULL,
          suggested_draft_run_id = NULL,
          suggestion_revision = suggestion_revision + 1,
          score = NULL,
          evidence_json = '[]',
          difference_json = NULL,
          draft_text = NULL,
          confirmed_at = NULL,
          analyzed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE source_message_id = NEW.id;
    END;
  `,
} as const;
