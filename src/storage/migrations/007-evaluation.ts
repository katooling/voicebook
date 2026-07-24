export const evaluationMigration = {
  version: 7,
  sql: `
    CREATE TABLE evaluations (
      evaluation_key TEXT PRIMARY KEY,
      revision INTEGER NOT NULL CHECK (revision >= 0),
      state_json TEXT NOT NULL
        CHECK (json_valid(state_json) AND json_type(state_json) = 'object')
    );
  `,
} as const;
