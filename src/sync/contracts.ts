import type { Material, SlackContextItem } from "../contracts.ts";

export type SyncConversation = {
  key: string;
  kind: "channel" | "directMessage";
};

export type SyncSourceMessage = {
  sourceKey: string;
  authorKey: string;
  conversation: SyncConversation;
  publishedAt: string;
  deleted: boolean;
  text: string;
  context: SlackContextItem[];
  materials: Material[];
};

export type SyncScope = {
  windowStart: string;
  selectedConversationKeys: string[];
  optedInDirectMessageKeys: string[];
  excludedConversationKeys: string[];
};

export type SyncPageEnvelope = {
  schemaVersion: 1;
  syncKey: string;
  pageKey: string;
  cursor: string | null;
  nextCursor: string | null;
  voiceOwnerAuthorKey: string;
  scope: SyncScope;
  sourceMessages: SyncSourceMessage[];
};

export type SyncReceipt = {
  syncKey: string;
  pageKey: string;
  status: "partial" | "complete";
  resumeCursor: string | null;
  imported: number;
  updated: number;
  deleted: number;
  unchanged: number;
  excluded: number;
  outsideWindow: number;
};

export type SyncProgress = {
  syncKey: string;
  status: "partial" | "complete";
  resumeCursor: string | null;
  pagesProcessed: number;
};
