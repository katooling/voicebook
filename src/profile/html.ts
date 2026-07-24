import type { ProfileStatus } from "./port.ts";

export function renderProfilePanel(profile: ProfileStatus): string {
  const label =
    profile.status === "missing"
      ? "Not generated"
      : profile.status === "current"
        ? "Current"
        : "Stale";
  const detail =
    profile.activeProfile === null
      ? "<p>No Voice Profile has been generated yet.</p>"
      : `<p class="message">${escapeHtml(profile.activeProfile.text)}</p>
         <p><small>Based on Voice Core revision ${escapeHtml(profile.activeProfile.basisRevision)}.</small></p>`;
  return `
    <section class="candidate" aria-labelledby="voice-profile-heading">
      <h2 id="voice-profile-heading">Voice Profile</h2>
      <p class="eyebrow">Voice Profile: ${label}</p>
      ${detail}
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
