import { initialMigration } from "./001-initial.ts";
import { syncMigration } from "./002-sync.ts";
import { queueMigration } from "./003-queue.ts";
import { profileMigration } from "./004-profile.ts";

export const migrations = [
  initialMigration,
  syncMigration,
  queueMigration,
  profileMigration,
] as const;
