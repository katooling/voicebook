export const canonicalizerVersion = "source-format-v3";

// This intentionally handles source formatting only: Unicode NFC, CRLF,
// horizontal whitespace, outer blank lines, equivalent Slack/Markdown link
// wrappers, and Slack mention wrappers that retain the same stable member ID.
// Labelled links retain both their URL and visible label. This does not
// lowercase text or URLs, infer a stable member ID from a display name, or
// alter URL semantics.
export function canonicalizeSourceText(value: string): string {
  return value
    .normalize("NFC")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(
      /<@([UW][A-Z0-9]{2,})(?:\|[^>\r\n]+)?>/g,
      "<@$1>",
    )
    .replace(
      /\[([^\][<>\r\n|]+)\]\((https?:\/\/[^\s()|<>]+)\)/g,
      "<$2|$1>",
    )
    .replace(
      /<(https?:\/\/[^|>\s]+)>/g,
      "$1",
    )
    .split("\n")
    .map((line) => line.replaceAll(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}
