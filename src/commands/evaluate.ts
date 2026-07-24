import { openVoicebook } from "../application.ts";
import type { EvaluationView } from "../evaluation/port.ts";
import {
  parseEvaluationDefinition,
  parseEvaluationKey,
  parseEvaluationSubmission,
  parseEvaluationTarget,
} from "../evaluation/validation.ts";

const maximumInputBytes = 2 * 1024 * 1024;

export async function runEvaluateCommand(input: {
  args: string[];
  workspace: string;
}): Promise<void> {
  const operation = input.args[0];
  const application = openVoicebook(input.workspace);
  try {
    if (operation === "status") {
      write(
        statusOnly(
          application.evaluation.view(
            parseEvaluationKey(option(input.args, "--evaluation-key")),
          ),
        ),
      );
      return;
    }
    if (!input.args.includes("--stdin")) {
      throw new Error("Evaluate create, prepare, and submit require --stdin.");
    }
    const value = await readJsonInput();
    if (operation === "create") {
      write(statusOnly(application.evaluation.create(parseEvaluationDefinition(value))));
      return;
    }
    if (operation === "prepare") {
      const target = parseEvaluationTarget(value);
      write({
        ...target,
        instruction: application.evaluation.prepare(
          target.evaluationKey,
          target.scenarioKey,
          target.variant,
        ),
      });
      return;
    }
    if (operation === "submit") {
      const submission = parseEvaluationSubmission(value);
      write(
        statusOnly(
          application.evaluation.submit(
            submission.evaluationKey,
            submission.scenarioKey,
            submission.variant,
            submission.text,
          ),
        ),
      );
      return;
    }
    throw new Error(
      "Usage: voicebook evaluate <create|prepare|submit|status>.",
    );
  } finally {
    application.close();
  }
}

function statusOnly(view: EvaluationView): Record<string, unknown> {
  if (view.status !== "judging") {
    return view;
  }
  return {
    evaluationKey: view.evaluationKey,
    status: view.status,
    completedChoices: view.completedChoices,
    totalChoices: view.totalChoices,
  };
}

async function readJsonInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumInputBytes) {
      throw new Error("Evaluation input exceeds 2 MiB.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Evaluation input must be JSON.");
  }
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
