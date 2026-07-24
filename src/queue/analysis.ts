import type { Candidate } from "../candidates/port.ts";

export const contextualTags = [
  "explanation",
  "question",
  "disagreement",
  "request",
  "link",
  "evidence",
] as const;

export type ContextualTag = (typeof contextualTags)[number];

export type RankingReason = {
  tag: ContextualTag;
  label: string;
};

export type AnalyzedCandidate = Candidate & {
  suggestedTags: ContextualTag[];
  rankingReasons: RankingReason[];
  score: number;
  deprioritized: boolean;
};

const reasonByTag: Record<ContextualTag, string> = {
  explanation: "Explanation",
  question: "Question",
  disagreement: "Disagreement",
  request: "Request",
  link: "Linked reference",
  evidence: "Screenshot evidence",
};

export function analyzeCandidate(candidate: Candidate): AnalyzedCandidate {
  const suggestedTags = suggestContextualTags(candidate);
  const acknowledgement =
    /^(thanks|thank you|got it|sounds good|ok|okay|sure|yep|yes|done|sgtm)[.!]?$/i.test(
      candidate.text.trim(),
    );
  const pastedLog =
    candidate.text.split(/\r?\n/).length >= 3 &&
    (/\b(INFO|ERROR|WARN|DEBUG)\b/.test(candidate.text) ||
      /^\s+at\s/m.test(candidate.text));
  const codeOnly =
    /^```[\s\S]*```$/.test(candidate.text.trim()) ||
    (candidate.text.includes("\n") &&
      !/[.!?](?:\s|$)/.test(candidate.text) &&
      /[{}();=]/.test(candidate.text));
  const deprioritized = acknowledgement || pastedLog || codeOnly;

  const score =
    suggestedTags.reduce(
      (total, tag) =>
        total +
        (tag === "explanation"
          ? 5
          : tag === "disagreement" || tag === "evidence"
            ? 4
            : 3),
      0,
    ) - (deprioritized ? 12 : 0);

  return {
    ...candidate,
    suggestedTags,
    rankingReasons: suggestedTags.map((tag) => ({
      tag,
      label: reasonByTag[tag],
    })),
    score,
    deprioritized,
  };
}

export function suggestContextualTags(
  candidate: Pick<Candidate, "text" | "materials">,
): ContextualTag[] {
  const lowerText = candidate.text.toLocaleLowerCase("en");
  const suggestedTags: ContextualTag[] = [];

  if (
    candidate.text.length >= 140 ||
    /\b(because|therefore|this means)\b/i.test(candidate.text)
  ) {
    suggestedTags.push("explanation");
  }
  if (candidate.text.includes("?")) {
    suggestedTags.push("question");
  }
  if (
    /\b(i (?:do not|don't) think|not convinced|disagree|however)\b/i.test(
      candidate.text,
    )
  ) {
    suggestedTags.push("disagreement");
  }
  if (/\b(please|can you|could you|would you)\b/i.test(candidate.text)) {
    suggestedTags.push("request");
  }
  if (
    candidate.materials.some((material) => material.kind === "link") ||
    /https?:\/\//i.test(candidate.text)
  ) {
    suggestedTags.push("link");
  }
  if (
    candidate.materials.some(
      (material) =>
        material.kind === "image" &&
        (material.role === "evidence" || material.role === "reference"),
    ) ||
    /\b(screenshot|image)\b/i.test(candidate.text)
  ) {
    suggestedTags.push("evidence");
  }

  return suggestedTags;
}

export function normalizeTagInput(rawTags: string[]): string[] {
  const tags: string[] = [];
  for (const rawTag of rawTags) {
    const tag = rawTag
      .trim()
      .toLocaleLowerCase("en")
      .replaceAll(/\s+/g, "-");
    if (tag === "") {
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag) || tag.length > 32) {
      throw new Error(
        "Contextual tags must contain letters, numbers, spaces, or hyphens.",
      );
    }
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  if (tags.length > 12) {
    throw new Error("A Core Message can have at most 12 contextual tags.");
  }
  return tags;
}
