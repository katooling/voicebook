import { SqliteCandidateApplication } from "./candidates/sqlite.ts";
import type { CandidateApplication } from "./candidates/port.ts";
import { SqliteCoreApplication } from "./core/sqlite.ts";
import type { CoreApplication } from "./core/port.ts";
import { openDatabase } from "./storage/database.ts";
import type { ProfileApplication } from "./profile/port.ts";
import { SqliteProfileApplication } from "./profile/sqlite.ts";
import type { SyncApplication } from "./sync/port.ts";
import { SqliteSyncApplication } from "./sync/sqlite.ts";
import type { QueueApplication } from "./queue/port.ts";
import { SqliteQueueApplication } from "./queue/sqlite.ts";
import { suggestContextualTags } from "./queue/analysis.ts";

export type VoicebookApplication = {
  candidates: CandidateApplication;
  core: CoreApplication;
  profile: ProfileApplication;
  sync: SyncApplication;
  queue: QueueApplication;
  close(): void;
};

export function openVoicebook(workspace: string): VoicebookApplication {
  const database = openDatabase(workspace);
  const candidates = new SqliteCandidateApplication(database, {
    suggestTags: suggestContextualTags,
  });
  return {
    candidates,
    core: new SqliteCoreApplication(database),
    profile: new SqliteProfileApplication(database),
    sync: new SqliteSyncApplication(database),
    queue: new SqliteQueueApplication(database, { candidates }),
    close: () => database.close(),
  };
}
