// File history: checkpoints of a drawing, stored under <appData>/history/<id>/<timestamp>.json
// where <id> is a hash of the normalised file path. Checkpoints are full scene JSON
// (same format as .excalidraw) so any of them can be opened or restored directly.
import { appDataDir } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";

export interface Checkpoint {
  id: string; // timestamp string, also the file stem
  time: number; // epoch ms
  manual: boolean;
  size: number;
  name?: string;
  pinned?: boolean;
}

interface CheckpointMeta {
  name?: string;
  pinned?: boolean;
}
type MetaFile = Record<string, CheckpointMeta>;

const MAX_CHECKPOINTS = 100;
const MIN_AUTO_INTERVAL_MS = 30_000;

const lastHash = new Map<string, string>(); // dirKey -> hash of last stored content
const lastTime = new Map<string, number>();

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const keyOf = (path: string) => fnv(path.replace(/\\/g, "/").toLowerCase());

async function dirFor(path: string, create: boolean): Promise<string> {
  const dir = `${await appDataDir()}/history/${keyOf(path)}`;
  if (create && !(await exists(dir))) await mkdir(dir, { recursive: true });
  return dir;
}

// Hash only what matters for the drawing, so viewport scroll/zoom changes don't create checkpoints
function contentHash(json: string): string {
  try {
    const s = JSON.parse(json);
    const els = (s.elements ?? []).filter((e: { isDeleted?: boolean }) => !e.isDeleted);
    return fnv(JSON.stringify(els)) + ":" + els.length;
  } catch {
    return fnv(json);
  }
}

async function readMeta(path: string): Promise<MetaFile> {
  try {
    const f = `${await dirFor(path, false)}/meta.json`;
    return (await exists(f)) ? JSON.parse(await readTextFile(f)) : {};
  } catch {
    return {};
  }
}

/** Name and/or pin a checkpoint. Pinned checkpoints are never pruned. */
export async function setCheckpointMeta(path: string, id: string, patch: CheckpointMeta): Promise<void> {
  const dir = await dirFor(path, true);
  const meta = await readMeta(path);
  const next = { ...meta[id], ...patch };
  if (!next.name) delete next.name;
  if (!next.pinned) delete next.pinned;
  if (Object.keys(next).length) meta[id] = next;
  else delete meta[id];
  await writeTextFile(`${dir}/meta.json`, JSON.stringify(meta));
}

export async function listCheckpoints(path: string): Promise<Checkpoint[]> {
  const dir = await dirFor(path, false);
  if (!(await exists(dir))) return [];
  const out: Checkpoint[] = [];
  for (const e of await readDir(dir)) {
    const m = /^(\d+)(m)?\.json$/.exec(e.name);
    if (!m) continue;
    out.push({ id: m[1] + (m[2] ?? ""), time: Number(m[1]), manual: !!m[2], size: 0 });
  }
  const meta = await readMeta(path);
  for (const c of out) Object.assign(c, meta[c.id] ?? {});
  return out.sort((a, b) => b.time - a.time);
}

export async function readCheckpoint(path: string, id: string): Promise<string> {
  return readTextFile(`${await dirFor(path, false)}/${id}.json`);
}

export async function deleteCheckpoint(path: string, id: string): Promise<void> {
  await remove(`${await dirFor(path, false)}/${id}.json`);
  await setCheckpointMeta(path, id, { name: undefined, pinned: false }).catch(() => {});
}

export async function clearHistory(path: string): Promise<void> {
  const dir = await dirFor(path, false);
  if (await exists(dir)) await remove(dir, { recursive: true });
  lastHash.delete(keyOf(path));
}

/**
 * Store `json` as a checkpoint of `path` unless it is identical to the last one.
 * Automatic checkpoints are rate limited; manual ones always go through (if content differs).
 * Returns true when a checkpoint was written.
 */
export async function recordCheckpoint(path: string, json: string, manual = false, name?: string): Promise<boolean> {
  const k = keyOf(path);
  const h = contentHash(json);
  if (!lastHash.has(k)) {
    // first touch this session: compare with the newest stored checkpoint
    const latest = (await listCheckpoints(path))[0];
    if (latest) lastHash.set(k, contentHash(await readCheckpoint(path, latest.id)));
  }
  if (lastHash.get(k) === h) return false;
  const now = Date.now();
  if (!manual && now - (lastTime.get(k) ?? 0) < MIN_AUTO_INTERVAL_MS) return false;

  const dir = await dirFor(path, true);
  await writeTextFile(`${dir}/${now}${manual ? "m" : ""}.json`, json);
  lastHash.set(k, h);
  lastTime.set(k, now);
  if (name) await setCheckpointMeta(path, `${now}${manual ? "m" : ""}`, { name, pinned: true });

  const all = await listCheckpoints(path);
  // prune oldest automatic checkpoints beyond the cap; manual ones are kept
  const autos = all.filter((c) => !c.manual && !c.pinned);
  for (const c of autos.slice(Math.max(0, MAX_CHECKPOINTS - all.filter((x) => x.manual || x.pinned).length))) {
    await remove(`${dir}/${c.id}.json`).catch(() => {});
  }
  return true;
}

/** Called after a file is renamed/moved so its history follows it. */
export async function moveHistory(from: string, to: string): Promise<void> {
  try {
    const src = await dirFor(from, false);
    if (!(await exists(src))) return;
    const dst = await dirFor(to, true);
    for (const e of await readDir(src)) {
      await writeTextFile(`${dst}/${e.name}`, await readTextFile(`${src}/${e.name}`));
    }
    await remove(src, { recursive: true });
    lastHash.delete(keyOf(from));
  } catch (err) {
    console.error("history move failed", err);
  }
}
