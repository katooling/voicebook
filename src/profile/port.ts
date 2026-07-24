import type { Material } from "../contracts.ts";

export type ProfileCoreMessage = {
  id: string;
  text: string;
  materials: Material[];
  pinned: boolean;
  acceptedAt: string;
};

export type ProfilePreparation = {
  coreRevision: string;
  coreMessages: ProfileCoreMessage[];
};

export type ActiveVoiceProfile = {
  text: string;
  basisRevision: string;
  createdAt: string;
};

export type ProfileStatus = {
  status: "missing" | "current" | "stale";
  coreRevision: string;
  activeProfile: ActiveVoiceProfile | null;
};

export class CoreChangedError extends Error {
  readonly code = "CORE_CHANGED";

  constructor() {
    super("Voice Core changed before the Voice Profile was submitted.");
    this.name = "CoreChangedError";
  }
}

export interface ProfileApplication {
  prepare(): ProfilePreparation;
  status(): ProfileStatus;
  submit(basisRevision: string, text: string): ProfileStatus;
}
