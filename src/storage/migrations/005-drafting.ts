export const draftingMigration = {
  version: 5,
  sql: `
    CREATE TABLE draft_runs (
      id TEXT PRIMARY KEY,
      request_key TEXT NOT NULL UNIQUE,
      request_hash TEXT NOT NULL,
      input_json TEXT NOT NULL
        CHECK (json_valid(input_json) AND json_type(input_json) = 'object'),
      brief_markdown TEXT NOT NULL,
      core_revision INTEGER NOT NULL CHECK (core_revision >= 0),
      profile_id INTEGER NOT NULL REFERENCES voice_profiles(id),
      profile_status TEXT NOT NULL CHECK (profile_status IN ('current', 'stale')),
      profile_text TEXT NOT NULL,
      profile_basis_revision INTEGER NOT NULL CHECK (profile_basis_revision >= 0),
      selected_core_json TEXT NOT NULL
        CHECK (json_valid(selected_core_json) AND json_type(selected_core_json) = 'array'),
      config_version TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE draft_records (
      run_id TEXT PRIMARY KEY REFERENCES draft_runs(id),
      proposal_text TEXT NOT NULL CHECK (length(trim(proposal_text)) > 0),
      proposal_hash TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );
  `,
} as const;
