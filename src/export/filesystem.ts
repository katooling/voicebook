import {
  chmod,
  mkdir,
  open,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

export const defaultBackupName = "voicebook-private-backup.md";

export async function writePrivateBackup(input: {
  workspace: string;
  output?: string;
  content: string;
}): Promise<{ output: string; bytes: number }> {
  const output = resolve(
    input.output ?? join(input.workspace, "exports", defaultBackupName),
  );
  if (await insideGitWorktree(output)) {
    throw new Error(
      "Private backups must be written outside every Git worktree.",
    );
  }

  const parent = dirname(output);
  const defaultParent = input.output === undefined;
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if (defaultParent) {
    await chmod(parent, 0o700);
  }

  const bytes = Buffer.from(input.content, "utf8");
  const temporary = join(
    parent,
    `.${defaultBackupName}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, output);
    await chmod(output, 0o600);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { output, bytes: bytes.length };
}

async function insideGitWorktree(path: string): Promise<boolean> {
  let current = dirname(resolve(path));
  const missingSegments: string[] = [];
  while (true) {
    try {
      const canonical = await realpath(current);
      current = join(canonical, ...missingSegments.reverse());
      break;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return false;
      }
      missingSegments.push(current.slice(parent.length + 1));
      current = parent;
    }
  }

  while (true) {
    try {
      await stat(join(current, ".git"));
      return true;
    } catch {
      // Keep walking until the filesystem root.
    }
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) {
      return false;
    }
    current = parent;
  }
}
