import type { DatabaseSync } from "node:sqlite";
import type { CoreApplication, CoreMessage } from "./port.ts";

type StoredCoreMessage = {
  id: number;
  text: string;
  materials_json: string;
  pinned: number;
  accepted_at: string;
};

export class SqliteCoreApplication implements CoreApplication {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  search(query = ""): CoreMessage[] {
    const value = query.trim();
    const rows = (
      value === ""
        ? this.#database
            .prepare(`
              SELECT id, text, materials_json, pinned, accepted_at
              FROM core_messages
              ORDER BY pinned DESC, accepted_at DESC, id DESC
            `)
            .all()
        : this.#database
            .prepare(`
              SELECT id, text, materials_json, pinned, accepted_at
              FROM core_messages
              WHERE text LIKE ? ESCAPE '\\'
              ORDER BY pinned DESC, accepted_at DESC, id DESC
            `)
            .all(`%${escapeLike(value)}%`)
    ) as unknown as StoredCoreMessage[];

    return rows.map((row) => ({
      id: String(row.id),
      text: row.text,
      materials: JSON.parse(row.materials_json) as CoreMessage["materials"],
      pinned: row.pinned === 1,
      acceptedAt: row.accepted_at,
    }));
  }

  pin(coreMessageId: string): void {
    const result = this.#database
      .prepare("UPDATE core_messages SET pinned = 1 WHERE id = ?")
      .run(parseIdentifier(coreMessageId));
    if (result.changes !== 1) {
      throw new Error("Core Message was not found.");
    }
  }

  remove(coreMessageId: string): void {
    const id = parseIdentifier(coreMessageId);
    const found = this.#database
      .prepare("SELECT source_message_id FROM core_messages WHERE id = ?")
      .get(id) as { source_message_id: number } | undefined;
    if (!found) {
      throw new Error("Core Message was not found.");
    }

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database.prepare("DELETE FROM core_messages WHERE id = ?").run(id);
      this.#database
        .prepare(
          "UPDATE source_messages SET review_state = 'removed' WHERE id = ?",
        )
        .run(found.source_message_id);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function parseIdentifier(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Core Message identifier is invalid.");
  }
  return id;
}
