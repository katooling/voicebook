import { openVoicebook } from "../application.ts";
import {
  privateBackupWarning,
  renderPrivateBackup,
} from "../export/markdown.ts";
import { writePrivateBackup } from "../export/filesystem.ts";

export async function runExportCommand(input: {
  args: string[];
  workspace: string;
}): Promise<void> {
  const application = openVoicebook(input.workspace);
  let content: string;
  try {
    content = renderPrivateBackup(application.export.privateBackup());
  } finally {
    application.close();
  }

  const result = await writePrivateBackup({
    workspace: input.workspace,
    output: option(input.args, "--output"),
    content,
  });
  process.stdout.write(
    `${JSON.stringify({ ...result, warning: privateBackupWarning })}\n`,
  );
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a path.`);
  }
  return value;
}
