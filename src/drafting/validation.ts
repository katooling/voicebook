import type {
  DraftMaterialHint,
  DraftStartRequest,
} from "./port.ts";

const materialKinds = new Set(["image", "link", "file", "other"]);
const materialRoles = new Set([
  "evidence",
  "reference",
  "instruction",
  "unknown",
]);

export function parseDraftStartInput(value: unknown): DraftStartRequest {
  const input = record(value, "Draft start input");
  schemaVersion(input);
  const audience = optionalString(input.audience, "audience", 2_000);
  const situation = optionalString(input.situation, "situation", 4_000);
  const destination = optionalString(
    input.destination,
    "destination",
    1_000,
  );
  const thread = optionalString(input.thread, "thread", 1_000);
  const constraints = optionalStringArray(
    input.constraints,
    "constraints",
    12,
    500,
  );
  const currentMaterials = optionalArray(
    input.currentMaterials,
    "currentMaterials",
    8,
  ).map(parseMaterialHint);
  return {
    requestKey: requiredToken(input.requestKey, "requestKey", 128),
    objective: requiredString(input.objective, "objective", 4_000),
    ...(audience === undefined ? {} : { audience }),
    ...(situation === undefined ? {} : { situation }),
    constraints,
    ...(destination === undefined ? {} : { destination }),
    ...(thread === undefined ? {} : { thread }),
    currentMaterials,
  };
}

export function parseDraftFinishInput(value: unknown): {
  runId: string;
  text: string;
} {
  const input = record(value, "Draft finish input");
  schemaVersion(input);
  return {
    runId: requiredToken(input.runId, "runId", 128),
    text: requiredString(input.text, "text", 128 * 1024),
  };
}

function parseMaterialHint(value: unknown, index: number): DraftMaterialHint {
  const input = record(value, `currentMaterials[${index}]`);
  if (
    typeof input.kind !== "string" ||
    !materialKinds.has(input.kind)
  ) {
    throw new Error(
      `currentMaterials[${index}].kind must be image, link, file, or other.`,
    );
  }
  if (
    input.role !== undefined &&
    (typeof input.role !== "string" || !materialRoles.has(input.role))
  ) {
    throw new Error(
      `currentMaterials[${index}].role is not supported.`,
    );
  }
  const description = optionalString(
    input.description,
    `currentMaterials[${index}].description`,
    1_000,
  );
  return {
    kind: input.kind as DraftMaterialHint["kind"],
    ...(input.role === undefined
      ? {}
      : { role: input.role as NonNullable<DraftMaterialHint["role"]> }),
    ...(description === undefined ? {} : { description }),
  };
}

function schemaVersion(input: Record<string, unknown>): void {
  if (input.schemaVersion !== 1) {
    throw new Error("Draft input must use schemaVersion 1.");
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredToken(
  value: unknown,
  name: string,
  maximumLength: number,
): string {
  const result = requiredString(value, name, maximumLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) {
    throw new Error(
      `${name} must contain only letters, numbers, periods, underscores, colons, or hyphens.`,
    );
  }
  return result;
}

function requiredString(
  value: unknown,
  name: string,
  maximumLength: number,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be non-empty text.`);
  }
  if (Buffer.byteLength(value, "utf8") > maximumLength) {
    throw new Error(`${name} is too large.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  name: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, name, maximumLength);
}

function optionalStringArray(
  value: unknown,
  name: string,
  maximumItems: number,
  maximumItemLength: number,
): string[] {
  return optionalArray(value, name, maximumItems).map((item, index) =>
    requiredString(item, `${name}[${index}]`, maximumItemLength),
  );
}

function optionalArray(
  value: unknown,
  name: string,
  maximumItems: number,
): unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array.`);
  }
  if (value.length > maximumItems) {
    throw new Error(`${name} has too many items.`);
  }
  return value;
}
