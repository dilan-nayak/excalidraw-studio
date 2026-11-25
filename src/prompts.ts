// Ready-made prompts for AI clients connected over MCP. They are (a) shown in the app with one-click copy and
// (b) served to MCP clients through prompts/list + prompts/get, so Claude Desktop & co. list them natively.
export interface PromptDef {
  name: string;
  title: string;
  description: string;
  arguments?: { name: string; description: string; required?: boolean }[];
  text: string; // {{arg}} placeholders
}

export const PROMPTS: PromptDef[] = [
  {
    name: "explain-diagram",
    title: "Explain this diagram",
    description: "Describe what the open drawing shows, its flow and anything unclear.",
    text: "Call describe_diagram, then explain in plain language what this diagram shows: the main parts, how they connect, and the overall flow. Point out anything that looks unclear, unlabeled or inconsistent.",
  },
  {
    name: "draw-architecture",
    title: "Draw an architecture diagram",
    description: "Create a system architecture from a short description.",
    arguments: [{ name: "system", description: "What system to draw, e.g. 'web shop with API, DB and queue'", required: true }],
    text: "Draw an architecture diagram of: {{system}}. Call get_canvas first so you do not overlap existing content. Prefer create_from_mermaid (flowchart LR) for the structure, then call read_canvas_image and fix any layout problems with update_elements. Use short labels.",
  },
];

export const claudeDesktopConfig = (url: string) =>
  JSON.stringify({ mcpServers: { "excalidraw-studio": { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2);

export const claudeCodeCommand = (url: string) => `claude mcp add --transport http excalidraw-studio ${url}`;

export const genericHttpConfig = (url: string) =>
  JSON.stringify({ mcpServers: { "excalidraw-studio": { type: "http", url } } }, null, 2);

export function fillPrompt(p: PromptDef, values: Record<string, string>): string {
  return p.text.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? `<${k}>`);
}
