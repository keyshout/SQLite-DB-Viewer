import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { getVsCodeApi } from "./vscode";

const vscodeApi = getVsCodeApi();

if (vscodeApi) {
  window.addEventListener("error", (event) => {
    vscodeApi.postMessage({
      type: "webview:error",
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    vscodeApi.postMessage({
      type: "webview:error",
      message: reason.message,
      stack: reason.stack
    });
  });
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
