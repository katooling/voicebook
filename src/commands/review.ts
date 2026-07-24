import { spawn } from "node:child_process";
import { platform } from "node:os";
import { openVoicebook } from "../application.ts";
import { startReviewServer } from "../http/server.ts";

export async function runReviewCommand(input: {
  args: string[];
  workspace: string;
}): Promise<void> {
  const port = parsePort(option(input.args, "--port") ?? "3777");
  const application = openVoicebook(input.workspace);
  const server = await startReviewServer({ application, port });
  const address = server.address();
  if (!address || typeof address === "string") {
    application.close();
    throw new Error("Review server did not bind to a TCP port.");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  process.stdout.write(`${JSON.stringify({ event: "ready", origin })}\n`);

  if (!input.args.includes("--no-open")) {
    openBrowser(origin);
  }

  const close = () => {
    server.close(() => {
      application.close();
      process.exit(0);
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

function openBrowser(origin: string): void {
  const command =
    platform() === "darwin"
      ? { executable: "open", args: [origin] }
      : platform() === "win32"
        ? { executable: "explorer.exe", args: [origin] }
        : { executable: "xdg-open", args: [origin] };
  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  child.once("error", () => {
    process.stderr.write("Voicebook could not open the browser automatically.\n");
  });
  child.unref();
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("--port must be an integer between 0 and 65535.");
  }
  return port;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
