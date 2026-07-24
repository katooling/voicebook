import type { IncomingMessage, ServerResponse } from "node:http";
import { readProtectedForm } from "../../http/security.ts";
import type { QueueApplication } from "../port.ts";
import { CoreTagsChangedError } from "../port.ts";

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
  const expectedTagsJson = form.get("expectedTagsJson");
  if (!expectedTagsJson) {
    input.response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    input.response.end("Expected contextual tags are required.");
    return;
  }
  try {
    input.queue.updateCoreTags(
      input.coreMessageId,
      expectedTagsJson,
      (form.get("tags") ?? "").split(","),
    );
  } catch (error) {
    if (error instanceof CoreTagsChangedError) {
      input.response.writeHead(409, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      input.response.end(error.message);
      return;
    }
    throw error;
  }
  input.response.writeHead(303, { Location: "/core" });
  input.response.end();
}
