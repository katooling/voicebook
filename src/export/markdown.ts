import type {
  ExportCoreMessage,
  ExportMaterial,
  PrivateBackup,
} from "./port.ts";

export const privateBackupWarning =
  "Sensitive private backup. This file is not sanitized for sharing.";

export function renderPrivateBackup(backup: PrivateBackup): string {
  const sections = [
    "# Voicebook Private Backup",
    "",
    privateBackupWarning,
    "",
    "Format version: 1",
    "",
    "## Active Voice Profile",
    "",
    fenced("text", backup.profile),
    "",
    "## Voice Core",
  ];

  backup.coreMessages.forEach((message, index) => {
    sections.push("", ...renderCoreMessage(message, index + 1));
  });
  return `${sections.join("\n")}\n`;
}

function renderCoreMessage(
  message: ExportCoreMessage,
  position: number,
): string[] {
  const tags = message.tags.length === 0 ? "none" : message.tags.join(", ");
  const result = [
    `### Core Message ${position}`,
    "",
    `Pinned: ${message.pinned ? "yes" : "no"}`,
    "",
    `Contextual tags: ${tags}`,
    "",
    "Message:",
    "",
    fenced("text", message.text),
  ];
  if (message.materials.length > 0) {
    result.push(
      "",
      "Materials:",
      "",
      fenced("json", JSON.stringify(message.materials.map(orderedMaterial), null, 2)),
    );
  }
  return result;
}

function orderedMaterial(material: ExportMaterial): ExportMaterial {
  const ordered: ExportMaterial = {
    ordinal: material.ordinal,
    kind: material.kind,
    role: material.role,
  };
  if (material.label !== undefined) {
    ordered.label = material.label;
  }
  if (material.url !== undefined) {
    ordered.url = material.url;
  }
  return ordered;
}

function fenced(language: string, value: string): string {
  const runs = value.match(/`+/g) ?? [];
  const width = Math.max(3, ...runs.map((run) => run.length + 1));
  const fence = "`".repeat(width);
  return `${fence}${language}\n${value}\n${fence}`;
}
