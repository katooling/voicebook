import type { Material } from "../contracts.ts";

export type CoreMessage = {
  id: string;
  text: string;
  materials: Material[];
  pinned: boolean;
  acceptedAt: string;
};

export interface CoreApplication {
  search(query?: string): CoreMessage[];
  pin(coreMessageId: string): void;
  remove(coreMessageId: string): void;
}
