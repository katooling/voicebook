export type ExportMaterial = {
  ordinal: number;
  kind: string;
  role: string;
  label?: string;
  url?: string;
};

export type ExportCoreMessage = {
  text: string;
  tags: string[];
  pinned: boolean;
  materials: ExportMaterial[];
};

export type PrivateBackup = {
  profile: string;
  coreMessages: ExportCoreMessage[];
};

export interface ExportApplication {
  privateBackup(): PrivateBackup;
}
