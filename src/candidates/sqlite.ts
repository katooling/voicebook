import type { DatabaseSync } from "node:sqlite";
import type {
  ImportEnvelope,
  ImportResult,
  Material,
  NormalizedSourceMessage,
} from "../contracts.ts";
import type {
  Candidate,
  CandidateApplication,
  CandidateDecision,
} from "./port.ts";
import { CandidateChangedError } from "./port.ts";
import { validateImportEnvelope } from "./validation.ts";

type StoredSource = {
  id: number;
  published_at: string;
  text: string;
  context_json: string;
  materials_json: string;
  revision: number;
};

export class SqliteCandidateApplication implements CandidateApplication {
  readonly #database: DatabaseSync;
  readonly #suggestTags: (input: {
    text: string;
    materials: Material[];
  }) => readonly string[];

  constructor(
    database: DatabaseSync,
    options: {
      suggestTags: (input: {
        text: string;
        materials: Material[];
      }) => readonly string[];
    },
  ) {
    this.#database = database;
    this.#suggestTags = options.suggestTags;
  }

  import(envelope: ImportEnvelope): ImportResult {
    validateImportEnvelope(envelope);

    const result: ImportResult = { imported: 0, updated: 0, unchanged: 0 };
    const find = this.#database.prepare(
      "SELECT id, published_at, text, context_json, materials_json FROM source_messages WHERE source_key = ?",
    );
    const insert = this.#database.prepare(`
      INSERT INTO source_messages (
        source_key, published_at, text, context_json, materials_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const update = this.#database.prepare(`
      UPDATE source_messages
      SET published_at = ?, text = ?, context_json = ?, materials_json = ?,
          revision = revision + 1, updated_at = ?
      WHERE source_key = ?
    `);

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      for (const message of envelope.sourceMessages) {
        const contextJson = JSON.stringify(normalizedContext(message));
        const materialsJson = JSON.stringify(orderedMaterials(message));
        const existing = find.get(message.sourceKey) as StoredSource | undefined;

        if (!existing) {
          insert.run(
            message.sourceKey,
            message.publishedAt,
            message.text,
            contextJson,
            materialsJson,
            new Date().toISOString(),
          );
          result.imported += 1;
        } else if (
          existing.published_at === message.publishedAt &&
          existing.text === message.text &&
          existing.context_json === contextJson &&
          existing.materials_json === materialsJson
        ) {
          result.unchanged += 1;
        } else {
          update.run(
            message.publishedAt,
            message.text,
            contextJson,
            materialsJson,
            new Date().toISOString(),
            message.sourceKey,
          );
          result.updated += 1;
        }
      }
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }

    return result;
  }

  list(search = ""): Candidate[] {
    const escapedSearch = search.trim();
    const rows = (
      escapedSearch === ""
        ? this.#database
            .prepare(`
              SELECT id, published_at, text, context_json, materials_json, revision
              FROM source_messages
              WHERE review_state = 'pending'
              ORDER BY published_at DESC, id DESC
            `)
            .all()
        : this.#database
            .prepare(`
              SELECT id, published_at, text, context_json, materials_json, revision
              FROM source_messages
              WHERE review_state = 'pending' AND text LIKE ? ESCAPE '\\'
              ORDER BY published_at DESC, id DESC
            `)
            .all(`%${escapeLike(escapedSearch)}%`)
    ) as unknown as StoredSource[];

    return rows.map((row) => ({
      id: String(row.id),
      revision: String(row.revision),
      publishedAt: row.published_at,
      text: row.text,
      context: JSON.parse(row.context_json) as Candidate["context"],
      materials: JSON.parse(row.materials_json) as Candidate["materials"],
    }));
  }

  review(
    candidateId: string,
    expectedRevision: string,
    decision: CandidateDecision,
  ): void {
    const id = parseIdentifier(candidateId);
    const revision = parseIdentifier(expectedRevision);

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const source = this.#database
        .prepare(`
          SELECT id, text, materials_json, revision
          FROM source_messages
          WHERE id = ? AND review_state = 'pending'
        `)
        .get(id) as
        | { id: number; text: string; materials_json: string; revision: number }
        | undefined;
      if (!source) {
        throw new Error("Candidate was not found or is no longer pending.");
      }
      if (source.revision !== revision) {
        throw new CandidateChangedError();
      }

      if (decision === "accept" || decision === "pin") {
        const materials = JSON.parse(source.materials_json) as Material[];
        const tags = this.#suggestTags({ text: source.text, materials });
        this.#database
          .prepare(`
            INSERT INTO core_messages (
              source_message_id, text, materials_json, tags_json, pinned, accepted_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(
            source.id,
            source.text,
            source.materials_json,
            JSON.stringify(tags),
            decision === "pin" ? 1 : 0,
            new Date().toISOString(),
          );
      }
      this.#database
        .prepare("UPDATE source_messages SET review_state = ? WHERE id = ?")
        .run(
          decision === "accept" || decision === "pin"
            ? "accepted"
            : decision === "reject"
              ? "rejected"
              : decision,
          id,
        );
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

function orderedMaterials(message: NormalizedSourceMessage) {
  return [...message.materials]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((material) => ({
      ordinal: material.ordinal,
      kind: material.kind,
      role: material.role,
      ...(material.label === undefined ? {} : { label: material.label }),
      ...(material.url === undefined ? {} : { url: material.url }),
      ...(material.sourceReference === undefined
        ? {}
        : { sourceReference: material.sourceReference }),
    }));
}

function normalizedContext(message: NormalizedSourceMessage) {
  return message.context.map((item) => ({
    position: item.position,
    authorLabel: item.authorLabel,
    text: item.text,
  }));
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function parseIdentifier(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Candidate identifier is invalid.");
  }
  return id;
}
