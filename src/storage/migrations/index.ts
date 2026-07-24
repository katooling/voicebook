import { initialMigration } from "./001-initial.ts";

export const migrations = [initialMigration] as const;
