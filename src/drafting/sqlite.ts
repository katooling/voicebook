import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Material } from "../contracts.ts";
import { renderDraftBrief, renderDraftTask } from "./brief.ts";
import type {
  DraftApplication,
  DraftFinishReceipt,
  DraftStartReceipt,
  DraftStartRequest,
} from "./port.ts";
import { DraftOperationError } from "./port.ts";
import {
  selectCore,
  type DraftCoreMessage,
  type SelectedCore,
} from "./selection.ts";

const configurationVersion = "draft-brief-v1";

type StoredProfile = {
  id: number;
  text: string;
  based_on_revision: number;
};

type StoredCore = {
  id: number;
  text: string;
  materials_json: string;
  tags_json: string;
  pinned: number;
  accepted_at: string;
};

type StoredRun = {
  request_hash: string;
  input_json: string;
  brief_markdown: string;
  id: string;
};

type StoredRecord = {
  proposal_hash: string;
  proposal_text: string;
  recorded_at: string;
};

export class SqliteDraftApplication implements DraftApplication {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  begin(request: DraftStartRequest): DraftStartReceipt {
    const inputJson = JSON.stringify(request);
    const requestHash = hash(inputJson);

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.#database
        .prepare(`
          SELECT id, request_hash, input_json, brief_markdown
          FROM draft_runs
          WHERE request_key = ?
        `)
        .get(request.requestKey) as StoredRun | undefined;
      if (existing) {
        if (
          existing.request_hash !== requestHash ||
          existing.input_json !== inputJson
        ) {
          throw new DraftOperationError(
            "DRAFT_REQUEST_CONFLICT",
            "This requestKey already identifies a different Draft Run input.",
          );
        }
        this.#database.exec("COMMIT");
        return {
          runId: existing.id,
          draftBrief: existing.brief_markdown,
        };
      }

      const prepared = this.#prepareBrief(request);
      const brief = prepared.brief;
      const runId = randomUUID();
      const createdAt = new Date().toISOString();
      this.#database
        .prepare(`
          INSERT INTO draft_runs (
            id, request_key, request_hash, input_json, brief_markdown,
            core_revision, profile_id, profile_status, profile_text,
            profile_basis_revision, selected_core_json, config_version,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          runId,
          request.requestKey,
          requestHash,
          inputJson,
          brief,
          prepared.coreRevision,
          prepared.profile.id,
          prepared.profileStatus,
          prepared.profile.text,
          prepared.profile.based_on_revision,
          JSON.stringify(prepared.selectedCore),
          configurationVersion,
          createdAt,
        );
      this.#database.exec("COMMIT");
      return { runId, draftBrief: brief };
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  preview(request: DraftStartRequest): string {
    this.#database.exec("BEGIN");
    try {
      const brief = this.#prepareBrief(request).brief;
      this.#database.exec("COMMIT");
      return brief;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  previewTask(request: DraftStartRequest): string {
    return renderDraftTask(request);
  }

  record(runId: string, text: string): DraftFinishReceipt {
    if (Buffer.byteLength(text, "utf8") > 128 * 1024) {
      throw new Error("Draft proposal is too large.");
    }
    if (text.trim() === "") {
      throw new Error("Draft proposal must not be empty.");
    }
    const proposalHash = hash(text);

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const run = this.#database
        .prepare("SELECT id FROM draft_runs WHERE id = ?")
        .get(runId) as { id: string } | undefined;
      if (!run) {
        throw new Error("Draft Run was not found.");
      }
      const existing = this.#database
        .prepare(`
          SELECT proposal_hash, proposal_text, recorded_at
          FROM draft_records
          WHERE run_id = ?
        `)
        .get(runId) as StoredRecord | undefined;
      if (existing) {
        if (
          existing.proposal_hash !== proposalHash ||
          existing.proposal_text !== text
        ) {
          throw new DraftOperationError(
            "DRAFT_ALREADY_FINISHED",
            "This Draft Run already has a different Draft Record.",
          );
        }
        this.#database.exec("COMMIT");
        return {
          runId,
          status: "recorded",
          recordedAt: existing.recorded_at,
        };
      }

      const recordedAt = new Date().toISOString();
      this.#database
        .prepare(`
          INSERT INTO draft_records (
            run_id, proposal_text, proposal_hash, recorded_at
          ) VALUES (?, ?, ?, ?)
        `)
        .run(runId, text, proposalHash, recordedAt);
      this.#database.exec("COMMIT");
      return { runId, status: "recorded", recordedAt };
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #coreRevision(): number {
    const row = this.#database
      .prepare(
        "SELECT revision FROM voice_core_state WHERE singleton = 1",
      )
      .get() as { revision: number } | undefined;
    if (!row) {
      throw new Error("Voice Core revision state is unavailable.");
    }
    return row.revision;
  }

  #activeProfile(): StoredProfile | null {
    return (
      (this.#database
        .prepare(`
          SELECT id, text, based_on_revision
          FROM voice_profiles
          ORDER BY id DESC
          LIMIT 1
        `)
        .get() as StoredProfile | undefined) ?? null
    );
  }

  #coreMessages(): DraftCoreMessage[] {
    const rows = this.#database
      .prepare(`
        SELECT id, text, materials_json, tags_json, pinned, accepted_at
        FROM core_messages
      `)
      .all() as unknown as StoredCore[];
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      tags: JSON.parse(row.tags_json) as string[],
      materials: JSON.parse(row.materials_json) as Material[],
      pinned: row.pinned === 1,
      acceptedAt: row.accepted_at,
    }));
  }

  #prepareBrief(request: DraftStartRequest): {
    brief: string;
    coreRevision: number;
    profile: StoredProfile;
    profileStatus: "current" | "stale";
    selectedCore: SelectedCore[];
  } {
    const coreRevision = this.#coreRevision();
    const profile = this.#activeProfile();
    if (!profile) {
      throw new DraftOperationError(
        "VOICE_PROFILE_MISSING",
        "Generate a Voice Profile before preparing a draft.",
      );
    }
    const profileStatus =
      profile.based_on_revision === coreRevision ? "current" : "stale";
    const selectedCore = selectCore(this.#coreMessages(), request);
    if (selectedCore.length === 0) {
      throw new DraftOperationError(
        "VOICE_CORE_EMPTY",
        "Accept at least one Core Message before preparing a draft.",
      );
    }
    return {
      brief: renderDraftBrief({
        request,
        profileText: profile.text,
        profileStatus,
        selectedCore,
      }),
      coreRevision,
      profile,
      profileStatus,
      selectedCore,
    };
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
