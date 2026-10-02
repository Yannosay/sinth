import { SinthUIManifest } from "./sinthui";

export interface BuiltinManifest {
  css?: string;
  js?: string;
}

export const BUILTIN_REGISTRY: Record<string, BuiltinManifest> = {
  SinthUI: SinthUIManifest,
};

export function resolveBuiltinImport(name: string): BuiltinManifest | undefined {
  return BUILTIN_REGISTRY[name];
}