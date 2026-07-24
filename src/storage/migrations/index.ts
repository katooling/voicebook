import { initialMigration } from "./001-initial.ts";
import { syncMigration } from "./002-sync.ts";
import { queueMigration } from "./003-queue.ts";

export const migrations = [initialMigration, syncMigration, queueMigration] as const;
