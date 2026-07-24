export type DraftMaterialHint = {
  kind: "image" | "link" | "file" | "other";
  role?: "evidence" | "reference" | "instruction" | "unknown";
  description?: string;
};

export type DraftStartRequest = {
  requestKey: string;
  objective: string;
  audience?: string;
  situation?: string;
  constraints: string[];
  destination?: string;
  thread?: string;
  currentMaterials: DraftMaterialHint[];
};

export type DraftStartReceipt = {
  runId: string;
  draftBrief: string;
};

export type DraftFinishReceipt = {
  runId: string;
  status: "recorded";
  recordedAt: string;
};

export class DraftOperationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DraftOperationError";
  }
}

export interface DraftApplication {
  begin(request: DraftStartRequest): DraftStartReceipt;
  preview(request: DraftStartRequest): string;
  record(runId: string, text: string): DraftFinishReceipt;
}
