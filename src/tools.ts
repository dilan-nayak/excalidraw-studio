// Canvas/file tools shared by the in-app AI chat and the MCP server.
// Each tool has a JSON-schema (used for LLM tool-calling and MCP tools/list) and an executor.
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg,
  loadFromBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { newElementWith } from "@excalidraw/excalidraw";
import { describeScene } from "./aiEdit";
import { describeJson, describeMarkdown } from "./describe";
import { listCheckpoints, readCheckpoint, recordCheckpoint } from "./history";
import { repairFlowchart, stripBreaks, stripFences } from "./mermaid";

export interface ToolHost {
  api(): ExcalidrawImperativeAPI | null;
  currentFile(): string | null;
  listFiles(): Promise<{ name: string; path: string }[]>;
  openFile(path: string): Promise<void>;
  saveFile(): Promise<void>;
  /** called after the scene changed outside the user's own editing (history restore) */
  markDirty(): void;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ToolResult = {
  text: string;
  /** optional PNG (base64) so vision-capable clients/models can look at the canvas */
  imageBase64?: string;
  isError?: boolean;
};

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const TOOLS: ToolDef[] = [
  {
    name: "get_canvas",
    description:
      "Describe the current drawing as compact JSON: shapes {id,type,x,y,w,h,text,bg,stroke} and arrows {id,from,to,text}. " +
      "Uses the current selection if there is one, otherwise the whole canvas. Call this before editing.",
    inputSchema: obj({ full: { type: "boolean", description: "Return raw Excalidraw element JSON instead of the compact form" } }),
  },
  {
    name: "describe_diagram",
    description:
      "Explain the current drawing as structured text: shapes with labels, connections (A -> B with labels), frames, groups, free text, entry/end points and flow direction. Best first call to understand a diagram. format: markdown (default) or json.",
    inputSchema: obj({ format: { type: "string", enum: ["markdown", "json"] } }),
  },
  {
    name: "add_elements",
    description:
      "Add elements using Excalidraw's element skeleton format (https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton). " +
      "Example: {type:'rectangle',x:0,y:0,width:160,height:60,label:{text:'Hi'},backgroundColor:'#a5d8ff'}; arrows may use start/end {id} to bind to elements by id. " +
      "Returns the ids created. Keep >=60px between connected shapes.",
    inputSchema: obj({ elements: { type: "array", items: { type: "object" } } }, ["elements"]),
  },
  {
    name: "create_from_mermaid",
    description: "Convert a Mermaid flowchart/sequence/class diagram into editable elements and add it to the canvas.",
    inputSchema: obj({ mermaid: { type: "string" } }, ["mermaid"]),
  },
  {
    name: "update_elements",
    description:
      "Patch existing elements by id. Each item is {id, ...props} e.g. x, y, width, height, backgroundColor, strokeColor, text (for text elements).",
    inputSchema: obj({ updates: { type: "array", items: { type: "object" } } }, ["updates"]),
  },
  {
    name: "delete_elements",
    description: "Delete elements by id.",
    inputSchema: obj({ ids: { type: "array", items: { type: "string" } } }, ["ids"]),
  },
  {
    name: "clear_canvas",
    description: "Remove every element from the canvas (a history checkpoint is saved first).",
    inputSchema: obj({}),
  },
  {
    name: "read_canvas_image",
    description: "Render the canvas (or the selection) to a PNG image so you can look at it.",
    inputSchema: obj({}),
  },
  {
    name: "export_svg",
    description: "Export the canvas as an SVG string.",
    inputSchema: obj({}),
  },
  {
    name: "list_files",
    description: "List the .excalidraw files in the user's workspace folders, and which one is currently open.",
    inputSchema: obj({}),
  },
  {
    name: "open_file",
    description: "Open a .excalidraw file from the workspace (path as returned by list_files). Unsaved changes in the current file are saved first.",
    inputSchema: obj({ path: { type: "string" } }, ["path"]),
  },
  {
    name: "save_file",
    description: "Save the current drawing to its file.",
    inputSchema: obj({}),
  },
  {
    name: "query_file_history",
    description: "List history checkpoints (newest first) of the current file.",
    inputSchema: obj({}),
  },
  {
    name: "restore_file_history",
    description:
      "Restore the current file to a checkpoint id from query_file_history. The present state is stored as a checkpoint first, so this is reversible.",
    inputSchema: obj({ id: { type: "string" } }, ["id"]),
  },
  {
    name: "create_checkpoint",
    description: "Save a named-by-time history checkpoint of the current drawing right now.",
    inputSchema: obj({}),
  },
];

const live = (els: readonly ExcalidrawElement[]) => els.filter((e) => !e.isDeleted);

function commit(api: ExcalidrawImperativeAPI, elements: ExcalidrawElement[]) {
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

async function pngBase64(api: ExcalidrawImperativeAPI, onlySelected: boolean): Promise<string | null> {
  const all = live(api.getSceneElements());
  const sel = api.getAppState().selectedElementIds;
  const els = onlySelected && Object.keys(sel).length ? all.filter((e) => sel[e.id]) : all;
  if (!els.length) return null;
  const blob = await exportToBlob({
    elements: els,
    files: api.getFiles(),
    appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
    mimeType: "image/png",
    getDimensions: (w: number, h: number) => {
      const s = Math.min(1, 1400 / Math.max(w, h));
      return { width: w * s, height: h * s, scale: s };
    },
  });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function runTool(host: ToolHost, name: string, args: Record<string, any> = {}): Promise<ToolResult> {
  const ok = (text: string): ToolResult => ({ text });
  const fail = (text: string): ToolResult => ({ text, isError: true });
  const api = host.api();
  if (!api) return fail("The editor is not ready yet.");
  try {
    switch (name) {
      case "get_canvas": {
        const all = api.getSceneElements();
        if (args.full) return ok(JSON.stringify(live(all)));
        const d = describeScene(all, api.getAppState().selectedElementIds);
        return ok(d.count ? d.json : "The canvas is empty.");
      }
      case "describe_diagram": {
        const all = api.getSceneElements();
        const title = host.currentFile()?.split(/[\\/]/).pop()?.replace(/\.excalidraw$/, "");
        return ok(args.format === "json" ? describeJson(all) : describeMarkdown(all, title));
      }
      case "add_elements": {
        if (!Array.isArray(args.elements) || !args.elements.length) return fail("elements must be a non-empty array");
        const created = convertToExcalidrawElements(args.elements, { regenerateIds: false }) as ExcalidrawElement[];
        commit(api, [...api.getSceneElements(), ...created]);
        api.scrollToContent(created, { fitToViewport: true, animate: true });
        return ok(`Added ${created.length} element(s). ids: ${created.map((e) => e.id).join(", ")}`);
      }
      case "create_from_mermaid": {
        const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
        const src = repairFlowchart(stripBreaks(stripFences(String(args.mermaid ?? ""))));
        const { elements, files } = await parseMermaidToExcalidraw(src);
        const created = convertToExcalidrawElements(elements, { regenerateIds: true }) as ExcalidrawElement[];
        if (files) api.addFiles(Object.values(files) as any);
        commit(api, [...api.getSceneElements(), ...created]);
        api.scrollToContent(created, { fitToViewport: true, animate: true });
        return ok(`Added ${created.length} element(s) from Mermaid.`);
      }
      case "update_elements": {
        const ups: any[] = Array.isArray(args.updates) ? args.updates : [];
        const byId = new Map(ups.map((u) => [u.id, u]));
        let n = 0;
        const next = api.getSceneElements().map((e) => {
          const u = byId.get(e.id);
          if (!u) return e;
          n++;
          const { id: _id, type: _t, ...patch } = u;
          return newElementWith(e, patch);
        });
        commit(api, next as ExcalidrawElement[]);
        return n ? ok(`Updated ${n} element(s).`) : fail("No element matched the given ids.");
      }
      case "delete_elements": {
        const ids = new Set<string>(args.ids ?? []);
        let n = 0;
        const next = api.getSceneElements().map((e) => {
          // also drop text bound to a deleted container
          const gone = ids.has(e.id) || (e.type === "text" && e.containerId && ids.has(e.containerId));
          if (!gone || e.isDeleted) return e;
          n++;
          return newElementWith(e, { isDeleted: true });
        });
        commit(api, next as ExcalidrawElement[]);
        return n ? ok(`Deleted ${n} element(s).`) : fail("No element matched the given ids.");
      }
      case "clear_canvas": {
        const file = host.currentFile();
        if (file)
          await recordCheckpoint(
            file,
            serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local"),
            true
          );
        commit(
          api,
          api.getSceneElements().map((e) => (e.isDeleted ? e : newElementWith(e, { isDeleted: true }))) as ExcalidrawElement[]
        );
        return ok("Canvas cleared.");
      }
      case "read_canvas_image": {
        const b64 = await pngBase64(api, true);
        return b64 ? { text: "Canvas image attached.", imageBase64: b64 } : ok("The canvas is empty.");
      }
      case "export_svg": {
        const els = live(api.getSceneElements());
        if (!els.length) return ok("The canvas is empty.");
        const svg = await exportToSvg({ elements: els, files: api.getFiles(), appState: { ...api.getAppState(), exportBackground: true } });
        return ok(svg.outerHTML);
      }
      case "list_files": {
        const files = await host.listFiles();
        return ok(JSON.stringify({ current: host.currentFile(), files }));
      }
      case "open_file": {
        const files = await host.listFiles();
        const p = String(args.path ?? "").replace(/\\/g, "/");
        const hit = files.find((f) => f.path.replace(/\\/g, "/") === p);
        if (!hit) return fail("Unknown file. Use a path from list_files.");
        await host.openFile(hit.path);
        return ok(`Opened ${hit.name}.`);
      }
      case "save_file": {
        if (!host.currentFile()) return fail("The drawing has no file yet. Ask the user to Save As first.");
        await host.saveFile();
        return ok("Saved.");
      }
      case "query_file_history": {
        const f = host.currentFile();
        if (!f) return fail("The current drawing has no file, so it has no history.");
        const list = await listCheckpoints(f);
        return ok(JSON.stringify(list.map((c) => ({ id: c.id, time: new Date(c.time).toISOString(), manual: c.manual }))));
      }
      case "restore_file_history": {
        const f = host.currentFile();
        if (!f) return fail("The current drawing has no file, so it has no history.");
        const json = await readCheckpoint(f, String(args.id));
        await recordCheckpoint(f, serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local"), true);
        const scene = await loadFromBlob(new Blob([json], { type: "application/json" }), api.getAppState(), null);
        api.updateScene({ ...scene, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
        if (scene.files) api.addFiles(Object.values(scene.files));
        host.markDirty();
        return ok("Restored. The previous state was saved as a checkpoint.");
      }
      case "create_checkpoint": {
        const f = host.currentFile();
        if (!f) return fail("The current drawing has no file yet.");
        const made = await recordCheckpoint(f, serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local"), true);
        return ok(made ? "Checkpoint saved." : "Nothing changed since the last checkpoint.");
      }
      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return fail(`${name} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
