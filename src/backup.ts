// Auto-backup: mirrors saved drawings into a user-chosen folder (OneDrive, Dropbox, external drive...).
// Layout: <backupDir>/<workspace folder name>/<relative path>; files outside any workspace go to <backupDir>/_other/.
import { exists, mkdir, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const norm = (p: string) => p.replace(/\\/g, "/");
const parent = (p: string) => norm(p).replace(/\/[^/]*$/, "");
const base = (p: string) => norm(p).split("/").pop() ?? p;

export function backupTarget(backupDir: string, roots: string[], file: string): string {
  const f = norm(file);
  const root = roots.map(norm).find((r) => f.toLowerCase().startsWith(r.toLowerCase() + "/"));
  const out = norm(backupDir).replace(/\/$/, "");
  return root ? `${out}/${base(root)}${f.slice(root.length)}` : `${out}/_other/${base(f)}`;
}

/** Copy one drawing. Throws on failure so the caller can surface it. */
export async function backupFile(backupDir: string, roots: string[], file: string, content?: string): Promise<string> {
  const target = backupTarget(backupDir, roots, file);
  const dir = parent(target);
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  await writeTextFile(target, content ?? (await readTextFile(file)));
  return target;
}

async function walk(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 8) return;
  for (const e of await readDir(dir)) {
    const p = `${norm(dir)}/${e.name}`;
    if (e.isDirectory && !e.name.startsWith(".")) await walk(p, out, depth + 1);
    else if (e.isFile && e.name.endsWith(".excalidraw")) out.push(p);
  }
}

/** Mirror every drawing in the given workspace roots. Returns how many files were copied. */
export async function backupAll(backupDir: string, roots: string[]): Promise<number> {
  let n = 0;
  for (const r of roots) {
    const files: string[] = [];
    await walk(r, files);
    for (const f of files) {
      await backupFile(backupDir, roots, f);
      n++;
    }
  }
  return n;
}
