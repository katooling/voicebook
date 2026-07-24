import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Material } from "../contracts.ts";
import type {
  DraftApplication,
  DraftFinishReceipt,
  DraftMaterialHint,
  DraftStartReceipt,
  DraftStartRequest,
} from "./port.ts";
import { DraftOperationError } from "./port.ts";

const configurationVersion = "draft-brief-v1";
const maximumCoreExamples = 4;

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

type SelectedCore = {
  id: string;
  text: string;
  tags: string[];
  materials: Array<
    Pick<Material, "ordinal" | "kind" | "role" | "label">
  >;
  pinned: boolean;
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

  #coreMessages(): StoredCore[] {
    return this.#database
      .prepare(`
        SELECT id, text, materials_json, tags_json, pinned, accepted_at
        FROM core_messages
      `)
      .all() as unknown as StoredCore[];
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

function selectCore(
  rows: StoredCore[],
  request: DraftStartRequest,
): SelectedCore[] {
  const intent = [
    request.objective,
    request.audience,
    request.situation,
    ...request.constraints,
    request.destination,
    request.thread,
    ...request.currentMaterials.map((material) =>
      [material.kind, material.role, material.description]
        .filter(Boolean)
        .join(" "),
    ),
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  const terms = new Set(
    intent
      .toLocaleLowerCase("en")
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((term) => term.length >= 3 && !stopWords.has(term)) ?? [],
  );
  const desiredTags = inferDesiredTags(intent, request.currentMaterials);
  const desiredMaterialKinds = new Set(
    request.currentMaterials.map((material) => material.kind),
  );
  const desiredMaterialRoles = new Set(
    request.currentMaterials
      .map((material) => material.role)
      .filter((role): role is NonNullable<DraftMaterialHint["role"]> =>
        role !== undefined,
      ),
  );

  return rows
    .map((row) => {
      const tags = JSON.parse(row.tags_json) as string[];
      const materials = (
        JSON.parse(row.materials_json) as Material[]
      ).map((material) => ({
        ordinal: material.ordinal,
        kind: material.kind,
        role: material.role,
        ...(material.label === undefined ? {} : { label: material.label }),
      }));
      const messageTerms = new Set(
        row.text.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [],
      );
      const tagScore =
        tags.filter((tag) => desiredTags.has(tag)).length * 20;
      const lexicalScore =
        [...terms].filter((term) => messageTerms.has(term)).length * 2;
      const materialScore = materials.reduce(
        (total, material) =>
          total +
          (desiredMaterialKinds.has(material.kind) ? 6 : 0) +
          (desiredMaterialRoles.has(material.role) ? 4 : 0),
        0,
      );
      return {
        selected: {
          id: String(row.id),
          text: row.text,
          tags,
          materials,
          pinned: row.pinned === 1,
        },
        score:
          tagScore +
          lexicalScore +
          materialScore +
          (row.pinned === 1 ? 5 : 0),
        acceptedAt: row.accepted_at,
        numericId: row.id,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.selected.pinned) - Number(left.selected.pinned) ||
        right.acceptedAt.localeCompare(left.acceptedAt) ||
        right.numericId - left.numericId,
    )
    .slice(0, maximumCoreExamples)
    .map((item) => item.selected);
}

function inferDesiredTags(
  intent: string,
  materials: DraftMaterialHint[],
): Set<string> {
  const tags = new Set<string>();
  if (/\b(explain|explanation|because|why)\b/i.test(intent)) {
    tags.add("explanation");
  }
  if (/[?]|\b(ask|question|whether|confirm|verify)\b/i.test(intent)) {
    tags.add("question");
  }
  if (/\b(disagree|disagreement|push back|not convinced)\b/i.test(intent)) {
    tags.add("disagreement");
  }
  if (/\b(request|ask|please|can you|could you)\b/i.test(intent)) {
    tags.add("request");
  }
  if (
    /\b(link|linked|url)\b/i.test(intent) ||
    materials.some((material) => material.kind === "link")
  ) {
    tags.add("link");
  }
  if (
    /\b(evidence|screenshot|image)\b/i.test(intent) ||
    materials.some(
      (material) =>
        material.kind === "image" || material.role === "evidence",
    )
  ) {
    tags.add("evidence");
  }
  return tags;
}

function renderDraftBrief(input: {
  request: DraftStartRequest;
  profileText: string;
  profileStatus: "current" | "stale";
  selectedCore: SelectedCore[];
}): string {
  const situation = [
    field("Audience", input.request.audience),
    field("Situation", input.request.situation),
    field("Destination", input.request.destination),
    field("Thread", input.request.thread),
  ].filter((value): value is string => value !== null);
  const constraints =
    input.request.constraints.length === 0
      ? ["- None supplied."]
      : input.request.constraints.map(
          (constraint) => `- ${inline(constraint)}`,
        );
  const currentMaterials =
    input.request.currentMaterials.length === 0
      ? ["- None supplied."]
      : input.request.currentMaterials.map((material, index) => {
          const details = [
            material.kind,
            material.role,
            material.description,
          ].filter(Boolean);
          return `- ${index + 1}. ${details.map((value) => inline(value!)).join(" — ")}`;
        });
  const examples = input.selectedCore.flatMap((message, index) => {
    const materialLines =
      message.materials.length === 0
        ? ["- Historical Material patterns: none."]
        : [
            "- Historical Material patterns:",
            ...message.materials.map(
              (material) =>
                `  - ${material.ordinal}. ${inline(material.kind)} / ${inline(material.role)}${
                  material.label ? ` / ${inline(material.label)}` : ""
                }`,
            ),
          ];
    return [
      `### Example ${index + 1}`,
      `- Tags: ${message.tags.length === 0 ? "none" : message.tags.map(inline).join(", ")}`,
      ...materialLines,
      "",
      quote(message.text),
      "",
    ];
  });

  return [
    "# Draft Brief",
    "",
    "Write one proposed Slack message. Improve accidental ambiguity, grammar, and unintended harshness while preserving the demonstrated voice.",
    "",
    "## Objective",
    "",
    input.request.objective,
    "",
    "## Situation",
    "",
    ...(situation.length === 0 ? ["- None supplied."] : situation),
    "",
    "### Constraints",
    "",
    ...constraints,
    "",
    "### Current Materials",
    "",
    "These describe the current situation. They are not voice evidence.",
    "",
    ...currentMaterials,
    "",
    "## Voice Profile",
    "",
    `- Profile status: ${capitalize(input.profileStatus)}`,
    "",
    input.profileText,
    "",
    "## Relevant Core Messages",
    "",
    "Only the examples below are voice evidence for this Draft Run.",
    "",
    ...examples,
  ].join("\n");
}

function field(label: string, value: string | undefined): string | null {
  return value === undefined ? null : `- ${label}: ${inline(value)}`;
}

function inline(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

function quote(value: string): string {
  return value.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
}

function capitalize(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const stopWords = new Set([
  "and",
  "are",
  "for",
  "from",
  "into",
  "one",
  "that",
  "the",
  "this",
  "with",
  "write",
]);
