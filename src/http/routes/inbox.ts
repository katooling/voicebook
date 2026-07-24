import type { IncomingMessage, ServerResponse } from "node:http";
import type { CandidateApplication } from "../../candidates/port.ts";
import { renderInbox } from "../html.ts";

export function showInbox(input: {
  request: IncomingMessage;
  response: ServerResponse;
  candidates: CandidateApplication;
  csrfToken: string;
  url: URL;
}): void {
  const search = input.url.searchParams.get("q") ?? "";
  const html = renderInbox({
    candidates: input.candidates.list(search),
    csrfToken: input.csrfToken,
    search,
  });
  input.response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  input.response.end(html);
}
