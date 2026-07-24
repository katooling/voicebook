import type { ServerResponse } from "node:http";
import type { CoreApplication } from "../../core/port.ts";
import type { QueueApplication } from "../../queue/port.ts";
import { renderProfilePanel } from "../../profile/html.ts";
import type { ProfileApplication } from "../../profile/port.ts";
import { renderCore } from "../html.ts";

export function showCore(input: {
  response: ServerResponse;
  core: CoreApplication;
  queue: QueueApplication;
  profile: ProfileApplication;
  csrfToken: string;
  url: URL;
}): void {
  const search = input.url.searchParams.get("q") ?? "";
  const html = renderCore({
    coreMessages: input.queue.withCoreTags(input.core.search(search)),
    profilePanel: renderProfilePanel(input.profile.status()),
    csrfToken: input.csrfToken,
    search,
  });
  input.response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  input.response.end(html);
}
