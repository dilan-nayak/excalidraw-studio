// Per-file metadata (favorites, tags, color labels), stored in <appData>/filemeta.json keyed by normalised path.
import { BaseDirectory, exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export interface FileMeta {
  fav?: boolean;
  tags?: string[];
  color?: string; // css color
}
export type MetaMap = Record<string, FileMeta>;

const FILE = "filemeta.json";
export const LABEL_COLORS = ["#e03131", "#f08c00", "#f2c500", "#2f9e44", "#1971c2", "#6741d9", "#c2255c", "#868e96"];

export const metaKey = (p: string) => p.replace(/\\/g, "/").toLowerCase();

export async function loadMeta(): Promise<MetaMap> {
  try {
    if (!(await exists(FILE, { baseDir: BaseDirectory.AppData }))) return {};
    return JSON.parse(await readTextFile(FILE, { baseDir: BaseDirectory.AppData }));
  } catch {
    return {};
  }
}

let queue: Promise<void> = Promise.resolve();
export function saveMeta(map: MetaMap): Promise<void> {
  const snapshot = JSON.stringify(map);
  queue = queue.then(() => writeTextFile(FILE, snapshot, { baseDir: BaseDirectory.AppData })).catch((e) => console.error("meta save failed", e));
  return queue;
}

/** Return a copy of `map` with `patch` merged for `path`; empty entries are dropped. */
export function patchMeta(map: MetaMap, path: string, patch: Partial<FileMeta>): MetaMap {
  const k = metaKey(path);
  const merged: FileMeta = { ...map[k], ...patch };
  if (!merged.fav) delete merged.fav;
  if (!merged.tags?.length) delete merged.tags;
  if (!merged.color) delete merged.color;
  const next = { ...map };
  if (Object.keys(merged).length) next[k] = merged;
  else delete next[k];
  return next;
}

/** Re-key entries after a rename/move (file or folder prefix). */
export function remapMeta(map: MetaMap, from: string, to: string): MetaMap {
  const f = metaKey(from);
  const t = to.replace(/\\/g, "/");
  const next: MetaMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (k === f) next[metaKey(t)] = v;
    else if (k.startsWith(f + "/")) next[metaKey(t) + k.slice(f.length)] = v;
    else next[k] = v;
  }
  return next;
}
