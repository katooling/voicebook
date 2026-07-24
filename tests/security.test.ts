import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importFixture, startVoicebook, stopVoicebook } from "./harness.ts";

test("review server is loopback-only and rejects hostile Host and Origin headers", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-security-"));
  await importFixture(workspace);
  const server = await startVoicebook(workspace);
  const url = new URL(server.origin);

  try {
    assert.equal(url.hostname, "127.0.0.1");

    const hostileHost = await rawRequest({
      port: Number(url.port),
      path: "/",
      headers: { Host: "attacker.invalid" },
    });
    assert.equal(hostileHost.status, 403);

    const hostileOrigin = await rawRequest({
      port: Number(url.port),
      path: "/",
      headers: {
        Host: url.host,
        Origin: "https://attacker.invalid",
      },
    });
    assert.equal(hostileOrigin.status, 403);

    const nonLoopback = Object.values(networkInterfaces())
      .flat()
      .find((address) => address?.family === "IPv4" && !address.internal);
    if (nonLoopback) {
      await assert.rejects(
        fetch(`http://${nonLoopback.address}:${url.port}/`, {
          signal: AbortSignal.timeout(1_000),
        }),
      );
    }
  } finally {
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

test("state-changing requests require trusted Origin and CSRF token", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-csrf-"));
  await importFixture(workspace);
  const server = await startVoicebook(workspace);
  const url = new URL(server.origin);

  try {
    const inbox = await rawRequest({
      port: Number(url.port),
      path: "/",
      headers: { Host: url.host },
    });
    assert.equal(inbox.status, 200);
    assert.match(
      String(inbox.headers["content-security-policy"] ?? ""),
      /default-src 'none'/,
    );
    assert.equal(inbox.headers["cache-control"], "no-store");
    const csrfToken = inbox.body.match(/name="csrf" value="([^"]+)"/)?.[1];
    assert.ok(csrfToken);

    const missingOrigin = await rawRequest({
      port: Number(url.port),
      method: "POST",
      path: "/candidates/1/accept",
      headers: {
        Host: url.host,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `csrf=${encodeURIComponent(csrfToken)}`,
    });
    assert.equal(missingOrigin.status, 403);

    const wrongToken = await rawRequest({
      port: Number(url.port),
      method: "POST",
      path: "/candidates/1/accept",
      headers: {
        Host: url.host,
        Origin: server.origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "csrf=wrong",
    });
    assert.equal(wrongToken.status, 403);

    const unchangedInbox = await rawRequest({
      port: Number(url.port),
      path: "/",
      headers: { Host: url.host },
    });
    assert.match(unchangedInbox.body, /second screenshot points/);
  } finally {
    await stopVoicebook(server.process);
    await rm(workspace, { recursive: true, force: true });
  }
});

type RawRequestOptions = {
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function rawRequest(
  options: RawRequestOptions,
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port: options.port,
        path: options.path,
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.once("end", () => {
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    outgoing.once("error", reject);
    if (options.body) {
      outgoing.write(options.body);
    }
    outgoing.end();
  });
}
