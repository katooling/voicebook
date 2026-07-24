import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { DraftApplication, DraftStartRequest } from "../drafting/port.ts";
import type {
  EvaluationApplication,
  EvaluationDefinition,
  EvaluationJudgment,
  EvaluationReport,
  EvaluationScenario,
  EvaluationSide,
  EvaluationVariant,
  EvaluationView,
} from "./port.ts";

type StoredJudgment = Omit<EvaluationJudgment, "revision">;

type StoredScenario = EvaluationScenario & {
  assistedSide: EvaluationSide;
  baselineInstruction?: string;
  assistedInstruction?: string;
  baselineDraft?: string;
  assistedDraft?: string;
  judgment?: StoredJudgment;
};

type StoredEvaluation = {
  schemaVersion: 1;
  scoringVersion: "voice-win-7-clarity-mean-v1";
  definitionHash: string;
  evaluationKey: string;
  seed: string;
  revision: number;
  scenarios: StoredScenario[];
};

export class FileEvaluationApplication implements EvaluationApplication {
  readonly #directory: string;
  readonly #drafting: DraftApplication;

  constructor(workspace: string, drafting: DraftApplication) {
    this.#directory = join(workspace, "evaluations");
    this.#drafting = drafting;
  }

  create(definition: EvaluationDefinition): EvaluationView {
    return this.#mutate(definition.evaluationKey, () => {
      const path = this.#path(definition.evaluationKey);
      const definitionHash = hash(JSON.stringify(definition));
      if (existsSync(path)) {
        const existing = this.#read(definition.evaluationKey);
        if (existing.definitionHash !== definitionHash) {
          throw new Error(
            "This evaluationKey already identifies a different evaluation.",
          );
        }
        return { state: existing, value: publicView(existing) };
      }
      const assistedAScenarios = assistedASideKeys(
        definition.seed,
        definition.scenarios,
      );
      const state: StoredEvaluation = {
        schemaVersion: 1,
        scoringVersion: "voice-win-7-clarity-mean-v1",
        definitionHash,
        evaluationKey: definition.evaluationKey,
        seed: definition.seed,
        revision: 0,
        scenarios: definition.scenarios.map((scenario) => ({
          ...scenario,
          assistedSide: assistedAScenarios.has(scenario.scenarioKey) ? "A" : "B",
        })),
      };
      return { state, value: publicView(state) };
    });
  }

  prepare(
    evaluationKey: string,
    scenarioKey: string,
    variant: EvaluationVariant,
  ): string {
    return this.#mutate(evaluationKey, (state) => {
      const current = requiredState(state);
      if (current.scenarios.some((scenario) => scenario.judgment)) {
        throw new Error("An evaluation is sealed after judging begins.");
      }
      const scenario = findScenario(current, scenarioKey);
      const field =
        variant === "baseline"
          ? "baselineInstruction"
          : "assistedInstruction";
      let instruction = scenario[field];
      if (instruction === undefined) {
        instruction =
          variant === "baseline"
            ? baselineInstruction(scenario)
            : this.#drafting.preview(draftRequest(current, scenario));
        scenario[field] = instruction;
        current.revision += 1;
      }
      return { state: current, value: instruction };
    });
  }

  submit(
    evaluationKey: string,
    scenarioKey: string,
    variant: EvaluationVariant,
    text: string,
  ): EvaluationView {
    return this.#mutate(evaluationKey, (state) => {
      const current = requiredState(state);
      if (current.scenarios.some((scenario) => scenario.judgment)) {
        throw new Error("An evaluation is sealed after judging begins.");
      }
      const scenario = findScenario(current, scenarioKey);
      const field =
        variant === "baseline" ? "baselineDraft" : "assistedDraft";
      const instructionField =
        variant === "baseline"
          ? "baselineInstruction"
          : "assistedInstruction";
      if (scenario[instructionField] === undefined) {
        throw new Error(
          "Prepare this evaluation variant before submitting its draft.",
        );
      }
      const existing = scenario[field];
      if (existing !== undefined && existing !== text) {
        throw new Error("This evaluation draft is already recorded.");
      }
      if (existing === undefined) {
        scenario[field] = text;
        current.revision += 1;
      }
      return { state: current, value: publicView(current) };
    });
  }

  view(evaluationKey: string): EvaluationView {
    return publicView(this.#read(evaluationKey));
  }

  judge(
    evaluationKey: string,
    judgment: EvaluationJudgment,
  ): EvaluationView {
    return this.#mutate(evaluationKey, (state) => {
      const current = requiredState(state);
      if (!allDraftsSubmitted(current)) {
        throw new Error("All twenty drafts must be recorded before judging.");
      }
      const scenario = findScenario(current, judgment.scenarioKey);
      const stored: StoredJudgment = {
        scenarioKey: judgment.scenarioKey,
        preferredSide: judgment.preferredSide,
        clarityA: judgment.clarityA,
        clarityB: judgment.clarityB,
      };
      if (scenario.judgment) {
        if (JSON.stringify(scenario.judgment) !== JSON.stringify(stored)) {
          throw new Error("This scenario already has a different judgment.");
        }
        return { state: current, value: publicView(current) };
      }
      if (judgment.revision !== current.revision) {
        throw new Error("Evaluation changed. Refresh before judging.");
      }
      const next = current.scenarios.find((item) => item.judgment === undefined);
      if (next !== scenario) {
        throw new Error("Judge the currently displayed scenario.");
      }
      scenario.judgment = stored;
      current.revision += 1;
      return { state: current, value: publicView(current) };
    });
  }

  #path(evaluationKey: string): string {
    return join(this.#directory, `${evaluationKey}.json`);
  }

  #read(evaluationKey: string): StoredEvaluation {
    const path = this.#path(evaluationKey);
    if (!existsSync(path)) {
      throw new Error("Evaluation was not found.");
    }
    return JSON.parse(readFileSync(path, "utf8")) as StoredEvaluation;
  }

  #mutate<T>(
    evaluationKey: string,
    operation: (
      state?: StoredEvaluation,
    ) => { state: StoredEvaluation; value: T },
  ): T {
    mkdirSync(this.#directory, { recursive: true, mode: 0o700 });
    chmodSync(this.#directory, 0o700);
    const lock = `${this.#path(evaluationKey)}.lock`;
    let lockDescriptor: number | undefined;
    try {
      lockDescriptor = openSync(lock, "wx", 0o600);
      const state = existsSync(this.#path(evaluationKey))
        ? this.#read(evaluationKey)
        : undefined;
      const result = operation(state);
      this.#write(result.state);
      return result.value;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        throw new Error("Evaluation is busy. Retry the operation.");
      }
      throw error;
    } finally {
      if (lockDescriptor !== undefined) {
        closeSync(lockDescriptor);
        unlinkSync(lock);
      }
    }
  }

  #write(state: StoredEvaluation): void {
    const path = this.#path(state.evaluationKey);
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, "wx", 0o600);
      writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, path);
      chmodSync(path, 0o600);
    } catch (error) {
      if (descriptor !== undefined) {
        closeSync(descriptor);
      }
      if (existsSync(temporary)) {
        unlinkSync(temporary);
      }
      throw error;
    }
  }
}

function findScenario(
  state: StoredEvaluation,
  scenarioKey: string,
): StoredScenario {
  const scenario = state.scenarios.find(
    (candidate) => candidate.scenarioKey === scenarioKey,
  );
  if (!scenario) {
    throw new Error("Evaluation scenario was not found.");
  }
  return scenario;
}

function requiredState(
  state: StoredEvaluation | undefined,
): StoredEvaluation {
  if (!state) {
    throw new Error("Evaluation was not found.");
  }
  return state;
}

function draftRequest(
  state: StoredEvaluation,
  scenario: StoredScenario,
): DraftStartRequest {
  return {
    requestKey: `evaluation:${state.evaluationKey}:${scenario.scenarioKey}`,
    objective: scenario.objective,
    ...(scenario.audience === undefined ? {} : { audience: scenario.audience }),
    ...(scenario.situation === undefined
      ? {}
      : { situation: scenario.situation }),
    constraints: scenario.constraints,
    ...(scenario.destination === undefined
      ? {}
      : { destination: scenario.destination }),
    ...(scenario.thread === undefined ? {} : { thread: scenario.thread }),
    currentMaterials: scenario.currentMaterials,
  };
}

function baselineInstruction(scenario: StoredScenario): string {
  return [
    "# Draft Task",
    "",
    "Write one clear proposed Slack message for this situation.",
    "",
    `Objective: ${scenario.objective}`,
    ...(scenario.audience ? [`Audience: ${scenario.audience}`] : []),
    ...(scenario.situation ? [`Situation: ${scenario.situation}`] : []),
    ...(scenario.destination ? [`Destination: ${scenario.destination}`] : []),
    ...(scenario.thread ? [`Thread: ${scenario.thread}`] : []),
    ...(scenario.constraints.length
      ? ["Constraints:", ...scenario.constraints.map((item) => `- ${item}`)]
      : []),
    ...(scenario.currentMaterials.length
      ? [
          "Current Materials:",
          ...scenario.currentMaterials.map((material, index) =>
            [
              `- ${index + 1}.`,
              material.kind,
              material.role,
              material.description,
            ]
              .filter(Boolean)
              .join(" "),
          ),
        ]
      : []),
  ].join("\n");
}

function publicView(state: StoredEvaluation): EvaluationView {
  const draftsSubmitted = state.scenarios.reduce(
    (count, scenario) =>
      count +
      Number(scenario.baselineDraft !== undefined) +
      Number(scenario.assistedDraft !== undefined),
    0,
  );
  if (draftsSubmitted < 20) {
    return {
      evaluationKey: state.evaluationKey,
      status: "collecting",
      scenarioCount: 10,
      draftsSubmitted,
    };
  }
  const completedChoices = state.scenarios.filter(
    (scenario) => scenario.judgment !== undefined,
  ).length;
  if (completedChoices < 10) {
    const scenario = state.scenarios.find(
      (candidate) => candidate.judgment === undefined,
    )!;
    return {
      evaluationKey: state.evaluationKey,
      status: "judging",
      completedChoices,
      totalChoices: 10,
      scenario: {
        position: completedChoices + 1,
        scenarioKey: scenario.scenarioKey,
        objective: scenario.objective,
        ...(scenario.audience === undefined
          ? {}
          : { audience: scenario.audience }),
        ...(scenario.situation === undefined
          ? {}
          : { situation: scenario.situation }),
        constraints: scenario.constraints,
        ...(scenario.destination === undefined
          ? {}
          : { destination: scenario.destination }),
        ...(scenario.thread === undefined ? {} : { thread: scenario.thread }),
        currentMaterials: scenario.currentMaterials,
        sideA:
          scenario.assistedSide === "A"
            ? scenario.assistedDraft!
            : scenario.baselineDraft!,
        sideB:
          scenario.assistedSide === "B"
            ? scenario.assistedDraft!
            : scenario.baselineDraft!,
        revision: state.revision,
      },
    };
  }
  return {
    evaluationKey: state.evaluationKey,
    status: "complete",
    completedChoices: 10,
    totalChoices: 10,
    ...score(state),
  };
}

function score(state: StoredEvaluation): EvaluationReport {
  let assistedWins = 0;
  let assistedClarity = 0;
  let baselineClarity = 0;
  for (const scenario of state.scenarios) {
    const judgment = scenario.judgment!;
    if (judgment.preferredSide === scenario.assistedSide) {
      assistedWins += 1;
    }
    assistedClarity +=
      scenario.assistedSide === "A" ? judgment.clarityA : judgment.clarityB;
    baselineClarity +=
      scenario.assistedSide === "A" ? judgment.clarityB : judgment.clarityA;
  }
  const assistedMeanClarity = assistedClarity / 10;
  const baselineMeanClarity = baselineClarity / 10;
  return {
    scoringVersion: "voice-win-7-clarity-mean-v1",
    assistedWins,
    baselineWins: 10 - assistedWins,
    assistedMeanClarity,
    baselineMeanClarity,
    passed: assistedWins >= 7 && assistedMeanClarity >= baselineMeanClarity,
  };
}

function allDraftsSubmitted(state: StoredEvaluation): boolean {
  return state.scenarios.every(
    (scenario) =>
      scenario.baselineDraft !== undefined &&
      scenario.assistedDraft !== undefined,
  );
}

function assistedASideKeys(
  seed: string,
  scenarios: EvaluationScenario[],
): Set<string> {
  return new Set(
    [...scenarios]
      .sort((left, right) =>
        hash(`${seed}\0${left.scenarioKey}`).localeCompare(
          hash(`${seed}\0${right.scenarioKey}`),
        ),
      )
      .slice(0, 5)
      .map((scenario) => scenario.scenarioKey),
  );
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
