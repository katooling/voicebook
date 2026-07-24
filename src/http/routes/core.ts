import type { ServerResponse } from "node:http";
import type { CoreApplication } from "../../core/port.ts";
import { renderCore } from "../html.ts";

export function showCore(input: {
  response: ServerResponse;
  core: CoreApplication;
  csrfToken: string;
  url: URL;
}): void {
  const search = input.url.searchParams.get("q") ?? "";
  const html = renderCore({
    coreMessages: input.core.search(search),
    csrfToken: input.csrfToken,
    search,
  });
  input.response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  input.response.end(html);
}
