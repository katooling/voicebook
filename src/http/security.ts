import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
}

export function isLocalHost(request: IncomingMessage, port: number): boolean {
  const host = request.headers.host;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export function isLocalOrigin(request: IncomingMessage, port: number): boolean {
  const origin = request.headers.origin;
  return (
    origin === undefined ||
    origin === `http://127.0.0.1:${port}` ||
    origin === `http://localhost:${port}`
  );
}

export function hasTrustedPostOrigin(
  request: IncomingMessage,
  port: number,
): boolean {
  const origin = request.headers.origin;
  return (
    origin === `http://127.0.0.1:${port}` ||
    origin === `http://localhost:${port}`
  );
}

export async function readProtectedForm(
  request: IncomingMessage,
  expectedToken: string,
): Promise<URLSearchParams | undefined> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return undefined;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) {
      return undefined;
    }
    chunks.push(buffer);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const providedToken = form.get("csrf");
  if (!providedToken) {
    return undefined;
  }
  const actualBuffer = Buffer.from(providedToken);
  const expectedBuffer = Buffer.from(expectedToken);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return undefined;
  }
  return form;
}
