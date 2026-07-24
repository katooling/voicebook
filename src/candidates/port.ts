import type {
  ImportEnvelope,
  ImportResult,
  Material,
  SlackContextItem,
} from "../contracts.ts";

export type Candidate = {
  id: string;
  revision: string;
  publishedAt: string;
  text: string;
  context: SlackContextItem[];
  materials: Material[];
};

export type CandidateDecision = "accept" | "pin" | "reject" | "sensitive";

export class CandidateChangedError extends Error {
  constructor() {
    super("Candidate changed. Refresh and review the latest version.");
    this.name = "CandidateChangedError";
  }
}

export interface CandidateApplication {
  import(envelope: ImportEnvelope): ImportResult;
  list(search?: string): Candidate[];
  review(
    candidateId: string,
    expectedRevision: string,
    decision: CandidateDecision,
  ): void;
}
