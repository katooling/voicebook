import type { IncomingMessage, ServerResponse } from "node:http";
import type { CoreApplication } from "../../core/port.ts";
import { readProtectedForm } from "../security.ts";

export async function removeCoreMessage(input: {
  request: IncomingMessage;
  response: ServerResponse;
  core: CoreApplication;
  coreMessageId: string;
  csrfToken: string;
}): Promise<void> {
  const form = await readProtectedForm(input.request, input.csrfToken);
  if (!form) {
    input.response.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    input.response.end("Invalid CSRF token.");
    return;
  }
  input.core.remove(input.coreMessageId);
  input.response.writeHead(303, { Location: "/core" });
  input.response.end();
}
