import type {
  SyncPageEnvelope,
  SyncProgress,
  SyncReceipt,
} from "./contracts.ts";

export interface SyncApplication {
  applyPage(page: SyncPageEnvelope): SyncReceipt;
  status(syncKey: string): SyncProgress;
}
