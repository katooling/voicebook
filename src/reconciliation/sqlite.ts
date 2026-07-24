import type { DatabaseSync } from "node:sqlite";
import type { Candidate } from "../candidates/port.ts";
import type { Material } from "../contracts.ts";
import type { DraftMaterialHint, DraftStartRequest } from "../drafting/port.ts";
import { canonicalizeSourceText, canonicalizerVersion } from "./normalization.ts";
import type {
  Difference,
  OriginStatus,
  ReconciliationApplication,
} from "./port.ts";
import { OriginChangedError } from "./port.ts";

export const matcherVersion = "composition-v2";
const nearThreshold = 0.82;
const ambiguityMargin = 0.08;
const weakThreshold = 0.45;
const maximumNearLength = 4_000;
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

type EvaluatedDraft = {
  draft: StoredDraft;
  canonical: string;
  exact: boolean;
  similarity: number;
  score: number;
  evidence: string[];
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
    const result = reconcile(source, this.#eligibleDrafts(source));
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

  #eligibleDrafts(source: StoredSource): StoredDraft[] {
    const published = Date.parse(source.published_at);
    const earliest = new Date(published - recentDays * 86_400_000).toISOString();
    const latest = new Date(published).toISOString();
    return this.#database
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

function reconcile(
  source: StoredSource,
  drafts: StoredDraft[],
): {
  origin: OriginStatus["origin"];
  rationale: string;
  matchedRunId: string | null;
  suggestedRunId: string | null;
  score: number | null;
  evidence: string[];
  difference: Difference | null;
  draftText: string | null;
} {
  const empty = {
    matchedRunId: null,
    suggestedRunId: null,
    score: null,
    evidence: [] as string[],
    difference: null,
    draftText: null,
  };
  if (source.source_deleted === 1) {
    return { origin: "unknown", rationale: "source-deleted", ...empty };
  }
  const sourceCanonical = canonicalizeSourceText(source.text);
  const evaluated = drafts
    .map((draft) => evaluate(source, sourceCanonical, draft))
    .filter((value): value is EvaluatedDraft => value !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.draft.recorded_at.localeCompare(left.draft.recorded_at) ||
        left.draft.run_id.localeCompare(right.draft.run_id),
    );
  const exact = evaluated.filter((item) => item.exact);
  if (exact.length > 0) {
    if (isGeneric(sourceCanonical)) {
      return { origin: "unknown", rationale: "generic-exact", ...empty };
    }
    if (exact.length !== 1) {
      return {
        origin: "unknown",
        rationale: "ambiguous-exact",
        ...empty,
        evidence: [`${exact.length} eligible Draft Records matched exactly.`],
      };
    }
    return {
      origin: "agent",
      rationale: "unique-supported-exact",
      ...empty,
      matchedRunId: exact[0]!.draft.run_id,
      score: 1,
      evidence: exact[0]!.evidence,
    };
  }
  const plausible = evaluated.filter(
    (item) => item.similarity >= weakThreshold,
  );
  if (plausible.length === 0) {
    return { origin: "manual", rationale: "no-plausible-draft", ...empty };
  }
  const best = plausible[0]!;
  const runnerUp = plausible[1];
  if (
    best.similarity < nearThreshold ||
    (runnerUp !== undefined &&
      best.score - runnerUp.score < ambiguityMargin)
  ) {
    return {
      origin: "unknown",
      rationale: runnerUp ? "competing-near-matches" : "weak-near-match",
      ...empty,
      score: best.similarity,
      evidence: best.evidence,
    };
  }
  return {
    origin: "unknown",
    rationale: "mixed-suggestion",
    matchedRunId: null,
    suggestedRunId: best.draft.run_id,
    score: Number(best.similarity.toFixed(4)),
    evidence: best.evidence,
    difference: difference(best.draft.proposal_text, source.text),
    draftText: best.draft.proposal_text,
  };
}

function evaluate(
  source: StoredSource,
  sourceCanonical: string,
  draft: StoredDraft,
): EvaluatedDraft | null {
  const input = JSON.parse(draft.input_json) as DraftStartRequest;
  if (
    input.destination &&
    source.conversation_key &&
    input.destination !== source.conversation_key
  ) {
    return null;
  }
  if (
    input.thread &&
    source.source_thread_key &&
    input.thread !== source.source_thread_key
  ) {
    return null;
  }
  const sourceMaterials = materialShape(
    JSON.parse(source.materials_json) as Material[],
  );
  const draftMaterials = materialShape(input.currentMaterials);
  if (
    sourceMaterials.length > 0 &&
    draftMaterials.length > 0 &&
    JSON.stringify(sourceMaterials) !== JSON.stringify(draftMaterials)
  ) {
    return null;
  }
  const canonical = canonicalizeSourceText(draft.proposal_text);
  const exact = canonical === sourceCanonical;
  const lengthRatio =
    Math.min(canonical.length, sourceCanonical.length) /
    Math.max(canonical.length, sourceCanonical.length, 1);
  const similarity =
    exact
      ? 1
      : canonical.length <= maximumNearLength &&
          sourceCanonical.length <= maximumNearLength &&
          lengthRatio >= weakThreshold
        ? similarityRatio(canonical, sourceCanonical)
        : 0;
  const evidence = ["Recent Draft Record"];
  let boost = 0;
  if (
    input.destination &&
    source.conversation_key &&
    input.destination === source.conversation_key
  ) {
    evidence.push("Destination matched");
    boost += 0.025;
  }
  if (
    input.thread &&
    source.source_thread_key &&
    input.thread === source.source_thread_key
  ) {
    evidence.push("Thread matched");
    boost += 0.025;
  }
  if (
    sourceMaterials.length > 0 &&
    draftMaterials.length > 0 &&
    JSON.stringify(sourceMaterials) === JSON.stringify(draftMaterials)
  ) {
    evidence.push("Ordered Materials matched");
    boost += 0.025;
  }
  return {
    draft,
    canonical,
    exact,
    similarity,
    score: similarity + boost,
    evidence,
  };
}

function materialShape(
  materials: Array<Pick<Material | DraftMaterialHint, "kind" | "role">>,
): Array<[string, string | null]> {
  return materials.map((material) => [
    material.kind,
    material.role ?? null,
  ]);
}

function isGeneric(value: string): boolean {
  const words = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  return value.length < 20 || words.length < 4;
}

function similarityRatio(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[right.length]! / Math.max(left.length, right.length);
}

function difference(draft: string, source: string): Difference {
  const left = draft.split(/\s+/);
  const right = source.split(/\s+/);
  let prefix = 0;
  while (
    prefix < left.length &&
    prefix < right.length &&
    left[prefix] === right[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    before: left.slice(0, prefix).join(" "),
    removed: left.slice(prefix, left.length - suffix).join(" "),
    added: right.slice(prefix, right.length - suffix).join(" "),
    after: suffix === 0 ? "" : left.slice(left.length - suffix).join(" "),
  };
}

function identifier(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new Error("Composition Origin identifier is invalid.");
  }
  return result;
}
