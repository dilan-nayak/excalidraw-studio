// Code to diagram: scan a folder, extract imports, and build a layered dependency graph. No AI involved.
import { readDir, readTextFile } from "@tauri-apps/plugin-fs";

type Sk = Record<string, unknown>;

export interface SourceFile {
  path: string; // relative to root, forward slashes
  ext: string;
  imports: string[];
}
export interface ScanResult {
  root: string;
  files: SourceFile[];
  skipped: number;
  truncated: boolean;
}
export interface GraphOptions {
  granularity: "folders" | "files";
  depth: number; // folder levels when granularity = folders
  includeExternal: boolean;
  maxNodes: number;
}
export interface GNode { id: string; label: string; sub: string; external: boolean; group: string }
export interface GEdge { from: string; to: string; weight: number }
export interface Graph { nodes: GNode[]; edges: GEdge[]; hidden: number }

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "target", "__pycache__", ".venv", "venv", "env", ".next", ".nuxt", "out", "bin", "obj", ".idea", ".vscode", "coverage", ".gradle", ".dart_tool", "Pods", "vendor", "site-packages", ".cache", "release", "debug"]);
const LANG_EXT = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "py", "go", "rs", "java", "kt", "kts", "cs", "c", "cc", "cpp", "h", "hpp", "rb", "php", "dart", "swift"]);
const MAX_FILES = 1500;
const MAX_BYTES = 300_000;
const NODE_BUILTINS = new Set(["fs", "path", "os", "http", "https", "url", "util", "crypto", "stream", "events", "child_process", "zlib", "net", "buffer", "assert", "process", "readline", "querystring", "tls", "dns", "worker_threads"]);

const extOf = (p: string) => (p.split(".").pop() ?? "").toLowerCase();
const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

export function extractImports(ext: string, src: string): string[] {
  const out = new Set<string>();
  const all = (re: RegExp, group = 1) => { for (const m of src.matchAll(re)) if (m[group]) out.add(m[group].trim()); };
  switch (ext) {
    case "ts": case "tsx": case "js": case "jsx": case "mjs": case "cjs": case "vue": case "svelte":
      all(/\bfrom\s+['"]([^'"\n]+)['"]/g);
      all(/\bimport\s+['"]([^'"\n]+)['"]/g);
      all(/\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g);
      all(/\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g);
      break;
    case "py":
      all(/^[ \t]*from\s+(\.*[\w.]*)\s+import\b/gm);
      for (const m of src.matchAll(/^[ \t]*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm)) m[1].split(",").forEach((x) => out.add(x.trim()));
      break;
    case "go": {
      for (const m of src.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) for (const q of m[1].matchAll(/"([^"\n]+)"/g)) out.add(q[1]);
      all(/^\s*import\s+(?:\w+\s+)?"([^"\n]+)"/gm);
      break;
    }
    case "rs":
      all(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm); // -> "mod:x" below
      break;
    case "java": case "kt": case "kts":
      all(/^\s*import\s+(?:static\s+)?([\w.]+)/gm);
      break;
    case "cs":
      all(/^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm);
      break;
    case "c": case "cc": case "cpp": case "h": case "hpp":
      all(/^\s*#\s*include\s*"([^"\n]+)"/gm);
      all(/^\s*#\s*include\s*<([^>\n]+)>/gm, 1);
      break;
    case "rb":
      all(/^\s*require_relative\s+['"]([^'"\n]+)['"]/gm);
      all(/^\s*require\s+['"]([^'"\n]+)['"]/gm);
      break;
    case "php":
      all(/^\s*use\s+([\w\\]+)/gm);
      break;
    case "dart":
      all(/^\s*import\s+['"]([^'"\n]+)['"]/gm);
      break;
    case "swift":
      all(/^\s*import\s+(\w+)/gm);
      break;
  }
  if (ext === "rs") {
    const mods = [...out].map((m) => "mod:" + m);
    out.clear();
    mods.forEach((m) => out.add(m));
    for (const m of src.matchAll(/^\s*use\s+((?:crate|super|self)(?:::\w+)+)/gm)) out.add("use:" + m[1]);
    for (const m of src.matchAll(/^\s*use\s+(\w+)(?:::|;)/gm)) out.add("ext:" + m[1]);
  }
  return [...out];
}

async function walk(root: string, dir: string, out: SourceFile[], state: { skipped: number; truncated: boolean }, onProgress?: (n: number) => void) {
  if (out.length >= MAX_FILES) { state.truncated = true; return; }
  let entries;
  try { entries = await readDir(dir); } catch { return; }
  for (const e of entries) {
    if (out.length >= MAX_FILES) { state.truncated = true; return; }
    const full = `${dir}/${e.name}`;
    if (e.isDirectory) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      await walk(root, full, out, state, onProgress);
    } else if (e.isFile && LANG_EXT.has(extOf(e.name))) {
      try {
        const text = await readTextFile(full);
        if (text.length > MAX_BYTES) { state.skipped++; continue; }
        const rel = full.slice(root.length + 1);
        out.push({ path: rel, ext: extOf(e.name), imports: extractImports(extOf(e.name), text) });
        if (out.length % 25 === 0) onProgress?.(out.length);
      } catch { state.skipped++; }
    }
  }
}

export async function scanFolder(root: string, onProgress?: (n: number) => void): Promise<ScanResult> {
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  const files: SourceFile[] = [];
  const state = { skipped: 0, truncated: false };
  await walk(r, r, files, state, onProgress);
  return { root: r, files, skipped: state.skipped, truncated: state.truncated };
}

// ------------------------------------------------------------------ resolving imports to files
const TRY_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".py", ".rb", ".dart", ".h", ".hpp"];

function normalize(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

export function resolveImport(file: SourceFile, spec: string, set: Map<string, string>, suffixIndex: Map<string, string[]>): string | { external: string } | null {
  const lower = (s: string) => set.get(s.toLowerCase());
  const tryPaths = (base: string): string | null => {
    for (const x of TRY_EXT) { const hit = lower(base + x); if (hit) return hit; }
    for (const x of TRY_EXT.slice(1)) { const hit = lower(`${base}/index${x}`) ?? lower(`${base}/__init__${x}`); if (hit) return hit; }
    return null;
  };
  const fdir = dirOf(file.path);
  const ext = file.ext;

  if (ext === "rs") {
    if (spec.startsWith("mod:")) return lower(`${fdir ? fdir + "/" : ""}${spec.slice(4)}.rs`) ?? lower(`${fdir ? fdir + "/" : ""}${spec.slice(4)}/mod.rs`) ?? null;
    if (spec.startsWith("ext:")) { const n = spec.slice(4); return ["crate", "self", "super", "std", "core", "alloc"].includes(n) ? null : { external: n }; }
    if (spec.startsWith("use:")) {
      const segs = spec.slice(4).split("::");
      const rootSrc = file.path.includes("src/") ? file.path.slice(0, file.path.indexOf("src/") + 4) : "";
      let base: string[];
      if (segs[0] === "crate") base = (rootSrc + segs.slice(1).join("/")).split("/");
      else if (segs[0] === "super") base = [...fdir.split("/").slice(0, -1), ...segs.slice(1)];
      else base = [...fdir.split("/"), ...segs.slice(1)];
      for (let n = base.length; n > 0; n--) {
        const p = normalize(base.slice(0, n));
        const hit = lower(p + ".rs") ?? lower(p + "/mod.rs");
        if (hit) return hit;
      }
    }
    return null;
  }

  if (ext === "py") {
    if (spec.startsWith(".")) {
      const dots = spec.match(/^\.+/)![0].length;
      const rest = spec.slice(dots).split(".").filter(Boolean);
      const up = fdir.split("/").filter(Boolean);
      const base = up.slice(0, Math.max(0, up.length - (dots - 1))).concat(rest);
      return tryPaths(normalize(base));
    }
    const segs = spec.split(".");
    for (const prefix of ["", "src/"]) for (let n = segs.length; n > 0; n--) { const hit = tryPaths(prefix + segs.slice(0, n).join("/")); if (hit) return hit; }
    return { external: segs[0] };
  }

  if (ext === "go") {
    const parts = spec.split("/");
    for (let n = parts.length; n > 0; n--) {
      const tail = parts.slice(parts.length - n).join("/").toLowerCase();
      const dirs = suffixIndex.get(tail);
      if (dirs?.length) return dirs[0] + "/"; // package directory marker
    }
    return { external: parts.slice(0, 3).join("/") };
  }

  if (ext === "java" || ext === "kt" || ext === "kts" || ext === "cs" || ext === "php") {
    const sep = ext === "php" ? "\\" : ".";
    const parts = spec.split(sep);
    for (let n = parts.length; n > 0; n--) {
      const tail = parts.slice(0, n).join("/").toLowerCase();
      for (const e of ["java", "kt", "cs", "php"]) {
        const dirs = suffixIndex.get(tail + "." + e);
        if (dirs?.length) return dirs[0];
      }
    }
    return { external: parts.slice(0, 2).join(".") };
  }

  if (["c", "cc", "cpp", "h", "hpp"].includes(ext)) {
    for (const base of [fdir ? `${fdir}/${spec}` : spec, spec, `include/${spec}`, `src/${spec}`]) { const hit = lower(normalize(base.split("/"))); if (hit) return hit; }
    return null; // system / unknown headers are not interesting
  }

  // JS/TS/Ruby/Dart/Swift/etc.
  if (spec.startsWith(".")) return tryPaths(normalize([...fdir.split("/"), ...spec.split("/")]));
  if (ext === "rb" || ext === "dart") {
    const clean = spec.replace(/^package:[^/]+\//, "");
    const hit = tryPaths(normalize([...fdir.split("/"), ...clean.split("/")])) ?? tryPaths(clean) ?? tryPaths("lib/" + clean);
    if (hit) return hit;
    return null;
  }
  if (spec.startsWith("@/") || spec.startsWith("~/")) return tryPaths("src/" + spec.slice(2)) ?? tryPaths(spec.slice(2)) ?? null;
  const direct = tryPaths(spec) ?? tryPaths("src/" + spec);
  if (direct) return direct;
  if (spec.startsWith("node:")) return null;
  const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  return NODE_BUILTINS.has(name) ? null : { external: name };
}

// ------------------------------------------------------------------ graph
export function buildGraph(scan: ScanResult, opt: GraphOptions): Graph {
  const set = new Map(scan.files.map((f) => [f.path.toLowerCase(), f.path]));
  const suffixIndex = new Map<string, string[]>();
  const add = (k: string, v: string) => { const l = suffixIndex.get(k) ?? []; l.push(v); suffixIndex.set(k, l); };
  for (const f of scan.files) {
    // directory suffixes (for Go packages) and file-path suffixes (for Java/C#/PHP)
    const parts = f.path.split("/");
    const dparts = parts.slice(0, -1);
    for (let i = 0; i < dparts.length; i++) add(dparts.slice(i).join("/").toLowerCase(), dparts.join("/"));
    const noExt = f.path.replace(/\.\w+$/, "");
    const e = f.ext;
    const np = noExt.split("/");
    for (let i = 0; i < np.length; i++) add(np.slice(i).join("/").toLowerCase() + "." + e, f.path);
  }
  const dirFiles = new Map<string, string[]>();
  for (const f of scan.files) { const d = dirOf(f.path); const l = dirFiles.get(d) ?? []; l.push(f.path); dirFiles.set(d, l); }

  const keyOf = (path: string) => {
    if (opt.granularity === "files") return path;
    const d = dirOf(path).split("/").filter(Boolean);
    return d.length ? d.slice(0, opt.depth).join("/") : "(root)";
  };

  const counts = new Map<string, number>();
  const edgeMap = new Map<string, number>();
  const extUse = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
  for (const f of scan.files) bump(counts, keyOf(f.path));

  for (const f of scan.files) {
    const from = keyOf(f.path);
    for (const spec of f.imports) {
      const r = resolveImport(f, spec, set, suffixIndex);
      if (!r) continue;
      if (typeof r === "object") { if (opt.includeExternal) { bump(extUse, r.external); bump(edgeMap, `${from}\u0000ext:${r.external}`); } continue; }
      let targets: string[];
      if (r.endsWith("/")) targets = (dirFiles.get(r.slice(0, -1)) ?? []).slice(0, 1);
      else targets = [r];
      for (const t of targets) {
        const to = keyOf(t);
        if (to !== from) bump(edgeMap, `${from}\u0000${to}`);
      }
    }
  }

  // degree for truncation
  const degree = new Map<string, number>();
  for (const [k, w] of edgeMap) { const [a, b] = k.split("\u0000"); bump(degree, a, w); bump(degree, b, w); }
  let internal = [...counts.keys()];
  let hidden = 0;
  if (internal.length > opt.maxNodes) {
    internal = internal.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0)).slice(0, opt.maxNodes);
    hidden = counts.size - internal.length;
  }
  const keep = new Set(internal);
  const topExt = new Set([...extUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => "ext:" + k));

  const nodes: GNode[] = internal.map((k) => ({
    id: k,
    label: opt.granularity === "files" ? k.split("/").pop()! : k,
    sub: opt.granularity === "files" ? dirOf(k) || "(root)" : `${counts.get(k)} file${counts.get(k) === 1 ? "" : "s"}`,
    external: false,
    // colour by top-level folder; files directly in the root share one colour
    group: opt.granularity === "files" ? dirOf(k).split("/")[0] || "(root)" : k.split("/")[0],
  }));
  for (const e of topExt) nodes.push({ id: e, label: e.slice(4), sub: "external", external: true, group: "ext" });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: GEdge[] = [];
  for (const [k, weight] of edgeMap) {
    const [from, to] = k.split("\u0000");
    if (nodeIds.has(from) && nodeIds.has(to) && (keep.has(from) || from.startsWith("ext:")) ) edges.push({ from, to, weight });
  }
  edges.sort((a, b) => b.weight - a.weight);
  return { nodes, edges: edges.slice(0, 250), hidden };
}

// ------------------------------------------------------------------ layered layout -> skeletons
export function graphToSkeletons(g: Graph): Sk[] {
  const out = new Map<string, string[]>();
  const ids = g.nodes.map((n) => n.id);
  ids.forEach((i) => out.set(i, []));
  g.edges.forEach((e) => out.get(e.from)?.push(e.to));

  // break cycles with DFS back-edge removal, then longest-path layering (importer left, dependency right)
  const color = new Map<string, number>();
  const dag = new Map<string, string[]>(ids.map((i) => [i, []]));
  const dfs = (u: string) => {
    color.set(u, 1);
    for (const v of out.get(u) ?? []) {
      if (color.get(v) === 1) continue; // back edge
      dag.get(u)!.push(v);
      if (!color.get(v)) dfs(v);
    }
    color.set(u, 2);
  };
  const indeg = new Map<string, number>(ids.map((i) => [i, 0]));
  g.edges.forEach((e) => indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1));
  [...ids].sort((a, b) => (indeg.get(a)! - indeg.get(b)!)).forEach((i) => { if (!color.get(i)) dfs(i); });

  const layer = new Map<string, number>(ids.map((i) => [i, 0]));
  const memo = new Map<string, number>();
  const longest = (u: string): number => {
    if (memo.has(u)) return memo.get(u)!;
    memo.set(u, 0);
    let best = 0;
    for (const v of dag.get(u) ?? []) best = Math.max(best, 1 + longest(v));
    memo.set(u, best);
    return best;
  };
  const height = new Map(ids.map((i) => [i, longest(i)]));
  const maxH = Math.max(0, ...height.values());
  ids.forEach((i) => layer.set(i, maxH - height.get(i)!));

  const cols: string[][] = [];
  ids.forEach((i) => (cols[layer.get(i)!] ??= []).push(i));
  // barycenter ordering passes
  const posIn = new Map<string, number>();
  cols.forEach((c) => c?.forEach((id, i) => posIn.set(id, i)));
  const neighbors = new Map<string, string[]>(ids.map((i) => [i, []]));
  g.edges.forEach((e) => { neighbors.get(e.from)?.push(e.to); neighbors.get(e.to)?.push(e.from); });
  for (let pass = 0; pass < 4; pass++) {
    cols.forEach((c) => {
      if (!c) return;
      const bary = (id: string) => { const ns = neighbors.get(id)!; return ns.length ? ns.reduce((s, n) => s + (posIn.get(n) ?? 0), 0) / ns.length : posIn.get(id)!; };
      c.sort((a, b) => bary(a) - bary(b));
      c.forEach((id, i) => posIn.set(id, i));
    });
  }

  const W = 200, H = 58, GX = 120, GY = 36;
  const palette = ["#a5d8ff", "#b2f2bb", "#ffec99", "#d0bfff", "#ffd8a8", "#96f2d7", "#eebefa", "#ffc9c9"];
  const groups = [...new Set(g.nodes.filter((n) => !n.external).map((n) => n.group))];
  const sk: Sk[] = [];
  const geo = new Map<string, { x: number; y: number }>();
  const tallest = Math.max(1, ...cols.map((c) => c?.length ?? 0));
  cols.forEach((c, ci) => {
    if (!c) return;
    const offset = ((tallest - c.length) * (H + GY)) / 2;
    c.forEach((id, ri) => geo.set(id, { x: ci * (W + GX), y: offset + ri * (H + GY) }));
  });
  for (const n of g.nodes) {
    const p = geo.get(n.id)!;
    sk.push({
      type: "rectangle", id: "cg_" + n.id, x: p.x, y: p.y, width: W, height: H, roundness: { type: 3 },
      backgroundColor: n.external ? "#e9ecef" : palette[groups.indexOf(n.group) % palette.length], fillStyle: "solid",
      strokeColor: n.external ? "#868e96" : "#1e1e1e", strokeStyle: n.external ? "dashed" : "solid",
      label: { text: `${n.label}\n${n.sub}`, fontSize: 14 },
    });
  }
  const maxW = Math.max(1, ...g.edges.map((e) => e.weight));
  for (const e of g.edges) {
    const a = geo.get(e.from)!, b = geo.get(e.to)!;
    const sx = a.x + W, sy = a.y + H / 2, ex = b.x, ey = b.y + H / 2;
    const back = ex < sx;
    sk.push({
      type: "arrow", x: back ? a.x : sx, y: back ? a.y + H / 2 : sy,
      points: [[0, 0], [back ? b.x + W - a.x : ex - sx, ey - (back ? a.y + H / 2 : sy)]],
      start: { id: "cg_" + e.from }, end: { id: "cg_" + e.to },
      strokeColor: "#868e96", strokeWidth: 1 + Math.round((e.weight / maxW) * 2),
      ...(e.weight > 1 ? { label: { text: String(e.weight), fontSize: 12 } } : {}),
    });
  }
  return sk;
}
