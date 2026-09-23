// Process-wide in-memory "database" for demo mode. It lives on globalThis so
// it survives Next's dev-server module reloads and is shared by every
// request the server process handles. Restarting the server (or pressing
// "Reset demo data" in the app) re-seeds it from scratch.

import { randomUUID } from "crypto";
import { buildSeed } from "./seed";

export type Row = Record<string, unknown>;

export interface DemoStore {
  tables: Record<string, Row[]>;
  seq: number;
  version: number;
  seededAt: string;
}

const KEY = "__midasDemoStore";

export function getStore(): DemoStore {
  const g = globalThis as unknown as Record<string, DemoStore | undefined>;
  if (!g[KEY]) g[KEY] = buildSeed();
  return g[KEY]!;
}

export function resetStore(): DemoStore {
  const g = globalThis as unknown as Record<string, DemoStore | undefined>;
  g[KEY] = buildSeed();
  return g[KEY]!;
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
