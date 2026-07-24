import type { Material } from "../contracts.ts";
import { canonicalizeSourceText } from "./normalization.ts";
import type { CompositionOrigin, Difference } from "./port.ts";

export const matcherVersion = "composition-v2";

const nearThreshold = 0.82;
const ambiguityMargin = 0.08;
const weakThreshold = 0.45;
const maximumNearLength = 4_000;

export type ReconciliationMaterial = {
  kind: Material["kind"];
  role?: Material["role"];
};

export type ReconciliationSource = {
  text: string;
  deleted: boolean;
  conversationKey: string | null;
  threadKey: string | null;
  materials: ReconciliationMaterial[];
};

export type ReconciliationDraft = {
  runId: string;
  proposalText: string;
  recordedAt: string;
  destination?: string;
  thread?: string;
  materials: ReconciliationMaterial[];
};

export type ReconciliationDecision = {
  origin: CompositionOrigin;
  rationale: string;
  matchedRunId: string | null;
  suggestedRunId: string | null;
  score: number | null;
  evidence: string[];
  difference: Difference | null;
  draftText: string | null;
};

type EvaluatedDraft = {
  draft: ReconciliationDraft;
  exact: boolean;
  similarity: number;
  score: number;
  evidence: string[];
};

export function reconcileCompositionOrigin(
  source: ReconciliationSource,
  drafts: ReconciliationDraft[],
): ReconciliationDecision {
  const empty = {
    matchedRunId: null,
    suggestedRunId: null,
    score: null,
    evidence: [] as string[],
    difference: null,
    draftText: null,
  };
  if (source.deleted) {
    return { origin: "unknown", rationale: "source-deleted", ...empty };
  }
  const sourceCanonical = canonicalizeSourceText(source.text);
  const evaluated = drafts
    .map((draft) => evaluate(source, sourceCanonical, draft))
    .filter((value): value is EvaluatedDraft => value !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.draft.recordedAt.localeCompare(left.draft.recordedAt) ||
        left.draft.runId.localeCompare(right.draft.runId),
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
      matchedRunId: exact[0]!.draft.runId,
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
    suggestedRunId: best.draft.runId,
    score: Number(best.similarity.toFixed(4)),
    evidence: best.evidence,
    difference: difference(best.draft.proposalText, source.text),
    draftText: best.draft.proposalText,
  };
}

function evaluate(
  source: ReconciliationSource,
  sourceCanonical: string,
  draft: ReconciliationDraft,
): EvaluatedDraft | null {
  if (
    draft.destination &&
    source.conversationKey &&
    draft.destination !== source.conversationKey
  ) {
    return null;
  }
  if (
    draft.thread &&
    source.threadKey &&
    draft.thread !== source.threadKey
  ) {
    return null;
  }
  const sourceMaterials = materialShape(source.materials);
  const draftMaterials = materialShape(draft.materials);
  if (
    sourceMaterials.length > 0 &&
    draftMaterials.length > 0 &&
    JSON.stringify(sourceMaterials) !== JSON.stringify(draftMaterials)
  ) {
    return null;
  }
  const canonical = canonicalizeSourceText(draft.proposalText);
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
    draft.destination &&
    source.conversationKey &&
    draft.destination === source.conversationKey
  ) {
    evidence.push("Destination matched");
    boost += 0.025;
  }
  if (
    draft.thread &&
    source.threadKey &&
    draft.thread === source.threadKey
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
    exact,
    similarity,
    score: similarity + boost,
    evidence,
  };
}

function materialShape(
  materials: ReconciliationMaterial[],
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
