# Contributing to SQLite DB Viewer

## Development Setup

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Open the project in VS Code.
4.  Press `F5` to start debugging (Launches "Extension Development Host").

## Webview Development

The webview UI is built with React and Vite. Source code is in `webview-ui/`.

To develop the webview with HMR (Hot Module Replacement):
1.  Run the webview dev server:
    ```bash
    npm run dev:webview
    ```
2.  Make changes in `webview-ui/src`.

## Building

To build the project for production:

```bash
npm run build
```

This compiles the TypeScript extension and builds the React webview.

## Publishing

### Create VSIX Package
To create a standard installer file (`.vsix`):

```bash
npx vsce package --no-yarn
```

### Marketplace Publishing Checklist
Before publishing, ensure `package.json` is updated:
-   `version`
-   `publisher`
-   `repository`
-   `homepage`

Then use `vsce publish` (requires authentication).
