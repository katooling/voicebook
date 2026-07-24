import type { DatabaseSync } from "node:sqlite";
import { analyzeCandidate, normalizeTagInput } from "./analysis.ts";
import type {
  QueueApplication,
  QueueDependencies,
  SuggestedQueue,
  TaggedCoreMessage,
} from "./port.ts";
import type { AnalyzedCandidate, ContextualTag } from "./analysis.ts";
import type { CoreMessage } from "../core/port.ts";

const queueSize = 5;
const diversityOrder: ContextualTag[] = [
  "explanation",
  "question",
  "disagreement",
  "link",
  "evidence",
];

export class SqliteQueueApplication implements QueueApplication {
  readonly #database: DatabaseSync;
  readonly #dependencies: QueueDependencies;

  constructor(database: DatabaseSync, dependencies: QueueDependencies) {
    this.#database = database;
    this.#dependencies = dependencies;
  }

  suggested(): SuggestedQueue {
    const analyzed = this.#dependencies.candidates
      .list()
      .map(analyzeCandidate)
      .sort(compareCandidates);
    const selected: AnalyzedCandidate[] = [];

    for (const tag of diversityOrder) {
      const candidate = analyzed.find(
        (item) =>
          item.suggestedTags.includes(tag) &&
          !item.deprioritized &&
          !selected.includes(item) &&
          !selected.some((existing) => nearDuplicate(existing, item)),
      );
      if (candidate) {
        selected.push(candidate);
      }
      if (selected.length === queueSize) {
        break;
      }
    }

    for (const candidate of analyzed) {
      if (selected.length === queueSize) {
        break;
      }
      if (
        candidate.score < 0 ||
        candidate.deprioritized ||
        selected.includes(candidate) ||
        selected.some((existing) => nearDuplicate(existing, candidate))
      ) {
        continue;
      }
      selected.push(candidate);
    }

    return { candidates: selected, totalEligible: analyzed.length };
  }

  search(query: string): AnalyzedCandidate[] {
    return this.#dependencies.candidates
      .list(query)
      .map(analyzeCandidate)
      .sort(compareCandidates);
  }

  withCoreTags(coreMessages: CoreMessage[]): TaggedCoreMessage[] {
    if (coreMessages.length === 0) {
      return [];
    }
    const placeholders = coreMessages.map(() => "?").join(", ");
    const rows = this.#database
      .prepare(
        `SELECT id, tags_json FROM core_messages WHERE id IN (${placeholders})`,
      )
      .all(...coreMessages.map((message) => Number(message.id))) as unknown as Array<{
      id: number;
      tags_json: string;
    }>;
    const tagsById = new Map(
      rows.map((row) => [String(row.id), JSON.parse(row.tags_json) as string[]]),
    );
    return coreMessages.map((message) => ({
      ...message,
      tags: tagsById.get(message.id) ?? [],
    }));
  }

  updateCoreTags(coreMessageId: string, tags: string[]): void {
    const normalizedTags = normalizeTagInput(tags);
    const result = this.#database
      .prepare("UPDATE core_messages SET tags_json = ? WHERE id = ?")
      .run(JSON.stringify(normalizedTags), parseIdentifier(coreMessageId));
    if (result.changes !== 1) {
      throw new Error("Core Message was not found.");
    }
  }
}

function compareCandidates(
  left: AnalyzedCandidate,
  right: AnalyzedCandidate,
): number {
  return (
    right.score - left.score ||
    right.publishedAt.localeCompare(left.publishedAt) ||
    Number(left.id) - Number(right.id)
  );
}

function nearDuplicate(
  left: AnalyzedCandidate,
  right: AnalyzedCandidate,
): boolean {
  const leftTokens = normalizedTokens(left.text);
  const rightTokens = normalizedTokens(right.text);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return shared / union >= 0.8;
}

function normalizedTokens(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase("en")
      .replaceAll(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function parseIdentifier(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error("Core Message identifier is invalid.");
  }
  return id;
}
