import type { DatabaseSync } from "node:sqlite";
import type {
  ExportApplication,
  ExportCoreMessage,
  ExportMaterial,
  PrivateBackup,
} from "./port.ts";

type StoredCoreMessage = {
  export_order: number;
  text: string;
  tags_json: string;
  pinned: number;
};

type StoredMaterial = {
  export_order: number;
  ordinal: number;
  kind: string;
  role: string;
  label: string | null;
  url: string | null;
};

export class SqliteExportApplication implements ExportApplication {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  privateBackup(): PrivateBackup {
    this.#database.exec("BEGIN");
    try {
      const profile = this.#database
        .prepare(`
          SELECT text
          FROM voice_profiles
          ORDER BY id DESC
          LIMIT 1
        `)
        .get() as { text: string } | undefined;
      if (!profile) {
        throw new Error(
          "A private backup requires an active Voice Profile. Create one before exporting.",
        );
      }

      const storedMessages = this.#database
        .prepare(`
          SELECT
            row_number() OVER (ORDER BY accepted_at ASC, id ASC) AS export_order,
            text,
            tags_json,
            pinned
          FROM core_messages
          ORDER BY accepted_at ASC, id ASC
        `)
        .all() as unknown as StoredCoreMessage[];
      const storedMaterials = this.#database
        .prepare(`
          SELECT
            ranked.export_order,
            CAST(json_extract(material.value, '$.ordinal') AS INTEGER) AS ordinal,
            CAST(json_extract(material.value, '$.kind') AS TEXT) AS kind,
            CAST(json_extract(material.value, '$.role') AS TEXT) AS role,
            CAST(json_extract(material.value, '$.label') AS TEXT) AS label,
            CAST(json_extract(material.value, '$.url') AS TEXT) AS url
          FROM (
            SELECT
              id,
              materials_json,
              row_number() OVER (ORDER BY accepted_at ASC, id ASC) AS export_order
            FROM core_messages
          ) AS ranked
          JOIN json_each(ranked.materials_json) AS material
          ORDER BY ranked.export_order ASC, ordinal ASC, material.key ASC
        `)
        .all() as unknown as StoredMaterial[];

      const materialsByMessage = new Map<number, ExportMaterial[]>();
      for (const material of storedMaterials) {
        const exported: ExportMaterial = {
          ordinal: material.ordinal,
          kind: material.kind,
          role: material.role,
        };
        if (material.label !== null) {
          exported.label = material.label;
        }
        if (material.url !== null) {
          exported.url = material.url;
        }
        const existing = materialsByMessage.get(material.export_order) ?? [];
        existing.push(exported);
        materialsByMessage.set(material.export_order, existing);
      }

      const coreMessages: ExportCoreMessage[] = storedMessages.map((message) => ({
        text: message.text,
        tags: parseTags(message.tags_json),
        pinned: message.pinned === 1,
        materials: materialsByMessage.get(message.export_order) ?? [],
      }));
      this.#database.exec("COMMIT");
      return { profile: profile.text, coreMessages };
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

function parseTags(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((tag): tag is string => typeof tag === "string")
  ) {
    throw new Error("Core Message tags are invalid.");
  }
  return parsed;
}
