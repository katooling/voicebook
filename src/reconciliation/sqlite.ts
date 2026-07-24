import type { DatabaseSync } from "node:sqlite";
import type { Candidate } from "../candidates/port.ts";
import type { Material } from "../contracts.ts";
import type { DraftStartRequest } from "../drafting/port.ts";
import {
  matcherVersion,
  reconcileCompositionOrigin,
  type ReconciliationDraft,
  type ReconciliationSource,
} from "./matcher.ts";
import { canonicalizerVersion } from "./normalization.ts";
import type {
  Difference,
  OriginStatus,
  ReconciliationApplication,
} from "./port.ts";
import { OriginChangedError } from "./port.ts";

const recentDays = 14;
// Newest records win the bounded candidate-generation query. This keeps the
// worst-case local comparison cost finite without changing stable tie-breaks.
const maximumRecentDrafts = 200;

type StoredSource = {
  id: number;
  source_key: string;
  revision: number;
  published_at: string;
  text: string;
  materials_json: string;
  conversation_key: string | null;
  source_thread_key: string | null;
  source_deleted: number;
};

type StoredDraft = {
  run_id: string;
  proposal_text: string;
  recorded_at: string;
  input_json: string;
};

type StoredOrigin = {
  source_message_id: number;
  source_revision: number;
  origin: OriginStatus["origin"];
  rationale: string;
  matched_draft_run_id: string | null;
  suggested_draft_run_id: string | null;
  suggestion_revision: number;
  score: number | null;
  evidence_json: string;
  difference_json: string | null;
  draft_text: string | null;
  canonicalizer_version: string;
  matcher_version: string;
};

export class SqliteReconciliationApplication
  implements ReconciliationApplication
{
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  reconcileSourceMessage(sourceMessageId: number): void {
    const source = this.#sourceById(sourceMessageId);
    if (!source) {
      throw new Error("Source Message was not found.");
    }
    const current = this.#storedOrigin(sourceMessageId);
    if (
      current?.origin === "mixed" &&
      current.source_revision === source.revision
    ) {
      return;
    }
    const result = reconcileCompositionOrigin(
      reconciliationSource(source),
      this.#eligibleDrafts(source),
    );
    const evidenceJson = JSON.stringify(result.evidence);
    const differenceJson = result.difference
      ? JSON.stringify(result.difference)
      : null;
    if (
      current?.source_revision === source.revision &&
      current.origin === result.origin &&
      current.rationale === result.rationale &&
      current.matched_draft_run_id === result.matchedRunId &&
      current.suggested_draft_run_id === result.suggestedRunId &&
      current.score === result.score &&
      current.evidence_json === evidenceJson &&
      current.difference_json === differenceJson &&
      current.draft_text === result.draftText &&
      current.canonicalizer_version === canonicalizerVersion &&
      current.matcher_version === matcherVersion
    ) {
      return;
    }
    const suggestionRevision = (current?.suggestion_revision ?? 0) + 1;

    this.#database
      .prepare(`
        INSERT INTO composition_origins (
          source_message_id, source_revision, origin, rationale,
          matched_draft_run_id, suggested_draft_run_id, suggestion_revision,
          score, evidence_json, difference_json, draft_text,
          canonicalizer_version, matcher_version, confirmed_at, analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        ON CONFLICT(source_message_id) DO UPDATE SET
          source_revision = excluded.source_revision,
          origin = excluded.origin,
          rationale = excluded.rationale,
          matched_draft_run_id = excluded.matched_draft_run_id,
          suggested_draft_run_id = excluded.suggested_draft_run_id,
          suggestion_revision = excluded.suggestion_revision,
          score = excluded.score,
          evidence_json = excluded.evidence_json,
          difference_json = excluded.difference_json,
          draft_text = excluded.draft_text,
          canonicalizer_version = excluded.canonicalizer_version,
          matcher_version = excluded.matcher_version,
          confirmed_at = NULL,
          analyzed_at = excluded.analyzed_at
      `)
      .run(
        source.id,
        source.revision,
        result.origin,
        result.rationale,
        result.matchedRunId,
        result.suggestedRunId,
        suggestionRevision,
        result.score,
        evidenceJson,
        differenceJson,
        result.draftText,
        canonicalizerVersion,
        matcherVersion,
        new Date().toISOString(),
      );
  }

  status(sourceKey: string): OriginStatus {
    const source = this.#database
      .prepare("SELECT id FROM source_messages WHERE source_key = ?")
      .get(sourceKey) as { id: number } | undefined;
    if (!source) {
      throw new Error("Source Message was not found.");
    }
    return this.#statusById(source.id);
  }

  withOrigins<T extends Candidate>(
    candidates: T[],
  ): Array<T & { compositionOrigin: OriginStatus }> {
    return candidates.map((candidate) => ({
      ...candidate,
      compositionOrigin: this.#statusById(Number(candidate.id)),
    }));
  }

  confirmMixed(input: {
    sourceMessageId: string;
    sourceRevision: string;
    suggestionRevision: string;
    draftRunId: string;
  }): void {
    const sourceId = identifier(input.sourceMessageId);
    const sourceRevision = identifier(input.sourceRevision);
    const suggestionRevision = identifier(input.suggestionRevision);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.#database
        .prepare(`
          UPDATE composition_origins
          SET origin = 'mixed',
              rationale = 'voice-owner-confirmed',
              matched_draft_run_id = suggested_draft_run_id,
              suggested_draft_run_id = NULL,
              confirmed_at = ?
          WHERE source_message_id = ?
            AND source_revision = ?
            AND suggestion_revision = ?
            AND origin = 'unknown'
            AND suggested_draft_run_id = ?
            AND EXISTS (
              SELECT 1 FROM source_messages
              WHERE id = composition_origins.source_message_id
                AND revision = composition_origins.source_revision
            )
        `)
        .run(
          new Date().toISOString(),
          sourceId,
          sourceRevision,
          suggestionRevision,
          input.draftRunId,
        );
      if (result.changes !== 1) {
        const retry = this.#storedOrigin(sourceId);
        if (
          retry?.origin !== "mixed" ||
          retry.source_revision !== sourceRevision ||
          retry.suggestion_revision !== suggestionRevision ||
          retry.matched_draft_run_id !== input.draftRunId
        ) {
          throw new OriginChangedError();
        }
      }
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #eligibleDrafts(source: StoredSource): ReconciliationDraft[] {
    const published = Date.parse(source.published_at);
    const earliest = new Date(published - recentDays * 86_400_000).toISOString();
    const latest = new Date(published).toISOString();
    const rows = this.#database
      .prepare(`
        SELECT records.run_id, records.proposal_text, records.recorded_at,
               runs.input_json
        FROM draft_records AS records
        JOIN draft_runs AS runs ON runs.id = records.run_id
        WHERE records.recorded_at BETWEEN ? AND ?
        ORDER BY records.recorded_at DESC, records.run_id ASC
        LIMIT ${maximumRecentDrafts}
      `)
      .all(earliest, latest) as unknown as StoredDraft[];
    return rows.map((draft) => {
      const input = JSON.parse(draft.input_json) as DraftStartRequest;
      return {
        runId: draft.run_id,
        proposalText: draft.proposal_text,
        recordedAt: draft.recorded_at,
        destination: input.destination,
        thread: input.thread,
        materials: input.currentMaterials,
      };
    });
  }

  #statusById(sourceId: number): OriginStatus {
    const source = this.#sourceById(sourceId);
    const stored = this.#storedOrigin(sourceId);
    if (!source || !stored) {
      throw new Error("Composition Origin was not found.");
    }
    const evidence = JSON.parse(stored.evidence_json) as string[];
    const difference = stored.difference_json
      ? (JSON.parse(stored.difference_json) as Difference)
      : null;
    return {
      sourceKey: source.source_key,
      sourceId: String(source.id),
      sourceRevision: String(stored.source_revision),
      origin: stored.origin,
      rationale: stored.rationale,
      canonicalizerVersion: stored.canonicalizer_version,
      matcherVersion: stored.matcher_version,
      suggestion:
        stored.suggested_draft_run_id &&
        stored.draft_text &&
        stored.score !== null &&
        difference
          ? {
              draftRunId: stored.suggested_draft_run_id,
              draftText: stored.draft_text,
              score: stored.score,
              evidence,
              difference,
              suggestionRevision: String(stored.suggestion_revision),
            }
          : null,
    };
  }

  #sourceById(sourceId: number): StoredSource | undefined {
    return this.#database
      .prepare(`
        SELECT id, source_key, revision, published_at, text, materials_json,
               conversation_key, source_thread_key, source_deleted
        FROM source_messages
        WHERE id = ?
      `)
      .get(sourceId) as StoredSource | undefined;
  }

  #storedOrigin(sourceId: number): StoredOrigin | undefined {
    return this.#database
      .prepare("SELECT * FROM composition_origins WHERE source_message_id = ?")
      .get(sourceId) as StoredOrigin | undefined;
  }
}

function reconciliationSource(source: StoredSource): ReconciliationSource {
  return {
    text: source.text,
    deleted: source.source_deleted === 1,
    conversationKey: source.conversation_key,
    threadKey: source.source_thread_key,
    materials: JSON.parse(source.materials_json) as Material[],
  };
}

function identifier(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new Error("Composition Origin identifier is invalid.");
  }
  return result;
}
