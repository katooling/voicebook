import type { IncomingMessage, ServerResponse } from "node:http";
import { readProtectedForm } from "../../http/security.ts";
import type { QueueApplication } from "../port.ts";

export async function updateCoreTags(input: {
  request: IncomingMessage;
  response: ServerResponse;
  queue: QueueApplication;
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
  input.queue.updateCoreTags(
    input.coreMessageId,
    (form.get("tags") ?? "").split(","),
  );
  input.response.writeHead(303, { Location: "/core" });
  input.response.end();
}
