import type { IncomingMessage, ServerResponse } from "node:http";
import { readProtectedForm } from "../../http/security.ts";
import type { ReconciliationApplication } from "../port.ts";
import { OriginChangedError } from "../port.ts";

export async function confirmMixed(input: {
  request: IncomingMessage;
  response: ServerResponse;
  reconciliation: ReconciliationApplication;
  sourceMessageId: string;
  csrfToken: string;
}): Promise<void> {
  const form = await readProtectedForm(input.request, input.csrfToken);
  if (!form) {
    respond(input.response, 403, "Invalid CSRF token.");
    return;
  }
  const sourceRevision = form.get("sourceRevision");
  const suggestionRevision = form.get("suggestionRevision");
  const draftRunId = form.get("draftRunId");
  if (!sourceRevision || !suggestionRevision || !draftRunId) {
    respond(input.response, 400, "Mixed confirmation evidence is required.");
    return;
  }
  try {
    input.reconciliation.confirmMixed({
      sourceMessageId: input.sourceMessageId,
      sourceRevision,
      suggestionRevision,
      draftRunId,
    });
  } catch (error) {
    if (error instanceof OriginChangedError) {
      respond(input.response, 409, error.message);
      return;
    }
    throw error;
  }
  input.response.writeHead(303, { Location: "/" });
  input.response.end();
}

function respond(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
