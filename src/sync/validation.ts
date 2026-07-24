import type { Material, SlackContextItem } from "../contracts.ts";
import type {
  SyncPageEnvelope,
  SyncScope,
  SyncSourceMessage,
} from "./contracts.ts";

const materialKinds = new Set(["image", "link", "file", "other"]);
const materialRoles = new Set([
  "evidence",
  "reference",
  "instruction",
  "unknown",
]);

export function parseSyncPage(value: unknown): SyncPageEnvelope {
  const page = record(value, "Sync page");
  if (page.schemaVersion !== 1) {
    throw new Error("Sync input must use schemaVersion 1.");
  }
  const cursor = nullableText(page.cursor, "cursor");
  const nextCursor = nullableText(page.nextCursor, "nextCursor");
  if (cursor !== null && cursor === nextCursor) {
    throw new Error("nextCursor must advance when synchronization is partial.");
  }
  if (!Array.isArray(page.sourceMessages)) {
    throw new Error("sourceMessages must be an array.");
  }

  return {
    schemaVersion: 1,
    syncKey: text(page.syncKey, "syncKey"),
    pageKey: text(page.pageKey, "pageKey"),
    cursor,
    nextCursor,
    voiceOwnerAuthorKey: text(
      page.voiceOwnerAuthorKey,
      "voiceOwnerAuthorKey",
    ),
    scope: parseScope(page.scope),
    sourceMessages: page.sourceMessages.map(parseSourceMessage),
  };
}

function parseScope(value: unknown): SyncScope {
  const scope = record(value, "scope");
  return {
    windowStart: isoDate(scope.windowStart, "scope.windowStart"),
    selectedConversationKeys: uniqueTextArray(
      scope.selectedConversationKeys,
      "scope.selectedConversationKeys",
    ),
    optedInDirectMessageKeys: uniqueTextArray(
      scope.optedInDirectMessageKeys,
      "scope.optedInDirectMessageKeys",
    ),
    excludedConversationKeys: uniqueTextArray(
      scope.excludedConversationKeys,
      "scope.excludedConversationKeys",
    ),
  };
}

function parseSourceMessage(value: unknown): SyncSourceMessage {
  const message = record(value, "Source Message");
  const conversation = record(message.conversation, "conversation");
  const kind = conversation.kind;
  if (kind !== "channel" && kind !== "directMessage") {
    throw new Error("conversation.kind must be channel or directMessage.");
  }
  const deleted = message.deleted === true;
  const context = message.context ?? [];
  const materials = message.materials ?? [];
  if (!Array.isArray(context)) {
    throw new Error("context must be an array.");
  }
  if (!Array.isArray(materials)) {
    throw new Error("materials must be an array.");
  }

  return {
    sourceKey: text(message.sourceKey, "sourceKey"),
    authorKey: text(message.authorKey, "authorKey"),
    conversation: {
      key: text(conversation.key, "conversation.key"),
      kind,
    },
    publishedAt: isoDate(message.publishedAt, "publishedAt"),
    deleted,
    text: deleted ? optionalText(message.text) : text(message.text, "text"),
    context: deleted ? [] : context.map(parseContext),
    materials: deleted
      ? []
      : materials.map(parseMaterial).sort((left, right) => left.ordinal - right.ordinal),
  };
}

function parseContext(value: unknown): SlackContextItem {
  const item = record(value, "Slack Context item");
  if (item.position !== "before" && item.position !== "after") {
    throw new Error("Slack Context position must be before or after.");
  }
  return {
    position: item.position,
    authorLabel: text(item.authorLabel, "context.authorLabel"),
    text: text(item.text, "context.text"),
  };
}

function parseMaterial(value: unknown): Material {
  const material = record(value, "Material");
  if (
    !Number.isInteger(material.ordinal) ||
    (material.ordinal as number) < 1
  ) {
    throw new Error("Material ordinal must be a positive integer.");
  }
  if (
    typeof material.kind !== "string" ||
    !materialKinds.has(material.kind)
  ) {
    throw new Error("Material kind is invalid.");
  }
  if (
    typeof material.role !== "string" ||
    !materialRoles.has(material.role)
  ) {
    throw new Error("Material role is invalid.");
  }
  return {
    ordinal: material.ordinal as number,
    kind: material.kind as Material["kind"],
    role: material.role as Material["role"],
    ...optionalField(material, "label"),
    ...optionalField(material, "url"),
    ...optionalField(material, "sourceReference"),
  };
}

function optionalField(
  recordValue: Record<string, unknown>,
  field: "label" | "url" | "sourceReference",
): Partial<Pick<Material, typeof field>> {
  const value = recordValue[field];
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "string") {
    throw new Error(`Material ${field} must be text.`);
  }
  return { [field]: value };
}

function uniqueTextArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  const result = value.map((item) => text(item, field));
  if (new Set(result).size !== result.length) {
    throw new Error(`${field} must not contain duplicates.`);
  }
  return result;
}

function isoDate(value: unknown, field: string): string {
  const result = text(value, field);
  if (Number.isNaN(Date.parse(result))) {
    throw new Error(`${field} must be an ISO date.`);
  }
  return result;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return text(value, field);
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be non-empty text.`);
  }
  return value;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}
