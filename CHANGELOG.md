# Changelog

All notable changes to the "SQLite DB Viewer" extension will be documented in this file.
## [0.0.9] - 2026-02-11

### Stability & Performance
-   **Enhanced Stability**: Resolved intermittent "Timeout" errors and data synchronization issues for a reliable experience.
-   **Smoother Scrolling**: Significantly improved scroll responsiveness and eliminated lag, especially when using the mouse wheel.

### Scroll & Navigation
-   **Seamless Scrolling**: You can now scroll through your entire dataset effortlessly. No more clicking "Next Page" repeatedly.
-   **Smart Pagination**: The "Page" indicator now automatically updates as you scroll, and vice-versa.
-   **Snap Fixes**: Fixed issues where the view would jump or snap unexpectedly during manual scrolling.
-   **Better Visibility**: Increased the data view to show 100 rows at a time by default.

### UI Improvements
-   **Select All**: Added `Ctrl+A` (or `Cmd+A`) support to quickly select all visible rows.
-   **Cleaner Selection**: Selecting multiple rows now highlights only the rows, keeping the text clear and readable (no accidental text selection).

## [0.0.8] - 2026-02-10

### Added
- **Edit Row Navigation**: Added Up/Down arrow buttons to the "Edit Row" modal, allowing users to navigate between rows without closing the modal.
- **Auto-expanding Textareas**: Text fields in the "Edit Row" modal now automatically resize to fit their content, improving readability for long text.
- **Metadata Updates**: Expanded extension categories and keywords for better discoverability.


## [0.0.7] - 2026-02-10
### Major Features
-   **Sticky Columns**: Pinned columns and the "Action" column now remain fixed while scrolling horizontally, improving navigation in wide tables.
-   **Improved Row Pinning**: Pinned rows now correctly overlay sticky columns, ensuring a consistent and glitch-free scrolling experience.

## [0.0.6] - 2026-02-07
### Major Features
-   **Enhanced "Create Table" Modal**: Redesigned with a professional grid layout. Now supports adding multiple columns at once with name, type, and Primary Key selection.
-   **Multi-Column "Add Column" Modal**: Refactored to match "Create Table". You can now add multiple columns to an existing table in one operation.
-   **Primary Key Support in Table Creation**: Users can now designate one column as the Primary Key when creating a new table.

## [0.0.5] - 2026-02-06
### Packaging & Performance
-   **Massive Size Reduction**: Reduced extension package size from ~120MB to ~2.6MB by implementing proper `.vscodeignore` rules.
-   **Bundled Dependencies**: Updated build process to bundle all dependencies into a single file, removing the need for a `node_modules` folder at runtime (Standalone/Portable).

## [0.0.4] - 2026-02-06
### Major Features (Undo/Redo Overhaul)
-   **Persistent Undo/Redo (Hot Exit)**: Edit history is now strictly synced to disk. You can modify data, close VS Code without saving, rejoin, and *still* Undo your changes.
-   **Data Integrity Protection**: Fixed a critical issue where Undoing corrupted data types. Now `NULL`, `Blob`, and `Number` types are preserved exactly as-is during Undo/Redo cycles.
-   **Smart Primary Key Undo**: The undo engine now intelligently tracks Primary Key mutations. If you change an ID (e.g., 1 -> 99), Undo knows to find row 99 and revert it to 1.
-   **Global History Sync**: Replaced browser-based navigation with a dedicated Undo/Redo system that integrates with VS Code's "Edit -> Undo" menu.

### Safety & Validation
-   **Duplicate Key Prevention**: "Edit Row" now performs real-time validation. It creates a safety lock (disabling Save) if you try to enter a Primary Key that already exists.
-   **Strict Type Handling**: Enhanced serialization logic (JSON Revivers) to handle binary data (`Uint8Array`) correctly in the history stack.

### UI/UX Refinements
-   **Sticky "Add Row" Bar**: Completely re-engineered the "Add Row" button.
    -   Smart Placement: Sits naturally after data in short tables, sticks to bottom in long tables.
    -   Minimalist Design: Restricted to the "Action Column", ensuring it never overlaps your data or horizontal scrollbars.
-   **Zebra Striping**: Added alternating row colors for better readability on wide datasets.
-   **Modal Polish**: Added "Hand" cursors to buttons, standard "X" close buttons, and error-state styling to all modals.
-   **Scroll-Based Layout**: Switched to a standard scrollbar implementation (removing custom scrollbar hacks) for native OS feel and reliability.

### Bug Fixes
-   Fixed "Double Undo" loop where Webview and VS Code would fight for control of the undo stack.
-   Fixed Delete Confirmation dialog to correctly display the row's Primary Key.
-   Fixed "Dirty State" logic to correctly reflect unsaved changes immediately upon editing.

## [0.0.3] - 2026-02-04
### Improved
-   Refined documentation with a comprehensive, professional README.
-   Removed redundant commands to declutter Feature list.
-   Corrected date and metadata issues.

## [0.0.2] - 2026-02-04
### Fixed
-   Corrected README and Marketplace details.
-   Minified extension code for better performance and security.
-   Added missing icons to the installation package.

## [0.0.1] - 2026-02-04
### Added
-   Initial release of SQLite DB Viewer.
-   Support for `.db`, `.sqlite`, `.sqlite3` files.
-   Data Grid with sorting, filtering, and pagination.
-   Sidebar for navigating tables and schema.
-   Editing capabilities (Insert, Update, Delete rows).
-   Export to CSV, JSON, HTML, Markdown, Excel.
-   Theme support (Dark/Light mode integration).
