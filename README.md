# SQLite DB Viewer

**SQLite DB Viewer** is a modern, native-feeling database explorer for Visual Studio Code. It allows you to view, filter, and edit `.db`, `.sqlite`, and `.sqlite3` files directly within your editor, providing a seamless experience that matches your VS Code theme.

![Main UI](assets/screenshot-main.png)

## ✨ Features

*   **Native UI**: Designed to look and feel exactly like VS Code. Adapts to your color theme automatically.
*   **Performance**: Handles large datasets efficiently with virtualized scrolling.
*   **Search & Filter**:
    *   **Global Filter**: Quickly search across usage tables.
    *   **Column Filtering**: Filter specific columns using operators (e.g., `> 100`, `text*`, `!empty`).
*   **Data Editing**:
    *   Double-click any cell to edit.
    *   Add new rows easily.
    *   Delete rows (single or bulk).
    *   *Note: Editing requires the table to have a ROWID.*
*   **Export Data**: Copy or save your data in multiple formats:
    *   Excel, CSV, TSV
    *   JSON (Object or Array)
    *   HTML, Markdown
    *   SQLite INSERT statements

## 🚀 Quick Start

1.  **Install** the extension from the Marketplace.
2.  **Open** any `.db`, `.sqlite`, or `.sqlite3` file from the VS Code Explorer.
3.  The viewer will open automatically in a custom editor tab.

## 📖 Usage Guide

### Browsing Data
-   **Sidebar**: Use the left panel to navigate between tables and view column schemas.
-   **Sorting**: Click column headers to sort ascending/descending.
-   **Pinning**: Pin important columns to the left for easy reference.

### Editing Rows
-   **Edit**: Double-click a cell to modify its content. Changes are saved immediately.
-   **Add Row**: Click the **+** button at the bottom of the grid.
-   **Delete**: Right-click a row (or multiple selected rows) and choose **Delete**.

### Exporting
1.  Click the **Export** button in the toolbar.
2.  Select your desired format (e.g., JSON, CSV).
3.  Choose **Copy to Clipboard** or **Save to File**.

## ⚙️ Requirements

*   VS Code version `^1.85.0` or higher.

## 🔒 Privacy & Security

*   **Offline First**: The extension runs entirely locally. No data is sent to any server.
*   **Sandboxed**: Uses VS Code's webview sandbox for security.

## 📝 License

MIT
