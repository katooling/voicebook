import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium, type Page } from "playwright-core";
import type { ImportEnvelope } from "../src/contracts.ts";
import {
  cliPath,
  importEnvelope,
  repositoryRoot,
  startVoicebook,
  stopVoicebook,
} from "./harness.ts";

const evaluationKey = "synthetic-evaluation";
const assistedSideByScenario = [
  "A",
  "A",
  "A",
  "B",
  "A",
  "B",
  "B",
  "A",
  "B",
  "B",
] as const;

test("Codex can prepare and resume a concealed ten-scenario evaluation outside public history", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-evaluation-"));
  try {
    await prepareVoicebook(workspace);
    const created = runEvaluation(workspace, "create", evaluationInput()) as {
      evaluationKey: string;
      status: string;
      scenarioCount: number;
      draftsSubmitted: number;
    };
    assert.deepEqual(created, {
      evaluationKey,
      status: "collecting",
      scenarioCount: 10,
      draftsSubmitted: 0,
    });

    for (let index = 1; index <= 10; index += 1) {
      const scenarioKey = `scenario-${index}`;
      const baseline = runEvaluation(workspace, "prepare", {
        schemaVersion: 1,
        evaluationKey,
        scenarioKey,
        variant: "baseline",
      }) as { instruction: string; variant: string };
      assert.equal(baseline.variant, "baseline");
      assert.match(baseline.instruction, new RegExp(`Synthetic situation ${index}`));
      assert.doesNotMatch(baseline.instruction, /Voice Profile|Core Messages/);
      assert.match(
        baseline.instruction,
        /Improve accidental ambiguity, grammar, and unintended harshness\./,
      );

      const assisted = runEvaluation(workspace, "prepare", {
        schemaVersion: 1,
        evaluationKey,
        scenarioKey,
        variant: "assisted",
      }) as { instruction: string; variant: string };
      assert.equal(assisted.variant, "assisted");
      assert.match(assisted.instruction, /# Draft Brief/);
      assert.match(assisted.instruction, /Synthetic active profile/);
      assert.equal(
        assisted.instruction.startsWith(`${baseline.instruction}\n\n`),
        true,
        "assisted preparation must begin with the exact baseline task instruction",
      );
      assert.match(
        assisted.instruction.slice(baseline.instruction.length),
        /Voice Profile|Relevant Core Messages/,
      );

      const baselineSubmission = runEvaluation(workspace, "submit", {
        schemaVersion: 1,
        evaluationKey,
        scenarioKey,
        variant: "baseline",
        text: `SYNTHETIC_BASELINE_DRAFT_${index}`,
      });
      if (index === 1) {
        assert.deepEqual(baselineSubmission, {
          evaluationKey,
          status: "collecting",
          scenarioCount: 10,
          draftsSubmitted: 1,
        });
        assert.doesNotMatch(
          JSON.stringify(baselineSubmission),
          /SYNTHETIC_BASELINE_DRAFT|variant|voice wins|clarity/i,
        );
      }
      runEvaluation(workspace, "submit", {
        schemaVersion: 1,
        evaluationKey,
        scenarioKey,
        variant: "assisted",
        text: `SYNTHETIC_ASSISTED_DRAFT_${index}`,
      });
    }

    const restarted = runEvaluationStatus(workspace, evaluationKey);
    assert.deepEqual(restarted, {
      evaluationKey,
      status: "judging",
      completedChoices: 0,
      totalChoices: 10,
    });
    assert.doesNotMatch(JSON.stringify(restarted), /baseline|assisted|wins|clarity/i);

    const evaluationFile = join(
      workspace,
      "evaluations",
      `${evaluationKey}.json`,
    );
    await assert.rejects(stat(evaluationFile), { code: "ENOENT" });
    assert.equal(
      spawnSync("git", ["check-ignore", "-q", "evaluations/proof.json"], {
        cwd: repositoryRoot,
      }).status,
      0,
    );

    const database = await readFile(join(workspace, "voicebook.sqlite"), "utf8");
    assert.match(database, /SYNTHETIC_(BASELINE|ASSISTED)_DRAFT/);
    assert.match(database, /Synthetic situation/);

    const exported = runCli(workspace, ["export"]);
    assert.equal(exported.status, 0, exported.stderr);
    const backup = await readFile(
      join(workspace, "exports", "voicebook-private-backup.md"),
      "utf8",
    );
    assert.doesNotMatch(backup, /SYNTHETIC_(BASELINE|ASSISTED)_DRAFT/);
    assert.doesNotMatch(backup, /Synthetic situation/);
    assert.doesNotMatch(backup, /voice-win-7-clarity-mean-v1/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("Voice Owner judges neutral persisted sides and sees scoring only after choice ten", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-evaluation-review-"));
  const browser = await chromium.launch({ headless: true });
  let server: Awaited<ReturnType<typeof startVoicebook>> | undefined;
  try {
    await prepareVoicebook(workspace);
    runEvaluation(workspace, "create", evaluationInput());

    server = await startVoicebook(workspace);
    const page = await browser.newPage();
    await page.goto(`${server.origin}/evaluation?key=${evaluationKey}`);
    await page
      .getByRole("heading", { name: "Draft collection incomplete" })
      .waitFor();
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /baseline|assisted|Side A|Side B|wins|clarity/i,
    );
    await stopVoicebook(server.process);
    server = undefined;

    collectDrafts(workspace, "Synthetic option");
    server = await startVoicebook(workspace);
    await page.goto(`${server.origin}/evaluation?key=${evaluationKey}`);
    await page.getByRole("heading", { name: "Blind comparison" }).waitFor();
    const firstSides = await visibleSides(page);
    assert.deepEqual(firstSides, [
      "Side A\n\nSynthetic option two for scenario 1.",
      "Side B\n\nSynthetic option one for scenario 1.",
    ]);
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /baseline|assisted|wins|mean clarity|passed/i,
    );

    await stopVoicebook(server.process);
    server = await startVoicebook(workspace);
    await page.goto(`${server.origin}/evaluation?key=${evaluationKey}`);
    assert.deepEqual(await visibleSides(page), firstSides);

    const retryPage = await browser.newPage();
    const stalePage = await browser.newPage();
    await retryPage.goto(`${server.origin}/evaluation?key=${evaluationKey}`);
    await stalePage.goto(`${server.origin}/evaluation?key=${evaluationKey}`);
    await submitJudgment(page, "A", 4, 3);
    await submitJudgment(retryPage, "A", 4, 3);
    assert.match(
      await retryPage.locator("body").innerText(),
      /Comparison 2 of 10/,
    );
    const staleResponse = stalePage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/evaluation/"),
    );
    await stalePage.getByLabel("Side B sounds more like me").check();
    await stalePage.getByLabel("Side A clarity").selectOption("3");
    await stalePage.getByLabel("Side B clarity").selectOption("4");
    await stalePage.getByRole("button", { name: "Save choice" }).click();
    assert.equal((await staleResponse).status(), 409);

    assert.match(await page.locator("body").innerText(), /Comparison 2 of 10/);
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /baseline|assisted|wins|mean clarity|passed/i,
    );
    const partial = runEvaluationStatus(workspace, evaluationKey);
    assert.deepEqual(partial, {
      evaluationKey,
      status: "judging",
      completedChoices: 1,
      totalChoices: 10,
    });

    for (let index = 2; index <= 10; index += 1) {
      const assistedSide = assistedSideByScenario[index - 1]!;
      const preferAssisted = index <= 7;
      const preferred =
        preferAssisted
          ? assistedSide
          : assistedSide === "A"
            ? "B"
            : "A";
      await submitJudgment(
        page,
        preferred,
        assistedSide === "A" ? 4 : 3,
        assistedSide === "B" ? 4 : 3,
      );
    }

    await page.getByRole("heading", { name: "Evaluation complete" }).waitFor();
    await page.getByText("Assisted voice wins: 7 of 10").waitFor();
    await page.getByText("Assisted mean clarity: 4").waitFor();
    await page.getByText("Baseline mean clarity: 3").waitFor();
    await page.getByText("Result: Pass").waitFor();
    const completed = runEvaluationStatus(workspace, evaluationKey);
    assert.deepEqual(completed, {
      evaluationKey,
      status: "complete",
      completedChoices: 10,
      totalChoices: 10,
      scoringVersion: "voice-win-7-clarity-mean-v1",
      assistedWins: 7,
      baselineWins: 3,
      assistedMeanClarity: 4,
      baselineMeanClarity: 3,
      passed: true,
    });
  } finally {
    if (server) {
      await stopVoicebook(server.process);
    }
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("the scoring gate rejects either lower assisted clarity or only six voice wins", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "voicebook-evaluation-gate-"));
  const browser = await chromium.launch({ headless: true });
  let server: Awaited<ReturnType<typeof startVoicebook>> | undefined;
  try {
    await prepareVoicebook(workspace);
    const lowerClarityKey = "synthetic-lower-clarity";
    runEvaluation(workspace, "create", evaluationInput(lowerClarityKey));
    collectDrafts(workspace, "Synthetic lower clarity option", lowerClarityKey);

    server = await startVoicebook(workspace);
    const page = await browser.newPage();
    await page.goto(`${server.origin}/evaluation?key=${lowerClarityKey}`);
    await judgeAll(page, 7, 2, 4);
    await page.getByText("Result: Does not pass").waitFor();
    assert.deepEqual(runEvaluationStatus(workspace, lowerClarityKey), {
      evaluationKey: lowerClarityKey,
      status: "complete",
      completedChoices: 10,
      totalChoices: 10,
      scoringVersion: "voice-win-7-clarity-mean-v1",
      assistedWins: 7,
      baselineWins: 3,
      assistedMeanClarity: 2,
      baselineMeanClarity: 4,
      passed: false,
    });

    const sixWinsKey = "synthetic-six-wins";
    runEvaluation(workspace, "create", evaluationInput(sixWinsKey));
    collectDrafts(workspace, "Synthetic six wins option", sixWinsKey);
    await page.goto(`${server.origin}/evaluation?key=${sixWinsKey}`);
    await judgeAll(page, 6, 5, 2);
    await page.getByText("Result: Does not pass").waitFor();
    assert.deepEqual(runEvaluationStatus(workspace, sixWinsKey), {
      evaluationKey: sixWinsKey,
      status: "complete",
      completedChoices: 10,
      totalChoices: 10,
      scoringVersion: "voice-win-7-clarity-mean-v1",
      assistedWins: 6,
      baselineWins: 4,
      assistedMeanClarity: 5,
      baselineMeanClarity: 2,
      passed: false,
    });
  } finally {
    if (server) {
      await stopVoicebook(server.process);
    }
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

async function prepareVoicebook(workspace: string): Promise<void> {
  importEnvelope(workspace, coreFixture());
  const server = await startVoicebook(workspace);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await acceptCandidate(page, server.origin, "Synthetic voice example");
  } finally {
    await browser.close();
    await stopVoicebook(server.process);
  }
  const prepared = runCli(workspace, ["profile", "prepare"]);
  const revision = (JSON.parse(prepared.stdout) as { coreRevision: string })
    .coreRevision;
  const submitted = runCli(
    workspace,
    ["profile", "submit", "--stdin"],
    JSON.stringify({
      schemaVersion: 1,
      basisRevision: revision,
      text: "Synthetic active profile.",
    }),
  );
  assert.equal(submitted.status, 0, submitted.stderr);
}

async function acceptCandidate(
  page: Page,
  origin: string,
  text: string,
): Promise<void> {
  await page.goto(`${origin}/?q=${encodeURIComponent(text)}`);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
}

function evaluationInput(key = evaluationKey): Record<string, unknown> {
  return {
    schemaVersion: 1,
    evaluationKey: key,
    seed: "synthetic-seed",
    scenarios: Array.from({ length: 10 }, (_, index) => ({
      scenarioKey: `scenario-${index + 1}`,
      objective: `Write synthetic message ${index + 1}.`,
      situation: `Synthetic situation ${index + 1}.`,
      constraints: ["Be clear."],
      currentMaterials: [],
    })),
  };
}

function collectDrafts(
  workspace: string,
  prefix: string,
  key = evaluationKey,
): void {
  for (let index = 1; index <= 10; index += 1) {
    for (const [variant, suffix] of [
      ["baseline", "one"],
      ["assisted", "two"],
    ] as const) {
      runEvaluation(workspace, "prepare", {
        schemaVersion: 1,
        evaluationKey: key,
        scenarioKey: `scenario-${index}`,
        variant,
      });
      runEvaluation(workspace, "submit", {
        schemaVersion: 1,
        evaluationKey: key,
        scenarioKey: `scenario-${index}`,
        variant,
        text: `${prefix} ${suffix} for scenario ${index}.`,
      });
    }
  }
}

async function judgeAll(
  page: Page,
  assistedWins: number,
  assistedClarity: number,
  baselineClarity: number,
): Promise<void> {
  for (let index = 1; index <= 10; index += 1) {
    const assistedSide = assistedSideByScenario[index - 1]!;
    const preferAssisted = index <= assistedWins;
    const preferred = preferAssisted
      ? assistedSide
      : assistedSide === "A"
        ? "B"
        : "A";
    await submitJudgment(
      page,
      preferred,
      assistedSide === "A" ? assistedClarity : baselineClarity,
      assistedSide === "B" ? assistedClarity : baselineClarity,
    );
  }
}

async function visibleSides(page: Page): Promise<[string, string]> {
  return [
    await page.getByRole("article", { name: "Side A" }).innerText(),
    await page.getByRole("article", { name: "Side B" }).innerText(),
  ];
}

async function submitJudgment(
  page: Page,
  preferredSide: "A" | "B",
  clarityA: number,
  clarityB: number,
): Promise<void> {
  await page
    .getByLabel(`Side ${preferredSide} sounds more like me`)
    .check();
  await page.getByLabel("Side A clarity").selectOption(String(clarityA));
  await page.getByLabel("Side B clarity").selectOption(String(clarityB));
  await page.getByRole("button", { name: "Save choice" }).click();
}

function coreFixture(): ImportEnvelope {
  return {
    schemaVersion: 1,
    sourceMessages: [
      {
        sourceKey: "synthetic:evaluation:core",
        publishedAt: "2025-05-01T10:00:00.000Z",
        text: "Synthetic voice example with one direct question?",
        context: [],
        materials: [],
      },
    ],
  };
}

function runEvaluation(
  workspace: string,
  operation: "create" | "prepare" | "submit",
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result = runCli(
    workspace,
    ["evaluate", operation, "--stdin"],
    JSON.stringify(input),
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function runEvaluationStatus(
  workspace: string,
  key: string,
): Record<string, unknown> {
  const result = runCli(workspace, [
    "evaluate",
    "status",
    "--evaluation-key",
    key,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function runCli(workspace: string, args: string[], input?: string) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      ...args,
      "--workspace",
      workspace,
    ],
    { cwd: repositoryRoot, input, encoding: "utf8" },
  );
}
