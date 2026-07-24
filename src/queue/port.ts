import type { CandidateApplication } from "../candidates/port.ts";
import type { CoreMessage } from "../core/port.ts";
import type { AnalyzedCandidate } from "./analysis.ts";

export type SuggestedQueue = {
  candidates: AnalyzedCandidate[];
  totalEligible: number;
};

export type TaggedCoreMessage = CoreMessage & {
  tags: string[];
  expectedTagsJson: string;
};

export class CoreTagsChangedError extends Error {
  constructor() {
    super("Core Message tags changed. Refresh before saving your correction.");
    this.name = "CoreTagsChangedError";
  }
}

export interface QueueApplication {
  suggested(): SuggestedQueue;
  search(query: string): AnalyzedCandidate[];
  withCoreTags(coreMessages: CoreMessage[]): TaggedCoreMessage[];
  updateCoreTags(
    coreMessageId: string,
    expectedTagsJson: string,
    tags: string[],
  ): void;
}

export type QueueDependencies = {
  candidates: CandidateApplication;
};
