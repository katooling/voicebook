import { initialMigration } from "./001-initial.ts";
import { syncMigration } from "./002-sync.ts";

export const migrations = [initialMigration, syncMigration] as const;
