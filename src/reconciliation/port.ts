import type { Candidate } from "../candidates/port.ts";

export type CompositionOrigin = "manual" | "agent" | "mixed" | "unknown";

export type Difference = {
  before: string;
  removed: string;
  added: string;
  after: string;
};

export type MixedSuggestion = {
  draftRunId: string;
  draftText: string;
  score: number;
  evidence: string[];
  difference: Difference;
  suggestionRevision: string;
};

export type OriginStatus = {
  sourceKey: string;
  sourceId: string;
  sourceRevision: string;
  origin: CompositionOrigin;
  rationale: string;
  canonicalizerVersion: string;
  matcherVersion: string;
  suggestion: MixedSuggestion | null;
};

export type CandidateWithOrigin = Candidate & {
  compositionOrigin: OriginStatus;
};

export class OriginChangedError extends Error {
  constructor() {
    super("Composition Origin changed. Refresh and review the latest evidence.");
    this.name = "OriginChangedError";
  }
}

export interface ReconciliationApplication {
  reconcileSourceMessage(sourceMessageId: number): void;
  status(sourceKey: string): OriginStatus;
  withOrigins<T extends Candidate>(candidates: T[]): Array<
    T & { compositionOrigin: OriginStatus }
  >;
  confirmMixed(input: {
    sourceMessageId: string;
    sourceRevision: string;
    suggestionRevision: string;
    draftRunId: string;
  }): void;
}
