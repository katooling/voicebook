import type { EvaluationView } from "./port.ts";

export function renderEvaluation(
  view: EvaluationView,
  csrfToken: string,
): string {
  if (view.status === "collecting") {
    return document(
      "Evaluation",
      `<header><p class="eyebrow">Voicebook evaluation</p><h1>Draft collection incomplete</h1></header>
       <main><p>${view.draftsSubmitted} of 20 drafts are ready. Finish collection before blind review.</p></main>`,
    );
  }
  if (view.status === "complete") {
    return document(
      "Evaluation complete",
      `<header><p class="eyebrow">Voicebook evaluation</p><h1>Evaluation complete</h1></header>
       <main>
         <p><strong>Result: ${view.passed ? "Pass" : "Does not pass"}</strong></p>
         <ul>
           <li>Assisted voice wins: ${view.assistedWins} of 10</li>
           <li>Baseline voice wins: ${view.baselineWins} of 10</li>
           <li>Assisted mean clarity: ${view.assistedMeanClarity}</li>
           <li>Baseline mean clarity: ${view.baselineMeanClarity}</li>
         </ul>
         <p>Rule ${escapeHtml(view.scoringVersion)}: pass only when assisted voice wins at least 7 of 10 and assisted mean clarity is not below baseline.</p>
       </main>`,
    );
  }
  const scenario = view.scenario;
  const facts = [
    ["Objective", scenario.objective],
    ["Audience", scenario.audience],
    ["Situation", scenario.situation],
    ["Destination", scenario.destination],
    ["Thread", scenario.thread],
  ]
    .filter((item): item is [string, string] => item[1] !== undefined)
    .map(([label, value]) => `<li><strong>${label}:</strong> ${escapeHtml(value)}</li>`)
    .join("");
  const constraints = scenario.constraints
    .map((value) => `<li>${escapeHtml(value)}</li>`)
    .join("");
  const materials = scenario.currentMaterials
    .map((material) =>
      `<li>${escapeHtml(
        [material.kind, material.role, material.description]
          .filter(Boolean)
          .join(" — "),
      )}</li>`,
    )
    .join("");
  return document(
    "Blind comparison",
    `<header>
       <p class="eyebrow">Voicebook evaluation</p>
       <h1>Blind comparison</h1>
       <p>Comparison ${scenario.position} of 10. Choose voice first, then score each side's clarity from 1 to 5.</p>
     </header>
     <main>
       <section aria-label="Situation"><h2>Situation</h2><ul>${facts}</ul>
         ${constraints ? `<h3>Constraints</h3><ul>${constraints}</ul>` : ""}
         ${materials ? `<h3>Current Materials</h3><ul>${materials}</ul>` : ""}
       </section>
       <div class="comparison">
         ${side("A", scenario.sideA)}
         ${side("B", scenario.sideB)}
       </div>
       <form method="post" action="/evaluation/${encodeURIComponent(view.evaluationKey)}/judge">
         <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
         <input type="hidden" name="scenarioKey" value="${escapeHtml(scenario.scenarioKey)}">
         <input type="hidden" name="revision" value="${scenario.revision}">
         <fieldset><legend>Which sounds more like me?</legend>
           <label><input type="radio" name="preferredSide" value="A" required> Side A sounds more like me</label>
           <label><input type="radio" name="preferredSide" value="B" required> Side B sounds more like me</label>
         </fieldset>
         ${clarity("A")}
         ${clarity("B")}
         <button type="submit">Save choice</button>
       </form>
     </main>`,
  );
}

function side(side: "A" | "B", text: string): string {
  return `<article aria-label="Side ${side}"><h2>Side ${side}</h2><p class="draft">${escapeHtml(text)}</p></article>`;
}

function clarity(side: "A" | "B"): string {
  return `<label>Side ${side} clarity
    <select name="clarity${side}" required>
      <option value="">Choose 1–5</option>
      ${[1, 2, 3, 4, 5].map((value) => `<option value="${value}">${value}</option>`).join("")}
    </select>
  </label>`;
}

function document(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Voicebook</title>
<style>
:root { font-family: ui-sans-serif, system-ui, sans-serif; background: #f5f3ee; color: #1d2a24; }
body { margin: 0 auto; max-width: 920px; padding: 2rem 1.25rem 5rem; }
.eyebrow { color: #496456; font-size: .8rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1 { font-family: Georgia, serif; font-size: 2.7rem; }
.comparison { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
article, section, form { background: white; border: 1px solid #d4dad5; border-radius: .5rem; margin: 1rem 0; padding: 1.2rem; }
.draft { font-size: 1.1rem; line-height: 1.55; white-space: pre-wrap; }
fieldset, label { display: block; margin: 1rem 0; }
select { margin-left: .5rem; }
button { background: #24513a; border: 0; border-radius: .3rem; color: white; cursor: pointer; padding: .7rem 1rem; }
@media (max-width: 650px) { .comparison { grid-template-columns: 1fr; } }
</style></head><body>${body}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
