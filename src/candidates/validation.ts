import type {
  ImportEnvelope,
  Material,
  NormalizedSourceMessage,
  SlackContextItem,
} from "../contracts.ts";

const materialKinds = new Set(["image", "link", "file", "other"]);
const materialRoles = new Set(["evidence", "reference", "instruction", "unknown"]);

export function validateImportEnvelope(
  value: unknown,
): asserts value is ImportEnvelope {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Import input must use schemaVersion 1.");
  }
  if (!Array.isArray(value.sourceMessages) || value.sourceMessages.length === 0) {
    throw new Error("Import input must contain at least one Source Message.");
  }
  for (const message of value.sourceMessages) {
    validateSourceMessage(message);
  }
}

function validateSourceMessage(
  value: unknown,
): asserts value is NormalizedSourceMessage {
  if (!isRecord(value)) {
    throw new Error("Each Source Message must be an object.");
  }
  requireText(value.sourceKey, "sourceKey");
  requireText(value.publishedAt, "publishedAt");
  if (Number.isNaN(Date.parse(value.publishedAt))) {
    throw new Error("publishedAt must be an ISO date.");
  }
  requireText(value.text, "text");
  if (!Array.isArray(value.context)) {
    throw new Error("context must be an array.");
  }
  value.context.forEach(validateContextItem);
  if (!Array.isArray(value.materials)) {
    throw new Error("materials must be an array.");
  }
  value.materials.forEach(validateMaterial);
  const ordinals = new Set(value.materials.map((material) => material.ordinal));
  if (ordinals.size !== value.materials.length) {
    throw new Error("Material ordinals must be unique.");
  }
}

function validateContextItem(
  value: unknown,
): asserts value is SlackContextItem {
  if (!isRecord(value) || (value.position !== "before" && value.position !== "after")) {
    throw new Error("Slack Context position must be before or after.");
  }
  requireText(value.authorLabel, "context.authorLabel");
  requireText(value.text, "context.text");
}

function validateMaterial(value: unknown): asserts value is Material {
  if (!isRecord(value)) {
    throw new Error("Each Material must be an object.");
  }
  if (!Number.isInteger(value.ordinal) || (value.ordinal as number) < 1) {
    throw new Error("Material ordinal must be a positive integer.");
  }
  if (typeof value.kind !== "string" || !materialKinds.has(value.kind)) {
    throw new Error("Material kind is invalid.");
  }
  if (typeof value.role !== "string" || !materialRoles.has(value.role)) {
    throw new Error("Material role is invalid.");
  }
  for (const field of ["label", "url", "sourceReference"] as const) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && typeof fieldValue !== "string") {
      throw new Error(`Material ${field} must be text.`);
    }
  }
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be non-empty text.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
