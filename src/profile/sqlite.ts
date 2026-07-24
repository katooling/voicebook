import type { DatabaseSync } from "node:sqlite";
import type {
  ActiveVoiceProfile,
  ProfileApplication,
  ProfileCoreMessage,
  ProfilePreparation,
  ProfileStatus,
} from "./port.ts";
import { CoreChangedError } from "./port.ts";

type StoredCoreMessage = {
  id: number;
  text: string;
  materials_json: string;
  pinned: number;
  accepted_at: string;
};

type StoredProfile = {
  text: string;
  based_on_revision: number;
  created_at: string;
};

export class SqliteProfileApplication implements ProfileApplication {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  prepare(): ProfilePreparation {
    this.#database.exec("BEGIN");
    try {
      const result = {
        coreRevision: String(this.#coreRevision()),
        coreMessages: this.#coreMessages(),
      };
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  status(): ProfileStatus {
    this.#database.exec("BEGIN");
    try {
      const status = this.#status();
      this.#database.exec("COMMIT");
      return status;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  submit(basisRevision: string, text: string): ProfileStatus {
    const expectedRevision = parseRevision(basisRevision);
    if (text.trim() === "") {
      throw new Error("Voice Profile text must not be empty.");
    }
    if (Buffer.byteLength(text, "utf8") > 128 * 1024) {
      throw new Error("Voice Profile text exceeds 128 KiB.");
    }

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const revision = this.#coreRevision();
      if (revision !== expectedRevision) {
        throw new CoreChangedError();
      }
      const coreCount = this.#database
        .prepare("SELECT count(*) AS count FROM core_messages")
        .get() as { count: number };
      if (coreCount.count === 0) {
        throw new Error(
          "Voice Profile requires at least one accepted Core Message.",
        );
      }
      this.#database
        .prepare(`
          INSERT INTO voice_profiles (text, based_on_revision, created_at)
          VALUES (?, ?, ?)
        `)
        .run(text, revision, new Date().toISOString());
      const status = this.#status();
      this.#database.exec("COMMIT");
      return status;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #status(): ProfileStatus {
    const coreRevision = this.#coreRevision();
    const activeProfile = this.#activeProfile();
    return {
      status:
        activeProfile === null
          ? "missing"
          : Number(activeProfile.basisRevision) === coreRevision
            ? "current"
            : "stale",
      coreRevision: String(coreRevision),
      activeProfile,
    };
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

  #coreMessages(): ProfileCoreMessage[] {
    const rows = this.#database
      .prepare(`
        SELECT id, text, materials_json, pinned, accepted_at
        FROM core_messages
        ORDER BY pinned DESC, accepted_at ASC, id ASC
      `)
      .all() as unknown as StoredCoreMessage[];
    return rows.map((row) => ({
      id: String(row.id),
      text: row.text,
      materials: JSON.parse(row.materials_json) as ProfileCoreMessage["materials"],
      pinned: row.pinned === 1,
      acceptedAt: row.accepted_at,
    }));
  }

  #activeProfile(): ActiveVoiceProfile | null {
    const row = this.#database
      .prepare(`
        SELECT text, based_on_revision, created_at
        FROM voice_profiles
        ORDER BY id DESC
        LIMIT 1
      `)
      .get() as StoredProfile | undefined;
    return row
      ? {
          text: row.text,
          basisRevision: String(row.based_on_revision),
          createdAt: row.created_at,
        }
      : null;
  }
}

function parseRevision(value: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error("basisRevision must be a non-negative integer.");
  }
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) {
    throw new Error("basisRevision is outside the supported range.");
  }
  return revision;
}
