import { initialMigration } from "./001-initial.ts";
import { syncMigration } from "./002-sync.ts";
import { queueMigration } from "./003-queue.ts";
import { profileMigration } from "./004-profile.ts";
import { draftingMigration } from "./005-drafting.ts";
import { reconciliationMigration } from "./006-reconciliation.ts";

export const migrations = [
  initialMigration,
  syncMigration,
  queueMigration,
  profileMigration,
  draftingMigration,
  reconciliationMigration,
] as const;
