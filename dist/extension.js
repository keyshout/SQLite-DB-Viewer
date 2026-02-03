"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
function activate(context) {
    const output = vscode.window.createOutputChannel("New Db Viewer");
    output.appendLine("Activated");
    const extensionVersion = String(context.extension.packageJSON.version ?? "");
    const extensionDisplayName = String(context.extension.packageJSON.displayName ?? context.extension.packageJSON.name ?? "New Db Viewer");
    const provider = new DbViewerCustomEditorProvider(context.extensionUri, output, extensionDisplayName, extensionVersion);
    const providerRegistration = vscode.window.registerCustomEditorProvider("newDbViewer.dbViewer", provider, {
        supportsMultipleEditorsPerDocument: true
    });
    const openCommand = vscode.commands.registerCommand("newDbViewer.open", async () => {
        const uri = await pickDatabaseFile();
        if (!uri) {
            return;
        }
        await openWithViewer(uri, output);
    });
    const openFileCommand = vscode.commands.registerCommand("newDbViewer.openFile", async (uri) => {
        const target = uri ?? (await pickDatabaseFile());
        if (!target) {
            return;
        }
        await openWithViewer(target, output);
    });
    const autoOpenDisposable = vscode.workspace.onDidOpenTextDocument(async (doc) => {
        if (!isDatabaseFile(doc.uri)) {
            return;
        }
        await openWithViewer(doc.uri, output);
    });
    context.subscriptions.push(providerRegistration, openCommand, openFileCommand, autoOpenDisposable, output);
}
function deactivate() { }
async function pickDatabaseFile() {
    const result = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
            SQLite: ["db", "sqlite", "sqlite3"]
        }
    });
    return result?.[0];
}
class DbViewerDocument {
    constructor(uri) {
        this.uri = uri;
    }
    dispose() {
        // No resources to dispose yet.
    }
}
class DbViewerCustomEditorProvider {
    constructor(extensionUri, output, extensionDisplayName, extensionVersion) {
        this.extensionUri = extensionUri;
        this.output = output;
        this.extensionDisplayName = extensionDisplayName;
        this.extensionVersion = extensionVersion;
    }
    async openCustomDocument(uri) {
        this.output.appendLine(`openCustomDocument: ${uri.fsPath}`);
        return new DbViewerDocument(uri);
    }
    async resolveCustomEditor(document, webviewPanel) {
        this.output.appendLine(`resolveCustomEditor: ${document.uri.fsPath}`);
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, "webview-ui", "dist"),
                vscode.Uri.joinPath(this.extensionUri, "dist", "codicons")
            ]
        };
        let ready = false;
        let pendingBytes;
        let configSent = false;
        const dbName = path.basename(document.uri.fsPath);
        const sendConfig = () => {
            if (configSent) {
                return;
            }
            configSent = true;
            webviewPanel.webview.postMessage({
                type: "webview:config",
                displayName: this.extensionDisplayName,
                version: this.extensionVersion
            });
        };
        const readBytes = async () => {
            pendingBytes = await vscode.workspace.fs.readFile(document.uri);
            this.output.appendLine(`read db bytes: ${pendingBytes.byteLength}`);
            return pendingBytes;
        };
        const sendBytes = async () => {
            if (!pendingBytes) {
                await readBytes();
            }
            if (pendingBytes && ready) {
                this.output.appendLine(`sending db bytes: ${pendingBytes.byteLength}`);
                webviewPanel.webview.postMessage({
                    type: "db:load",
                    name: dbName,
                    bytes: pendingBytes
                });
            }
        };
        webviewPanel.webview.onDidReceiveMessage((message) => {
            if (message?.type === "webview:ready") {
                this.output.appendLine("webview:ready");
                ready = true;
                sendConfig();
                void sendBytes();
                return;
            }
            if (message?.type === "webview:refresh") {
                this.output.appendLine("webview:refresh");
                void readBytes().then(() => sendBytes());
                return;
            }
            if (message?.type === "db:save") {
                const bytes = normalizeMessageBytes(message.bytes);
                const saveId = message.saveId;
                this.output.appendLine(`db:save received bytes=${bytes ? bytes.byteLength : "invalid"}`);
                if (!bytes) {
                    const details = "db:save received invalid bytes";
                    this.output.appendLine(details);
                    void webviewPanel.webview.postMessage({
                        type: "db:save:result",
                        ok: false,
                        message: details,
                        saveId
                    });
                    return;
                }
                void vscode.workspace.fs.writeFile(document.uri, bytes).then(() => {
                    pendingBytes = bytes;
                    this.output.appendLine(`db saved: ${document.uri.fsPath}`);
                    void webviewPanel.webview.postMessage({
                        type: "db:save:result",
                        ok: true,
                        message: "Saved",
                        saveId
                    });
                }, (err) => {
                    const messageText = err instanceof Error ? err.message : String(err);
                    this.output.appendLine(`db save failed: ${messageText}`);
                    void webviewPanel.webview.postMessage({
                        type: "db:save:result",
                        ok: false,
                        message: messageText,
                        saveId
                    });
                });
                return;
            }
            if (message?.type === "export:file") {
                const name = typeof message.name === "string" && message.name.trim()
                    ? message.name.trim()
                    : "export.txt";
                const text = typeof message.text === "string" ? message.text : "";
                if (!text) {
                    void webviewPanel.webview.postMessage({
                        type: "export:result",
                        ok: false,
                        message: "Nothing to save."
                    });
                    return;
                }
                const ext = path.extname(name).replace(".", "") || "txt";
                const defaultDir = path.dirname(document.uri.fsPath);
                const defaultUri = vscode.Uri.file(path.join(defaultDir, name));
                void (async () => {
                    const uri = await vscode.window.showSaveDialog({
                        defaultUri,
                        filters: {
                            [ext.toUpperCase()]: [ext]
                        }
                    });
                    if (!uri) {
                        void webviewPanel.webview.postMessage({
                            type: "export:result",
                            ok: false,
                            message: "Save canceled."
                        });
                        return;
                    }
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
                    void webviewPanel.webview.postMessage({
                        type: "export:result",
                        ok: true,
                        message: `Saved ${path.basename(uri.fsPath)}`
                    });
                })().catch((err) => {
                    const messageText = err instanceof Error ? err.message : String(err);
                    void webviewPanel.webview.postMessage({
                        type: "export:result",
                        ok: false,
                        message: messageText
                    });
                });
                return;
            }
            if (message?.type === "export:save") {
                const name = typeof message.name === "string" && message.name.trim()
                    ? message.name.trim()
                    : "export.txt";
                const text = typeof message.text === "string" ? message.text : "";
                if (!text) {
                    void webviewPanel.webview.postMessage({
                        type: "export:result",
                        ok: false,
                        message: "Nothing to save."
                    });
                    return;
                }
                const defaultDir = path.dirname(document.uri.fsPath);
                const targetPath = path.join(defaultDir, name);
                void vscode.workspace.fs
                    .writeFile(vscode.Uri.file(targetPath), Buffer.from(text, "utf8"))
                    .then(() => {
                    this.output.appendLine(`saved export: ${targetPath}`);
                    void webviewPanel.webview.postMessage({
                        type: "export:result",
                        ok: true,
                        message: `Saved to ${targetPath}`
                    });
                }, (err) => {
                    const messageText = err instanceof Error ? err.message : String(err);
                    void webviewPanel.webview.postMessage({
                        type: "export:result",
                        ok: false,
                        message: messageText
                    });
                });
                return;
            }
            if (message?.type === "webview:log") {
                if (message.message) {
                    this.output.appendLine(`webview log: ${message.message}`);
                }
                return;
            }
            if (message?.type === "webview:error") {
                const details = [
                    message.message ? `message=${message.message}` : undefined,
                    message.source ? `source=${message.source}` : undefined,
                    message.line ? `line=${message.line}` : undefined,
                    message.column ? `column=${message.column}` : undefined
                ]
                    .filter(Boolean)
                    .join(" ");
                this.output.appendLine(`webview error: ${details}`);
                if (message.stack) {
                    this.output.appendLine(String(message.stack));
                }
            }
        });
        await readBytes();
        webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview, this.extensionUri);
        if (ready) {
            await sendBytes();
        }
    }
}
async function openWithViewer(uri, output) {
    if (!isDatabaseFile(uri)) {
        return;
    }
    const key = uri.toString();
    if (openGate.has(key)) {
        return;
    }
    openGate.add(key);
    setTimeout(() => openGate.delete(key), 1500);
    try {
        await vscode.commands.executeCommand("vscode.openWith", uri, "newDbViewer.dbViewer");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        output.appendLine(`openWith failed: ${message}`);
        vscode.window.showErrorMessage(`New Db Viewer could not be opened: ${message}`);
    }
}
const openGate = new Set();
function isDatabaseFile(uri) {
    const ext = path.extname(uri.fsPath).toLowerCase();
    return ext === ".db" || ext === ".sqlite" || ext === ".sqlite3";
}
function getWebviewHtml(webview, extensionUri) {
    const distUri = vscode.Uri.joinPath(extensionUri, "webview-ui", "dist");
    const indexPath = vscode.Uri.joinPath(distUri, "index.html");
    let html = fs.readFileSync(indexPath.fsPath, "utf8");
    const cacheBust = Date.now().toString();
    const nonce = getNonce();
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} blob: data:`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        `connect-src ${webview.cspSource}`,
        `worker-src ${webview.cspSource}`,
        `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`
    ].join("; ");
    const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "codicons", "codicon.css"));
    html = html.replace("<head>", `<head>\n<meta http-equiv=\"Content-Security-Policy\" content=\"${csp}\">\n<link rel=\"stylesheet\" href=\"${codiconUri}\">`);
    const baseUri = webview.asWebviewUri(distUri).toString();
    html = html.replace(/(href|src)=\"\.\/?assets\//g, `$1=\"${baseUri}/assets/`);
    html = html.replace(/(href|src)=\"\/assets\//g, `$1=\"${baseUri}/assets/`);
    html = html.replace(/assets\/[^\"']+\.(?:js|css|wasm)/g, (match) => {
        return `${match}?v=${cacheBust}`;
    });
    html = html.replace(/<script /g, `<script nonce=\"${nonce}\" `);
    return html;
}
function getNonce() {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 32; i += 1) {
        nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return nonce;
}
function normalizeMessageBytes(value) {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (Array.isArray(value)) {
        return Uint8Array.from(value);
    }
    if (value && typeof value === "object") {
        const record = value;
        if (record.type === "Buffer" && Array.isArray(record.data)) {
            return Uint8Array.from(record.data);
        }
        if (Array.isArray(record.data)) {
            return Uint8Array.from(record.data);
        }
        const values = Object.values(record);
        if (values.length && values.every((item) => typeof item === "number")) {
            return Uint8Array.from(values);
        }
    }
    return undefined;
}
//# sourceMappingURL=extension.js.map