declare function acquireVsCodeApi(): { postMessage: (message: unknown) => void };

type VsCodeApi = { postMessage: (message: unknown) => void };

const GLOBAL_KEY = "__newDbViewerVsCodeApi";

export function getVsCodeApi(): VsCodeApi | undefined {
  const globalScope = globalThis as Record<string, VsCodeApi | undefined>;
  if (globalScope[GLOBAL_KEY]) {
    return globalScope[GLOBAL_KEY];
  }

  if (typeof acquireVsCodeApi === "function") {
    globalScope[GLOBAL_KEY] = acquireVsCodeApi();
  }

  return globalScope[GLOBAL_KEY];
}
