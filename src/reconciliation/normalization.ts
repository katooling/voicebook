export const canonicalizerVersion = "source-format-v1";

// This intentionally handles source formatting only: Unicode NFC, CRLF,
// horizontal whitespace, outer blank lines, and Slack's URL wrapper. It does
// not lowercase text or URLs, rewrite mentions, or alter URL semantics.
export function canonicalizeSourceText(value: string): string {
  return value
    .normalize("NFC")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(
      /<(https?:\/\/[^|>\s]+)(?:\|[^>]*)?>/g,
      "$1",
    )
    .split("\n")
    .map((line) => line.replaceAll(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}
