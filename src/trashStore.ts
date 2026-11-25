// In-app trash (see src-tauri/src/app_trash.rs). Each slot is <appData>/trash/<slot>/{payload, info.json}.
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";

export interface TrashItem {
  slot: string;
  name: string;
  originalPath: string;
  root: string;
  isDir: boolean;
  deletedAt: number;
}

const trashDir = async () => {
  const d = `${(await appDataDir()).replace(/\\/g, "/").replace(/\/$/, "")}/trash`;
  if (!(await exists(d))) await mkdir(d, { recursive: true });
  return d;
};

export async function moveToTrash(path: string, root: string, name: string, isDir: boolean): Promise<void> {
  const dir = await trashDir();
  const slot = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await invoke("trash_put", { path, workspaceRoot: root, trashDir: dir, slot });
  const info: TrashItem = { slot, name, originalPath: path, root, isDir, deletedAt: Date.now() };
  await writeTextFile(`${dir}/${slot}/info.json`, JSON.stringify(info));
}

export async function listTrash(): Promise<TrashItem[]> {
  const dir = await trashDir();
  const items: TrashItem[] = [];
  for (const e of await readDir(dir)) {
    if (!e.isDirectory) continue;
    try {
      items.push(JSON.parse(await readTextFile(`${dir}/${e.name}/info.json`)));
    } catch {
      /* incomplete slot: ignore */
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function restoreFromTrash(item: TrashItem, root: string): Promise<string> {
  const dir = await trashDir();
  const restored = await invoke<string>("trash_restore", {
    trashDir: dir,
    slot: item.slot,
    dest: item.originalPath,
    workspaceRoot: root,
  });
  await remove(`${dir}/${item.slot}`, { recursive: true }).catch(() => {});
  return restored;
}

export async function purgeTrash(slot?: string): Promise<void> {
  const dir = await trashDir();
  if (slot) return remove(`${dir}/${slot}`, { recursive: true });
  for (const e of await readDir(dir)) await remove(`${dir}/${e.name}`, { recursive: true });
}
