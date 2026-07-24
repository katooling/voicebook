import type { DraftMaterialHint } from "../drafting/port.ts";

export type EvaluationVariant = "baseline" | "assisted";
export type EvaluationSide = "A" | "B";

export type EvaluationScenario = {
  scenarioKey: string;
  objective: string;
  audience?: string;
  situation?: string;
  constraints: string[];
  destination?: string;
  thread?: string;
  currentMaterials: DraftMaterialHint[];
};

export type EvaluationDefinition = {
  evaluationKey: string;
  seed: string;
  scenarios: EvaluationScenario[];
};

export type EvaluationJudgment = {
  scenarioKey: string;
  revision: number;
  preferredSide: EvaluationSide;
  clarityA: number;
  clarityB: number;
};

export type EvaluationReport = {
  scoringVersion: "voice-win-7-clarity-mean-v1";
  assistedWins: number;
  baselineWins: number;
  assistedMeanClarity: number;
  baselineMeanClarity: number;
  passed: boolean;
};

export type EvaluationView =
  | {
      evaluationKey: string;
      status: "collecting";
      scenarioCount: 10;
      draftsSubmitted: number;
    }
  | {
      evaluationKey: string;
      status: "judging";
      completedChoices: number;
      totalChoices: 10;
      scenario: {
        position: number;
        scenarioKey: string;
        objective: string;
        audience?: string;
        situation?: string;
        constraints: string[];
        destination?: string;
        thread?: string;
        currentMaterials: DraftMaterialHint[];
        sideA: string;
        sideB: string;
        revision: number;
      };
    }
  | ({
      evaluationKey: string;
      status: "complete";
      completedChoices: 10;
      totalChoices: 10;
    } & EvaluationReport);

export interface EvaluationApplication {
  create(definition: EvaluationDefinition): EvaluationView;
  prepare(
    evaluationKey: string,
    scenarioKey: string,
    variant: EvaluationVariant,
  ): string;
  submit(
    evaluationKey: string,
    scenarioKey: string,
    variant: EvaluationVariant,
    text: string,
  ): EvaluationView;
  view(evaluationKey: string): EvaluationView;
  judge(evaluationKey: string, judgment: EvaluationJudgment): EvaluationView;
}
