export type SlackContextItem = {
  position: "before" | "after";
  authorLabel: string;
  text: string;
};

export type Material = {
  ordinal: number;
  kind: "image" | "link" | "file" | "other";
  role: "evidence" | "reference" | "instruction" | "unknown";
  label?: string;
  url?: string;
  sourceReference?: string;
};

export type NormalizedSourceMessage = {
  sourceKey: string;
  publishedAt: string;
  text: string;
  context: SlackContextItem[];
  materials: Material[];
};

export type ImportEnvelope = {
  schemaVersion: 1;
  sourceMessages: NormalizedSourceMessage[];
};

export type ImportResult = {
  imported: number;
  updated: number;
  unchanged: number;
};
