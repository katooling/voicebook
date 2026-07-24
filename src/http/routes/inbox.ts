import type { IncomingMessage, ServerResponse } from "node:http";
import type { QueueApplication } from "../../queue/port.ts";
import { renderInbox } from "../html.ts";

export function showInbox(input: {
  request: IncomingMessage;
  response: ServerResponse;
  queue: QueueApplication;
  csrfToken: string;
  url: URL;
}): void {
  const search = input.url.searchParams.get("q") ?? "";
  const result =
    search.trim() === ""
      ? { mode: "suggested" as const, ...input.queue.suggested() }
      : {
          mode: "search" as const,
          candidates: input.queue.search(search),
          totalEligible: undefined,
        };
  const html = renderInbox({
    ...result,
    csrfToken: input.csrfToken,
    search,
  });
  input.response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  input.response.end(html);
}
