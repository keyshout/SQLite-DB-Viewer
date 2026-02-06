# Project Summary: SQLite DB Viewer

Only read this file to understand the entire project context, architecture, and maintenance procedures. This document serves as the "Source of Truth" for future development sessions.

## 1. Project Overview
**Name:** SQLite DB Viewer
**Publisher:** keyshout
**Description:** A VS Code extension that provides a custom editor for `.db`, `.sqlite`, and `.sqlite3` files. It renders an Excel-like data grid within VS Code, allowing users to view, filter, sort, and edit SQLite databases.
**Current Version:** 0.0.3 (Marketplace), 0.0.3 (GitHub)

## 2. Technical Architecture
The extension follows a **Client-Side / In-Memory** architecture using VS Code's Custom Editor API.

### Extension Host (`src/extension.ts`)
*   **Role:** Acts as the bridge between VS Code and the Webview.
*   **Responsibility:**
    *   Registers the Custom Editor Provider (`sqliteDbViewer.dbViewer`).
    *   Reads the database file from disk into a `Uint8Array` (Buffer).
    *   Sends the binary data to the Webview via `postMessage`.
    *   Sends the binary data to the Webview via `postMessage`.
    *   Handles `db:save` messages from the Webview and writes binary data back to disk.
    *   Handles `db:history.sync` to persist Undo/Redo stack to a logical snapshot file (`.snapshot.history.json`).
    *   Handles file export dialogs.

### Webview UI (`webview-ui/`)
*   **Role:** The actual UI and Logic layer.
*   **Tech Stack:** React (presumed), Vite, specialized Data Grid component.
*   **Database Engine:** Likely uses `sql.js` (WASM) to load the SQLite binary data entirely in memory within the browser context.
*   **Styling:** Uses VS Code native tokens (CSS variables) to match the active theme automatically.

## 3. Key File Structure (Local)

```
/
├── .vscode/                # Launch configurations
├── assets/                 # Icons and screenshots (app.gif, icon.png)
├── dist/                   # Compiled Extension code (extension.js)
├── src/                    # Extension Source Code (TypeScript)
│   └── extension.ts        # Main Entry Point
├── webview-ui/             # Frontend Source Code
│   ├── src/                # React/Vite components
│   └── dist/               # Compiled Webview assets (index.html, js, css)
├── CHANGELOG.md            # Version history
├── minify.js               # Custom script to obfuscate/minify extension code
├── package.json            # Manifest (Commands, Menus, Dependencies)
├── README.md               # Marketplace Documentation
└── tsconfig.json           # TypeScript Config
```

**Note on GitHub Repository:**
To protect the source code, the GitHub repository acts as a "Distribution" repo.
*   `src/` and `webview-ui/src/` are **ignored** (via `.gitignore` locally, removed from remote).
*   `dist/` and `webview-ui/dist/` are **tracked** and pushed to GitHub.
*   The remote repo contains the *minified* code, while your local machine has the *full source*.

## 4. Features & Capabilities
*   **Custom Editor:** Opens automatically for configured file extensions.
*   **Virtualization:** Handles large datasets by rendering only visible rows.
*   **CRUD Operations:**
    *   **Read:** Browses tables, views, and schema.
    *   **Edit:** Inline cell editing.
    *   **Create:** Add new rows.
    *   **Delete:** Remove rows (Context menu).
*   **Advanced Filtering:** Support for operators (`>`, `<`, `!empty`, `text*`).
*   **Export:** JSON, CSV, Excel, HTML, Markdown, SQL Import.
*   **Sorting:** Client-side column sorting.

## 5. Build & Release Workflow

### A. Development
Run `npm run build` to compile the TypeScript source to `dist/`.

### B. Minification (Security)
We use a custom script to obfuscate the code before packaging/pushing.
```powershell
node minify.js
```
*This uses `esbuild` to minify `dist/extension.js` -> `dist/extension.js`.*

### C. Packaging (For Marketplace)
To create the `.vsix` installer:
```powershell
npx -y @vscode/vsce package --no-yarn
```
*Output: `sqlite-db-viewer-0.0.X.vsix`*

### D. GitHub Sync
1.  Ensure `.gitignore` ignores `src/`.
2.  Commit `dist/` changes.
3.  Push to main (may require `--force` if history was rewritten).

## 6. Configuration Details (`package.json`)
*   **Activation Events:** `onCustomEditor:sqliteDbViewer.dbViewer`
*   **Commands:** `sqliteDbViewer.openFile` (Internal use for "Open...")
*   **File Associations:** `*.db`, `*.sqlite`, `*.sqlite3`
*   **Dependencies:** `jimp`, `@vscode/codicons` (bundled into VSIX).

## 7. Future Maintenance Guide
*   **To Update Code:** Edit files in `src/`, then run `npm run build`.
*   **To Update UI:** Edit files in `webview-ui/src/`, then run `npm run build:webview` (or `npm run build` which does both).
*   **To Publish Update:**
    1.  Update version in `package.json`.
    2.  Update `CHANGELOG.md`.
    3.  `npm run build` -> `node minify.js` -> `vsce package`.
    4.  Upload `.vsix` to Marketplace.
    5.  `git push` to GitHub.
