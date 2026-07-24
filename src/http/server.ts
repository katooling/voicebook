import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { VoicebookApplication } from "../application.ts";
import { showCore } from "./routes/core.ts";
import { showInbox } from "./routes/inbox.ts";
import { pinCoreMessage } from "./routes/pin-core-message.ts";
import { removeCoreMessage } from "./routes/remove-core-message.ts";
import { reviewCandidate } from "./routes/review-candidate.ts";
import {
  applySecurityHeaders,
  hasTrustedPostOrigin,
  isLocalHost,
  isLocalOrigin,
} from "./security.ts";
import { updateCoreTags } from "../queue/routes/update-core-tags.ts";

export async function startReviewServer(input: {
  application: VoicebookApplication;
  port: number;
}): Promise<Server> {
  const csrfToken = randomBytes(32).toString("base64url");
  const server = createServer((request, response) => {
    route({
      request,
      response,
      application: input.application,
      csrfToken,
      port: boundPort(server),
    }).catch(() => {
      if (!response.headersSent) {
        reject(response, 400, "Request could not be completed.");
      } else {
        response.end();
      }
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function route(input: {
  request: IncomingMessage;
  response: ServerResponse;
  application: VoicebookApplication;
  csrfToken: string;
  port: number;
}): Promise<void> {
  applySecurityHeaders(input.response);
  if (!isLocalHost(input.request, input.port)) {
    reject(input.response, 403, "Invalid Host.");
    return;
  }
  if (!isLocalOrigin(input.request, input.port)) {
    reject(input.response, 403, "Invalid Origin.");
    return;
  }

  const url = new URL(
    input.request.url ?? "/",
    `http://127.0.0.1:${input.port}`,
  );
  if (input.request.method === "GET" && url.pathname === "/") {
    showInbox({
      ...input,
      queue: input.application.queue,
      url,
    });
    return;
  }
  if (input.request.method === "GET" && url.pathname === "/core") {
    showCore({
      ...input,
      core: input.application.core,
      queue: input.application.queue,
      url,
    });
    return;
  }
  if (input.request.method === "POST") {
    if (!hasTrustedPostOrigin(input.request, input.port)) {
      reject(input.response, 403, "State-changing requests require a trusted Origin.");
      return;
    }
    const candidateAction = url.pathname.match(
      /^\/candidates\/([^/]+)\/(accept|pin|reject|sensitive)$/,
    );
    if (candidateAction) {
      await reviewCandidate({
        ...input,
        candidates: input.application.candidates,
        candidateId: decodeURIComponent(candidateAction[1]!),
        decision: candidateAction[2]!,
      });
      return;
    }
    const coreRemoval = url.pathname.match(/^\/core\/([^/]+)\/remove$/);
    if (coreRemoval) {
      await removeCoreMessage({
        ...input,
        core: input.application.core,
        coreMessageId: decodeURIComponent(coreRemoval[1]!),
      });
      return;
    }
    const corePin = url.pathname.match(/^\/core\/([^/]+)\/pin$/);
    if (corePin) {
      await pinCoreMessage({
        ...input,
        core: input.application.core,
        coreMessageId: decodeURIComponent(corePin[1]!),
      });
      return;
    }
    const coreTags = url.pathname.match(/^\/core\/([^/]+)\/tags$/);
    if (coreTags) {
      await updateCoreTags({
        ...input,
        queue: input.application.queue,
        coreMessageId: decodeURIComponent(coreTags[1]!),
      });
      return;
    }
  }
  reject(input.response, 404, "Not found.");
}

function boundPort(server: Server): number {
  const address = server.address();
  return address && typeof address !== "string" ? address.port : 0;
}

function reject(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
