import type { OriginStatus } from "./port.ts";

export function renderCompositionOrigin(
  status: OriginStatus,
  csrfToken: string,
): string {
  const label = title(status.origin);
  const participation =
    status.origin === "manual"
      ? "No plausible recent Voicebook Draft Record matched. Manual describes Voicebook participation only."
      : status.origin === "agent"
        ? "One supported exact Draft Record match was found after conservative source-format normalization."
        : status.origin === "mixed"
          ? "The Voice Owner confirmed that this Source Message edits a Voicebook draft."
          : "Voicebook does not have enough evidence to claim participation.";
  const suggestion = status.suggestion;
  const suggestionHtml = suggestion
    ? `
      <section class="mixed-suggestion">
        <h3>Mixed suggestion</h3>
        <p>${suggestion.evidence.map((item) => `<span class="reason">${escapeHtml(item)}</span>`).join(" ")}</p>
        <p class="diff">${differenceHtml(suggestion.difference)}</p>
        <form method="post" action="/composition-origin/${encodeURIComponent(status.sourceId)}/confirm-mixed">
          <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
          <input type="hidden" name="sourceRevision" value="${escapeHtml(status.sourceRevision)}">
          <input type="hidden" name="suggestionRevision" value="${escapeHtml(suggestion.suggestionRevision)}">
          <input type="hidden" name="draftRunId" value="${escapeHtml(suggestion.draftRunId)}">
          <button type="submit">Confirm Mixed</button>
        </form>
      </section>
    `
    : "";
  return `
    <section class="composition-origin">
      <h2>Composition Origin: ${label}</h2>
      <p>${escapeHtml(participation)}</p>
      ${suggestionHtml}
    </section>
  `;
}

function differenceHtml(
  difference: NonNullable<OriginStatus["suggestion"]>["difference"],
): string {
  return [
    difference.before ? escapeHtml(difference.before) : "",
    difference.removed
      ? `<del>${escapeHtml(difference.removed)}</del>`
      : "",
    difference.added ? `<ins>${escapeHtml(difference.added)}</ins>` : "",
    difference.after ? escapeHtml(difference.after) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function title(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
