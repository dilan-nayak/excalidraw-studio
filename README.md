# Excalidraw Studio

**A free, open-source Windows desktop app for [Excalidraw](https://excalidraw.com/) whiteboards, with real files and folders, automatic version history, and built-in AI/MCP support.**

Excalidraw Studio gives you the Excalidraw drawing editor as a proper desktop program: your drawings are plain `.excalidraw` files in folders you choose, every save is kept in a version history, and AI tools such as **Claude Code** and **Claude Desktop** can draw on your canvas for you. It works fully offline and is light on memory.

> Unofficial community project. Not affiliated with or endorsed by the Excalidraw team. See [Credits](#credits).

---

## Why this exists

Excalidraw is a great whiteboard, but in a browser tab you can't keep a folder of drawings, you lose history when you close the tab, and AI tools can't reach the canvas. On macOS there is a polished native app called [ExcalidrawZ](https://github.com/chocoford/ExcalidrawZ); there was no equivalent for Windows. This project fills that gap:

- **Your files stay yours.** Plain `.excalidraw` files in normal folders. No account, no cloud.
- **Never lose work.** Autosave plus a version history for every file, a trash bin, and an optional backup folder.
- **AI can draw for you.** Connect Claude Code, Claude Desktop (or any MCP app) and say "draw a login flow"; the shapes appear live.
- **Works offline and stays light.** Fonts and assets are bundled; the app uses the Windows WebView2 runtime instead of shipping a whole browser.

## Just want to use it? (most people)

You do **not** need to install any developer tools. Just download and run the installer.

1. Open the **[latest release](https://github.com/dilan-nayak/excalidraw-studio/releases/latest)** and, under **Assets**, click `ExcalidrawStudio_x.y.z_x64-setup.exe` to download it.
2. Double-click the file to install it.
   - If Windows says **"Windows protected your PC"**, click **More info**, then **Run anyway**. This warning only appears because the installer is not code-signed yet.
3. Open **Excalidraw Studio** from the Start menu. That is it. It works offline.

Needs Windows 10 or 11 (64-bit). Nothing else to install: the required WebView2 component is already part of Windows and is added automatically if missing.

**Optional, only if you want the AI features:** Claude Desktop needs [Node.js](https://nodejs.org) installed; Claude Code needs Claude Code itself; the built-in chat needs your own API key or Ollama. Drawing, saving and history need none of these. See [AI and MCP](#ai-and-mcp).

> Developers who want to change the code: see [For developers](#for-developers-build-from-source) at the bottom.

## What you can do

### Files and folders
- Add one or more folders to the **Workspace** sidebar; nested folders, create / rename / drag-and-drop move.
- `Ctrl+S` to save, optional **Autosave** toggle in the title bar, Open Recent, session restore.
- Right-click a file: favorites, color labels, tags (search with `#tag`), save as SVG/PNG (the drawing stays embedded so the image reopens as an editable diagram), delete.
- Drag a file onto the canvas to create a card that links to it.

### Safety net
- **File history**: every save becomes a version. Preview, restore, give versions names, pin the ones you want to keep forever.
- **Trash**: deleting moves a file to the app's trash; restore it from the menu.
- **Auto-backup**: choose a folder (OneDrive, Dropbox, a USB drive) and every save is mirrored there.

### Drawing helpers
- **Stencils**: 28 ready-made offline icons (database, server, user, cloud, queue...).
- **Sketch to clean**: draw a rough rectangle, circle or arrow with the pencil and clean it up (or turn on auto-clean).
- **Color palettes, layers panel** (hide, lock, reorder) and **grid / snapping**.
- **Slides**: draw frames and press `F5` to present them; `F8` for distraction-free focus mode.
- **Diagram from text** (no AI needed): paste Mermaid code or a simple indented outline and get an editable diagram.
- **Code to diagram** (no AI needed): pick a project folder and the app draws which files / folders import which, for JS/TS, Python, Go, Rust, Java/Kotlin, C#, C/C++, Ruby, PHP, Dart and Swift.
- **Copy diagram description**: puts a plain-text summary of the drawing (shapes, connections, flow) on your clipboard to paste into any AI chat.

### AI and MCP
Excalidraw Studio contains a small **MCP server** (Model Context Protocol) that lets AI apps read and edit the drawing that is open. There are three ways to use AI, and you only need one:

| Way | Needs | Where you type |
|---|---|---|
| **Claude Code** | Claude Code installed | in Claude Code |
| **Claude Desktop** | Claude Desktop + Node.js | in Claude Desktop |
| **Built-in chat** | your own API key (Claude) or a local Ollama model | in the app's AI panel |

The AI panel (top-right sparkle button) has a tab for each, with step-by-step instructions, copy buttons and a demo prompt. The panel can be dragged wider from its left edge.

**How it works:** you type in the AI app, that app calls Excalidraw Studio's tools, and shapes appear on your canvas. *Type your request in Claude Code or Claude Desktop, not in the app's own chat box* (that box is only for the built-in chat with an API key).

#### Connect Claude Code
1. In Excalidraw Studio: AI panel → **Claude Code** tab → switch **Connection** on.
2. In a terminal, run once:
   ```powershell
   claude mcp add --transport http excalidraw-studio http://127.0.0.1:7421/mcp
   ```
   (No `claude` command? Put the same server in a `.mcp.json` file in your project: `{"mcpServers":{"excalidraw-studio":{"type":"http","url":"http://127.0.0.1:7421/mcp"}}}`.)
3. Start a **new** Claude Code session, run `/mcp` and check `excalidraw-studio` is connected.
4. Ask: *"Use the excalidraw-studio tools. Look at my open drawing with get_canvas first, then draw a simple login flow with 4 steps in an empty area."*

#### Connect Claude Desktop
1. Install [Node.js](https://nodejs.org) (LTS) if you do not have it.
2. In Excalidraw Studio: AI panel → **Claude Desktop** tab → switch **Connection** on.
3. In Claude Desktop open **Settings → Developer → Edit Config** and put this in `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "excalidraw-studio": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "http://127.0.0.1:7421/mcp"]
       }
     }
   }
   ```
   Microsoft Store version of Claude Desktop? The file lives in `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`. Make sure it is not saved as `.json.txt`.
4. **Fully quit** Claude Desktop (system tray icon → Quit), reopen, start a new chat and ask it to draw.

#### Tools the AI gets
`describe_diagram`, `get_canvas`, `add_elements`, `create_from_mermaid`, `update_elements`, `delete_elements`, `clear_canvas`, `read_canvas_image`, `export_svg`, `list_files`, `open_file`, `save_file`, `query_file_history`, `restore_file_history`, `create_checkpoint`.

## Privacy and security

- The MCP server listens on **127.0.0.1 only** (never the network) and rejects browser requests that carry an `Origin` header.
- API keys for the built-in chat are stored in **Windows Credential Manager**, not in plain files.
- A strict Content-Security-Policy limits which hosts the app can talk to.
- Nothing is uploaded anywhere unless you use the built-in chat with your own API key.
- The MCP server is **off until you switch it on** in the AI panel.

## Example

[`examples/kafka-architecture.excalidraw`](examples/kafka-architecture.excalidraw) is a complete, beginner-friendly Apache Kafka architecture poster (brokers, partitions, producer/consumer flow, code samples) that was generated through the MCP connection. Open it with **Menu → Open File**.

## For developers: build from source

> **You do not need this to use the app.** This section is only for people who want to modify the code or build the installer themselves.

You need [Node.js 22+](https://nodejs.org), the [Rust toolchain](https://rustup.rs/) and the Visual Studio Build Tools ("Desktop development with C++").

```powershell
git clone https://github.com/dilan-nayak/excalidraw-studio.git
cd excalidraw-studio
npm install
npm run tauri dev      # run in development
npm run tauri build    # build the installer
```

The installer is written to `src-tauri/target/release/bundle/nsis/`.

> On Windows, run the build from PowerShell or the "Developer PowerShell for VS". If you use Git Bash, make sure Git's `usr\bin` folder is not first on `PATH`, or its `link.exe` shadows the MSVC linker.

### Project layout

| Path | What is in it |
|---|---|
| `src/App.tsx` | main app, menus, sidebars |
| `src/ChatPanel.tsx`, `src/ConnectPages.tsx` | AI panel and the connect guides |
| `src/tools.ts`, `src/prompts.ts`, `src/mcp.ts` | MCP tool definitions and the bridge to Rust |
| `src/history.ts`, `src/trashStore.ts`, `src/backup.ts` | version history, trash, backup |
| `src/diagramText.ts`, `src/codeGraph.ts`, `src/describe.ts` | Diagram from text, Code to diagram, diagram description |
| `src-tauri/src/mcp.rs` | the local MCP server (Rust) |
| `src-tauri/src/app_trash.rs` | trash with restore |

## Known limitations

- **Windows only** so far. The code is Tauri, so macOS/Linux builds may be possible, but they are untested.
- The installer is **not code-signed**, so Windows SmartScreen shows a warning on first run.
- The built-in chat (own API key / Ollama) is implemented but has **not been tested against live providers**. Claude Code and Claude Desktop over MCP are the tested paths.
- Not built yet: rulers and guides, custom fonts, split view.

## Credits

- Built on **[Excalidraw Desktop](https://github.com/quabyt-tech/excalidraw-desktop)** by Quabyt (MIT), which provides the Tauri + React foundation (workspace sidebar, libraries, slides, AI diagram).
- The editor is **[Excalidraw](https://github.com/excalidraw/excalidraw)** (MIT).
- The product concept is inspired by **[ExcalidrawZ](https://github.com/chocoford/ExcalidrawZ)** for macOS. No code from it is used.
- Made with [Tauri](https://tauri.app/) and [React](https://react.dev/). Full list in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Contributing

Issues and pull requests are welcome. For bigger changes, please open an issue first to discuss the approach.

## License

[MIT](LICENSE). Original work copyright Quabyt; Excalidraw Studio additions copyright Dilan Nayak.
