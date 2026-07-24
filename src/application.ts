import { SqliteCandidateApplication } from "./candidates/sqlite.ts";
import type { CandidateApplication } from "./candidates/port.ts";
import { SqliteCoreApplication } from "./core/sqlite.ts";
import type { CoreApplication } from "./core/port.ts";
import { openDatabase } from "./storage/database.ts";

export type VoicebookApplication = {
  candidates: CandidateApplication;
  core: CoreApplication;
  close(): void;
};

export function openVoicebook(workspace: string): VoicebookApplication {
  const database = openDatabase(workspace);
  return {
    candidates: new SqliteCandidateApplication(database),
    core: new SqliteCoreApplication(database),
    close: () => database.close(),
  };
}
