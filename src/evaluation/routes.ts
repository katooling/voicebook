import type { IncomingMessage, ServerResponse } from "node:http";
import type { EvaluationApplication } from "./port.ts";
import { renderEvaluation } from "./html.ts";
import { parseEvaluationJudgment, parseEvaluationKey } from "./validation.ts";
import { readProtectedForm } from "../http/security.ts";

export function showEvaluation(input: {
  response: ServerResponse;
  evaluation: EvaluationApplication;
  csrfToken: string;
  url: URL;
}): void {
  const key = parseEvaluationKey(input.url.searchParams.get("key") ?? undefined);
  const html = renderEvaluation(input.evaluation.view(key), input.csrfToken);
  input.response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  input.response.end(html);
}

export async function judgeEvaluation(input: {
  request: IncomingMessage;
  response: ServerResponse;
  evaluation: EvaluationApplication;
  csrfToken: string;
  evaluationKey: string;
}): Promise<void> {
  const form = await readProtectedForm(input.request, input.csrfToken);
  if (!form) {
    input.response.writeHead(403, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    input.response.end("Invalid form submission.");
    return;
  }
  const values = Object.fromEntries(form.entries());
  try {
    input.evaluation.judge(
      parseEvaluationKey(input.evaluationKey),
      parseEvaluationJudgment(values),
    );
  } catch {
    input.response.writeHead(409, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    input.response.end("Evaluation changed. Refresh before judging.");
    return;
  }
  input.response.writeHead(303, {
    Location: `/evaluation?key=${encodeURIComponent(input.evaluationKey)}`,
  });
  input.response.end();
}
