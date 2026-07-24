import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  CandidateApplication,
  CandidateDecision,
} from "../../candidates/port.ts";
import { CandidateChangedError } from "../../candidates/port.ts";
import { readProtectedForm } from "../security.ts";

const decisions = new Set<CandidateDecision>([
  "accept",
  "pin",
  "reject",
  "sensitive",
]);

export async function reviewCandidate(input: {
  request: IncomingMessage;
  response: ServerResponse;
  candidates: CandidateApplication;
  candidateId: string;
  decision: string;
  csrfToken: string;
}): Promise<void> {
  if (!decisions.has(input.decision as CandidateDecision)) {
    throw new Error("Candidate decision is invalid.");
  }
  const form = await readProtectedForm(input.request, input.csrfToken);
  if (!form) {
    input.response.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    input.response.end("Invalid CSRF token.");
    return;
  }
  const revision = form.get("revision");
  if (!revision) {
    input.response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    input.response.end("Candidate revision is required.");
    return;
  }
  try {
    input.candidates.review(
      input.candidateId,
      revision,
      input.decision as CandidateDecision,
    );
  } catch (error) {
    if (error instanceof CandidateChangedError) {
      input.response.writeHead(409, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      input.response.end(error.message);
      return;
    }
    throw error;
  }
  input.response.writeHead(303, { Location: "/" });
  input.response.end();
}
