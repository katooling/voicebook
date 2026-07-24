import { parseDraftStartInput } from "../drafting/validation.ts";
import type {
  EvaluationDefinition,
  EvaluationJudgment,
  EvaluationScenario,
  EvaluationVariant,
} from "./port.ts";

export function parseEvaluationDefinition(value: unknown): EvaluationDefinition {
  const input = record(value, "Evaluation input");
  schemaVersion(input);
  if (!Array.isArray(input.scenarios) || input.scenarios.length !== 10) {
    throw new Error("An evaluation requires exactly ten scenarios.");
  }
  const scenarios = input.scenarios.map((value, index) =>
    parseScenario(value, index),
  );
  if (new Set(scenarios.map((scenario) => scenario.scenarioKey)).size !== 10) {
    throw new Error("Evaluation scenarioKey values must be unique.");
  }
  return {
    evaluationKey: token(input.evaluationKey, "evaluationKey"),
    seed: token(input.seed, "seed"),
    scenarios,
  };
}

export function parseEvaluationTarget(value: unknown): {
  evaluationKey: string;
  scenarioKey: string;
  variant: EvaluationVariant;
} {
  const input = record(value, "Evaluation target");
  schemaVersion(input);
  if (input.variant !== "baseline" && input.variant !== "assisted") {
    throw new Error("variant must be baseline or assisted.");
  }
  return {
    evaluationKey: token(input.evaluationKey, "evaluationKey"),
    scenarioKey: token(input.scenarioKey, "scenarioKey"),
    variant: input.variant,
  };
}

export function parseEvaluationSubmission(value: unknown): {
  evaluationKey: string;
  scenarioKey: string;
  variant: EvaluationVariant;
  text: string;
} {
  const input = record(value, "Evaluation submission");
  const target = parseEvaluationTarget(input);
  if (typeof input.text !== "string" || input.text.trim() === "") {
    throw new Error("Evaluation draft text must not be empty.");
  }
  if (Buffer.byteLength(input.text, "utf8") > 128 * 1024) {
    throw new Error("Evaluation draft text is too large.");
  }
  return { ...target, text: input.text };
}

export function parseEvaluationJudgment(
  value: Record<string, string>,
): EvaluationJudgment {
  const revision = Number(value.revision);
  const clarityA = Number(value.clarityA);
  const clarityB = Number(value.clarityB);
  if (value.preferredSide !== "A" && value.preferredSide !== "B") {
    throw new Error("Choose Side A or Side B for voice.");
  }
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Evaluation revision is invalid.");
  }
  if (
    !Number.isInteger(clarityA) ||
    !Number.isInteger(clarityB) ||
    clarityA < 1 ||
    clarityA > 5 ||
    clarityB < 1 ||
    clarityB > 5
  ) {
    throw new Error("Clarity scores must be integers from 1 to 5.");
  }
  return {
    scenarioKey: token(value.scenarioKey, "scenarioKey"),
    revision,
    preferredSide: value.preferredSide,
    clarityA,
    clarityB,
  };
}

export function parseEvaluationKey(value: unknown): string {
  return token(value, "evaluationKey");
}

function parseScenario(value: unknown, index: number): EvaluationScenario {
  const input = record(value, `scenarios[${index}]`);
  const scenarioKey = token(input.scenarioKey, `scenarios[${index}].scenarioKey`);
  const request = parseDraftStartInput({
    ...input,
    schemaVersion: 1,
    requestKey: scenarioKey,
  });
  return {
    scenarioKey,
    objective: request.objective,
    ...(request.audience === undefined ? {} : { audience: request.audience }),
    ...(request.situation === undefined
      ? {}
      : { situation: request.situation }),
    constraints: request.constraints,
    ...(request.destination === undefined
      ? {}
      : { destination: request.destination }),
    ...(request.thread === undefined ? {} : { thread: request.thread }),
    currentMaterials: request.currentMaterials,
  };
}

function schemaVersion(input: Record<string, unknown>): void {
  if (input.schemaVersion !== 1) {
    throw new Error("Evaluation input must use schemaVersion 1.");
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function token(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  ) {
    throw new Error(
      `${name} must be a non-empty token containing only letters, numbers, periods, underscores, colons, or hyphens.`,
    );
  }
  return value;
}
