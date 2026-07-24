import type { Material } from "../contracts.ts";
import type { AnalyzedCandidate } from "../queue/analysis.ts";
import type { TaggedCoreMessage } from "../queue/port.ts";

export function renderInbox(input: {
  candidates: AnalyzedCandidate[];
  csrfToken: string;
  search: string;
  mode: "suggested" | "search";
  totalEligible?: number;
}): string {
  const cards =
    input.candidates.length === 0
      ? `<p class="empty">No pending Candidates found.</p>`
      : input.candidates
          .map((candidate) => renderCandidate(candidate, input.csrfToken))
          .join("");

  return document(
    "Inbox",
    `
      <header>
        <p class="eyebrow">Voicebook</p>
        <h1>Inbox</h1>
        <p>Review truthful Source Messages before they enter the Voice Core.</p>
        <nav><a aria-current="page" href="/">Inbox</a><a href="/core">Core</a></nav>
      </header>
      <main>
        <form class="search" method="get" action="/">
          <label for="inbox-search">Search Candidates</label>
          <div><input id="inbox-search" name="q" value="${escapeHtml(input.search)}"><button>Search</button></div>
        </form>
        <section class="queue-heading">
          <h2>${input.mode === "suggested" ? "Suggested Queue" : "Search results"}</h2>
          ${
            input.mode === "suggested"
              ? `<p>Showing ${input.candidates.length} diverse suggestions from ${input.totalEligible ?? 0} eligible Candidates.</p>`
              : `<p>${input.candidates.length} matching Candidates.</p>`
          }
        </section>
        ${cards}
      </main>
    `,
  );
}

export function renderCore(input: {
  coreMessages: TaggedCoreMessage[];
  profilePanel: string;
  csrfToken: string;
  search: string;
}): string {
  const cards =
    input.coreMessages.length === 0
      ? `<p class="empty">No Core Messages found.</p>`
      : input.coreMessages
          .map(
            (message) => `
              <article class="candidate">
                ${message.pinned ? '<p class="eyebrow">Pinned</p>' : ""}
                <p class="message">${escapeHtml(message.text)}</p>
                <section class="contextual-tags">
                  <h2>Contextual tags</h2>
                  <p>${message.tags.length === 0 ? "No contextual tags." : message.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(" ")}</p>
                  <form method="post" action="/core/${encodeURIComponent(message.id)}/tags">
                    <input type="hidden" name="csrf" value="${escapeHtml(input.csrfToken)}">
                    <input type="hidden" name="expectedTagsJson" value="${escapeHtml(message.expectedTagsJson)}">
                    <label for="core-tags-${escapeHtml(message.id)}">Edit context</label>
                    <div>
                      <input id="core-tags-${escapeHtml(message.id)}" name="tags" value="${escapeHtml(message.tags.join(", "))}" aria-describedby="core-tags-help-${escapeHtml(message.id)}">
                      <button type="submit">Save tags</button>
                    </div>
                    <small id="core-tags-help-${escapeHtml(message.id)}">Comma-separated contextual tags.</small>
                  </form>
                </section>
                <div class="actions">
                  ${
                    message.pinned
                      ? ""
                      : `<form method="post" action="/core/${encodeURIComponent(message.id)}/pin">
                          <input type="hidden" name="csrf" value="${escapeHtml(input.csrfToken)}">
                          <button type="submit">Pin</button>
                        </form>`
                  }
                  <form method="post" action="/core/${encodeURIComponent(message.id)}/remove">
                    <input type="hidden" name="csrf" value="${escapeHtml(input.csrfToken)}">
                    <button type="submit">Remove</button>
                  </form>
                </div>
              </article>
            `,
          )
          .join("");

  return document(
    "Voice Core",
    `
      <header>
        <p class="eyebrow">Voicebook</p>
        <h1>Voice Core</h1>
        <p>Accepted, verbatim Core Messages are the source of truth.</p>
        <nav><a href="/">Inbox</a><a aria-current="page" href="/core">Core</a></nav>
      </header>
      <main>
        ${input.profilePanel}
        <form class="search" method="get" action="/core">
          <label for="core-search">Search Voice Core</label>
          <div><input id="core-search" name="q" value="${escapeHtml(input.search)}"><button>Search</button></div>
        </form>
        ${cards}
      </main>
    `,
  );
}

function renderCandidate(
  candidate: AnalyzedCandidate,
  csrfToken: string,
): string {
  const context =
    candidate.context.length === 0
      ? "<p>No surrounding context was imported.</p>"
      : `<ol>${candidate.context
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.authorLabel)}</strong>: <span>${escapeHtml(item.text)}</span></li>`,
          )
          .join("")}</ol>`;
  const materials =
    candidate.materials.length === 0
      ? "<p>No Materials.</p>"
      : `<ol>${candidate.materials.map(renderMaterial).join("")}</ol>`;

  return `
    <article class="candidate">
      <time datetime="${escapeHtml(candidate.publishedAt)}">${escapeHtml(formatDate(candidate.publishedAt))}</time>
      <p class="message">${escapeHtml(candidate.text)}</p>
      ${
        candidate.rankingReasons.length === 0
          ? ""
          : `<p class="ranking-reasons">${candidate.rankingReasons
              .map(
                (reason) =>
                  `<span class="reason" data-ranking-reason="${escapeHtml(reason.tag)}">${escapeHtml(reason.label)}</span>`,
              )
              .join(" ")}</p>`
      }
      ${
        candidate.suggestedTags.length === 0
          ? ""
          : `<p class="suggested-tags"><strong>Suggested tags:</strong> ${candidate.suggestedTags
              .map(
                (tag) =>
                  `<span class="tag" data-suggested-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`,
              )
              .join(" ")}</p>`
      }
      <section>
        <h2>Slack Context</h2>
        ${context}
      </section>
      <section>
        <h2>Materials</h2>
        ${materials}
      </section>
      <div class="actions">
        ${actionForm(candidate.id, candidate.revision, "accept", "Accept", csrfToken)}
        ${actionForm(candidate.id, candidate.revision, "pin", "Pin to Core", csrfToken)}
        ${actionForm(candidate.id, candidate.revision, "reject", "Reject", csrfToken)}
        ${actionForm(candidate.id, candidate.revision, "sensitive", "Sensitive", csrfToken)}
      </div>
    </article>
  `;
}

function renderMaterial(material: Material): string {
  const kind = titleCase(material.kind);
  const renderedKind =
    material.kind === "link" && safeLink(material.url)
      ? `<a href="${escapeHtml(material.url!)}" rel="noreferrer">${kind}</a>`
      : kind;
  const label = material.label ? ` ${escapeHtml(material.label)}` : "";
  const sourceReference = material.sourceReference
    ? ` <small>(source: ${escapeHtml(material.sourceReference)})</small>`
    : "";
  return `<li data-material-ordinal="${material.ordinal}">${material.ordinal} ${renderedKind} · ${escapeHtml(material.role)}${label}${sourceReference}</li>`;
}

function actionForm(
  candidateId: string,
  candidateRevision: string,
  action: string,
  label: string,
  csrfToken: string,
): string {
  return `
    <form method="post" action="/candidates/${encodeURIComponent(candidateId)}/${action}">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <input type="hidden" name="revision" value="${escapeHtml(candidateRevision)}">
      <button type="submit">${escapeHtml(label)}</button>
    </form>
  `;
}

function document(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Voicebook</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; background: #f5f3ee; color: #1d2a24; }
    body { margin: 0 auto; max-width: 900px; padding: 2rem 1.25rem 5rem; }
    header { border-bottom: 1px solid #bdc7bf; padding-bottom: 1.5rem; }
    .eyebrow { color: #496456; font-size: .8rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { font-family: Georgia, serif; font-size: 3rem; margin: .2rem 0; }
    nav { display: flex; gap: 1rem; margin-top: 1.5rem; }
    nav a { color: #24513a; font-weight: 700; }
    .search { margin: 2rem 0; }
    .search label { display: block; font-weight: 700; margin-bottom: .4rem; }
    .search div { display: flex; gap: .5rem; }
    input { border: 1px solid #9dab9f; border-radius: .3rem; flex: 1; padding: .65rem; }
    button { background: #24513a; border: 0; border-radius: .3rem; color: white; cursor: pointer; padding: .65rem .9rem; }
    .candidate { background: white; border: 1px solid #d4dad5; border-radius: .5rem; margin: 1.25rem 0; padding: 1.3rem; }
    .queue-heading { border-top: 0; margin-top: 1rem; }
    .message { font-size: 1.12rem; line-height: 1.55; white-space: pre-wrap; }
    section { border-top: 1px solid #e3e7e4; margin-top: 1rem; padding-top: .5rem; }
    section h2 { font-size: .85rem; letter-spacing: .08em; text-transform: uppercase; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
    .tag, .reason { background: #e8eee9; border-radius: 999px; display: inline-block; font-size: .8rem; margin: .15rem; padding: .25rem .55rem; }
    .reason { background: #efe9db; }
    time { color: #66736b; font-size: .85rem; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeLink(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
