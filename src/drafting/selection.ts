import type { Material } from "../contracts.ts";
import type {
  DraftMaterialHint,
  DraftStartRequest,
} from "./port.ts";

const maximumCoreExamples = 4;

export type DraftCoreMessage = {
  id: number;
  text: string;
  tags: string[];
  materials: Material[];
  pinned: boolean;
  acceptedAt: string;
};

export type SelectedCore = {
  id: string;
  text: string;
  tags: string[];
  materials: Array<
    Pick<Material, "ordinal" | "kind" | "role" | "label">
  >;
  pinned: boolean;
};

export function selectCore(
  rows: DraftCoreMessage[],
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
      const materials = row.materials.map((material) => ({
        ordinal: material.ordinal,
        kind: material.kind,
        role: material.role,
        ...(material.label === undefined ? {} : { label: material.label }),
      }));
      const messageTerms = new Set(
        row.text.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [],
      );
      const tagScore =
        row.tags.filter((tag) => desiredTags.has(tag)).length * 20;
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
          tags: row.tags,
          materials,
          pinned: row.pinned,
        },
        score:
          tagScore +
          lexicalScore +
          materialScore +
          (row.pinned ? 5 : 0),
        acceptedAt: row.acceptedAt,
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
