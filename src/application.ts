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
import type { ExportApplication } from "./export/port.ts";
import { SqliteExportApplication } from "./export/sqlite.ts";
import type { DraftApplication } from "./drafting/port.ts";
import { SqliteDraftApplication } from "./drafting/sqlite.ts";
import type { ReconciliationApplication } from "./reconciliation/port.ts";
import { SqliteReconciliationApplication } from "./reconciliation/sqlite.ts";
import type { EvaluationApplication } from "./evaluation/port.ts";
import { FileEvaluationApplication } from "./evaluation/file.ts";

export type VoicebookApplication = {
  candidates: CandidateApplication;
  core: CoreApplication;
  profile: ProfileApplication;
  sync: SyncApplication;
  queue: QueueApplication;
  export: ExportApplication;
  drafting: DraftApplication;
  reconciliation: ReconciliationApplication;
  evaluation: EvaluationApplication;
  close(): void;
};

export function openVoicebook(workspace: string): VoicebookApplication {
  const database = openDatabase(workspace);
  const candidates = new SqliteCandidateApplication(database, {
    suggestTags: suggestContextualTags,
  });
  const reconciliation = new SqliteReconciliationApplication(database);
  const drafting = new SqliteDraftApplication(database);
  return {
    candidates,
    core: new SqliteCoreApplication(database),
    profile: new SqliteProfileApplication(database),
    sync: new SqliteSyncApplication(database, reconciliation),
    queue: new SqliteQueueApplication(database, { candidates }),
    export: new SqliteExportApplication(database),
    drafting,
    reconciliation,
    evaluation: new FileEvaluationApplication(workspace, drafting),
    close: () => database.close(),
  };
}
