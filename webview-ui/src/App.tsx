import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import QRCode from "qrcode";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { getVsCodeApi } from "./vscode";

type SqlValue = string | number | null | Uint8Array;

type SqlJsResult = {
  columns: string[];
  values: SqlValue[][];
};

type SqlJsDatabase = {
  exec: (sql: string, params?: SqlValue[]) => SqlJsResult[];
  export: () => Uint8Array;
  close: () => void;
};

type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type ColumnMeta = {
  name: string;
  type: string;
  pk?: boolean;
  isRowId?: boolean;
};

type ColumnFilterMode = {
  exact?: boolean;
  nonEmpty?: boolean;
  invert?: boolean;
};

type SupportWallet = {
  key: string;
  label: string;
  address: string;
  network: string;
};

const SUPPORT_WALLETS: SupportWallet[] = [
  {
    key: "solana",
    label: "Solana",
    address: "CRzU8PbmyzpB6xMNBuawYMpUE7rm8r3Q48Zid4rt37kS",
    network: "SOLANA"
  },
  {
    key: "btc",
    label: "Bitcoin",
    address: "bc1qg635pr920vf3svr7deywlary8020atq2l5u290",
    network: "BTC"
  },
  {
    key: "eth",
    label: "Ethereum",
    address: "0xAF3ACa9a07f21411F1E5D142e1d6BFF5eB225dD4",
    network: "ETH"
  },
  {
    key: "trx",
    label: "Tron",
    address: "TVbABXaQNAta7eib2SC7jDNQokM6YMGoDu",
    network: "TRX"
  }
];

type RowData = Record<string, SqlValue> & {
  __rowIndex: number;
  __rowId?: number | null;
};

type CopyFormat =
  | "Excel"
  | "CSV"
  | "TSV"
  | "SQLite Insert"
  | "JSON Object"
  | "JSON Array"
  | "HTML"
  | "Markdown";

const ROW_INDEX_KEY = "__rowIndex__";
const COPY_FORMATS: CopyFormat[] = [
  "Excel",
  "CSV",
  "TSV",
  "SQLite Insert",
  "JSON Object",
  "JSON Array",
  "HTML",
  "Markdown"
];

let sqlPromise: Promise<SqlJsStatic> | null = null;

const vscodeApi = getVsCodeApi();
const postLog = (message: string) => {
  vscodeApi?.postMessage({ type: "webview:log", message });
};

export default function App() {
  const [dbName, setDbName] = useState("SQLite DB Viewer");
  const [appName, setAppName] = useState("SQLite DB Viewer");
  const [appVersion, setAppVersion] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [selectedRow, setSelectedRow] = useState<RowData | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Record<string, boolean>>({});
  const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [hasDatabase, setHasDatabase] = useState(false);
  const [tableFilter, setTableFilter] = useState("");
  const [rowFilter, setRowFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [tableColumns, setTableColumns] = useState<Record<string, ColumnMeta[]>>({});
  const [hiddenColumnsByTable, setHiddenColumnsByTable] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [pinnedColumnsByTable, setPinnedColumnsByTable] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [columnFilterModesByTable, setColumnFilterModesByTable] = useState<
    Record<string, Record<string, ColumnFilterMode>>
  >({});
  const [tableHistory, setTableHistory] = useState<string[]>([]);
  const [tableHistoryIndex, setTableHistoryIndex] = useState(-1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [sidebarMenu, setSidebarMenu] = useState<
    { x: number; y: number; table?: string } | null
  >(null);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; row: RowData } | null>(
    null
  );
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableError, setNewTableError] = useState<string | null>(null);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [columnTargetTable, setColumnTargetTable] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState("TEXT");
  const [newColumnError, setNewColumnError] = useState<string | null>(null);
  const [isDeleteTableOpen, setIsDeleteTableOpen] = useState(false);
  const [deleteTargetTable, setDeleteTargetTable] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isAddRowOpen, setIsAddRowOpen] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
  const [newRowError, setNewRowError] = useState<string | null>(null);
  const [editRowTarget, setEditRowTarget] = useState<RowData | null>(null);
  const [editFocusColumn, setEditFocusColumn] = useState<string | null>(null);
  const [editRowValues, setEditRowValues] = useState<Record<string, string>>({});
  const [editRowError, setEditRowError] = useState<string | null>(null);
  const [pinnedRows, setPinnedRows] = useState<Record<string, boolean>>({});
  const [supportQr, setSupportQr] = useState<string>("");
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [selectedWalletKey, setSelectedWalletKey] = useState(
    SUPPORT_WALLETS[0]?.key ?? "solana"
  );
  const [copyFormat, setCopyFormat] = useState<CopyFormat>("Excel");
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);
  const [pageDraft, setPageDraft] = useState("1");

  const selectedWallet = useMemo(
    () =>
      SUPPORT_WALLETS.find((wallet) => wallet.key === selectedWalletKey) ??
      SUPPORT_WALLETS[0],
    [selectedWalletKey]
  );
  const supportWallet = selectedWallet?.address ?? "";
  const supportNetwork = selectedWallet?.network ?? "";

  const dbRef = useRef<SqlJsDatabase | null>(null);
  const gridBodyRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const statusTimerRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastSidebarWidthRef = useRef<number | null>(null);
  const lastDetailsWidthRef = useRef<number | null>(null);
  const copyMenuRef = useRef<HTMLDivElement | null>(null);

  const updateGridScrollbarWidth = () => {
    const element = gridBodyRef.current;
    const root = appRootRef.current;
    if (!element || !root) {
      return;
    }
    const scrollbarWidth = element.offsetWidth - element.clientWidth;
    const scrollbarHeight = element.offsetHeight - element.clientHeight;
    const safeWidth = Number.isFinite(scrollbarWidth) ? Math.max(0, scrollbarWidth) : 0;
    const safeHeight = Number.isFinite(scrollbarHeight)
      ? Math.max(0, scrollbarHeight)
      : 0;
    root.style.setProperty("--grid-scrollbar-width", `${safeWidth}px`);
    root.style.setProperty("--grid-scrollbar-height", `${safeHeight}px`);
  };

  useLayoutEffect(() => {
    const element = gridBodyRef.current;
    if (!element) {
      return;
    }

    const updatePageSize = () => {
      const styles = getComputedStyle(element);
      const rowHeight = parseFloat(styles.getPropertyValue("--grid-row-height"));
      const height = element.clientHeight;
      if (Number.isFinite(rowHeight) && rowHeight > 0 && height > 0) {
        const size = Math.max(5, Math.floor(height / rowHeight));
        setPageSize(size);
      }
    };

    updatePageSize();
    const observer = new ResizeObserver(updatePageSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    updateGridScrollbarWidth();
    const element = gridBodyRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(updateGridScrollbarWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    updateGridScrollbarWidth();
  }, [rowCount, pageSize, status, rows.length]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        name?: string;
        bytes?: unknown;
        version?: string;
        displayName?: string;
        ok?: boolean;
        message?: string;
        saveId?: number;
      };
      if (data?.type === "webview:config") {
        setAppVersion(data.version ?? "");
        setAppName(data.displayName ?? "SQLite DB Viewer");
        return;
      }
      if (data?.type === "db:load" && data.bytes !== undefined) {
        postLog(`db:load received name=${data.name ?? "Database"}`);
        void loadDatabase(data.name ?? "Database", data.bytes);
      }
      if (data?.type === "db:save:result") {
        if (
          typeof data.saveId === "number" &&
          data.saveId !== saveRequestIdRef.current
        ) {
          return;
        }
        if (saveTimeoutRef.current) {
          window.clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        if (data.ok) {
          showStatusMessage(data.message ?? "Saved");
          return;
        }
        const message = data.message ?? "Database write failed";
        postLog(`save failed: ${message}`);
        showStatusMessage(message);
        return;
      }
      if (data?.type === "export:result") {
        if (data.ok) {
          showStatusMessage(data.message ?? "Saved");
          return;
        }
        const message = data.message ?? "Save failed";
        showStatusMessage(message);
        return;
      }
    };

    window.addEventListener("message", handler);
    vscodeApi?.postMessage({ type: "webview:ready" });
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const value = supportWallet.trim();
    if (!value) {
      setSupportQr("");
      return;
    }
    const styles = getComputedStyle(document.documentElement);
    const dark = styles.getPropertyValue("--vscode-foreground").trim() || "#ffffff";
    const light =
      styles.getPropertyValue("--vscode-editor-background").trim() || "#000000";
    QRCode.toDataURL(value, {
      margin: 0,
      width: 140,
      color: { dark, light }
    })
      .then((url: string) => setSupportQr(url))
      .catch(() => setSupportQr(""));
  }, [supportWallet, supportNetwork]);

  useEffect(() => {
    if (!isCopyMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (copyMenuRef.current && !copyMenuRef.current.contains(target)) {
        setIsCopyMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [isCopyMenuOpen]);

  const hiddenColumns = hiddenColumnsByTable[selectedTable] ?? {};
  const columnPins = useMemo(
    () => pinnedColumnsByTable[selectedTable] ?? {},
    [pinnedColumnsByTable, selectedTable]
  );
  const columnFilterModes = useMemo(
    () => columnFilterModesByTable[selectedTable] ?? {},
    [columnFilterModesByTable, selectedTable]
  );
  const isRowIndexHidden = Boolean(hiddenColumns[ROW_INDEX_KEY]);
  const showRowIndex = !isRowIndexHidden;
  const visibleColumns = useMemo(() => {
    const base = columns.filter((column) => !hiddenColumns[column.name]);
    if (!Object.keys(columnPins).length) {
      return base;
    }
    const pinned = base.filter((column) => columnPins[column.name]);
    const rest = base.filter((column) => !columnPins[column.name]);
    return [...pinned, ...rest];
  }, [columns, hiddenColumns, columnPins]);

  useEffect(() => {
    if (!dbRef.current || !selectedTable) {
      setColumns([]);
      setRows([]);
      setRowCount(0);
      setSelectedRow(null);
      setSelectedRowKeys({});
      setSelectionAnchorIndex(null);
      return;
    }

    const db = dbRef.current;
    const metadata = getColumnMeta(db, selectedTable);
    setColumns(metadata);
    const filter = buildWhereClause(
      metadata,
      rowFilter,
      columnFilters,
      columnFilterModes
    );
    const count = getRowCount(db, selectedTable, filter);
    setRowCount(count);

    const maxPage = Math.max(1, Math.ceil(count / pageSize));
    if (page > maxPage) {
      setPage(maxPage);
      return;
    }

    const dataRows = getRows(db, selectedTable, page, pageSize, filter);
    setRows(dataRows);
    if (!dataRows.length) {
      setSelectedRow(null);
      setSelectedRowKeys({});
      setSelectionAnchorIndex(null);
      return;
    }
    const matching = dataRows.filter((row) => selectedRowKeys[getRowKey(row)]);
    const nextSelection = matching.length ? matching : [dataRows[0]];
    const nextSelectionKeys: Record<string, boolean> = {};
    nextSelection.forEach((row) => {
      nextSelectionKeys[getRowKey(row)] = true;
    });
    setSelectedRow(nextSelection[0]);
    setSelectedRowKeys(nextSelectionKeys);
    const anchorKey = getRowKey(nextSelection[0]);
    const anchorIndex = dataRows.findIndex((row) => getRowKey(row) === anchorKey);
    setSelectionAnchorIndex(anchorIndex >= 0 ? anchorIndex : 0);
  }, [
    selectedTable,
    page,
    pageSize,
    status,
    rowFilter,
    columnFilters,
    columnFilterModes,
    refreshToken
  ]);

  const filteredTables = useMemo(() => {
    const query = tableFilter.trim().toLowerCase();
    if (!query) {
      return tables;
    }
    return tables.filter((table) => table.toLowerCase().includes(query));
  }, [tables, tableFilter]);

  useEffect(() => {
    if (!filteredTables.length) {
      return;
    }
    if (!filteredTables.includes(selectedTable)) {
      const nextTable = filteredTables[0];
      setSelectedTable(nextTable);
      setPage(1);
      setColumnFilters({});
      setRowFilter("");
      setTableHistory(nextTable ? [nextTable] : []);
      setTableHistoryIndex(nextTable ? 0 : -1);
    }
  }, [filteredTables, selectedTable]);

  const pageCount = useMemo(() => {
    return rowCount > 0 ? Math.max(1, Math.ceil(rowCount / pageSize)) : 1;
  }, [rowCount, pageSize]);

  const [rowIndexWidth, setRowIndexWidth] = useState<number | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const [detailsWidth, setDetailsWidth] = useState<number | null>(null);

  useEffect(() => {
    const indexWidth = getCssPx("--col-index");
    setRowIndexWidth((current) => current ?? indexWidth);
    const defaultSidebar = getCssPx("--sidebar-width");
    const defaultDetails = getCssPx("--details-width");
    setSidebarWidth((current) => current ?? defaultSidebar);
    setDetailsWidth((current) =>
      current ?? (isDetailsOpen ? defaultDetails : 0)
    );
    lastSidebarWidthRef.current = defaultSidebar;
    lastDetailsWidthRef.current = defaultDetails;
  }, [isDetailsOpen]);

  useEffect(() => {
    if (!visibleColumns.length) {
      return;
    }
    setColumnWidths((current) => {
      const next = { ...current };
      let changed = false;
      visibleColumns.forEach((column) => {
        if (!next[column.name]) {
          next[column.name] = getDefaultColumnWidthPx(column);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [visibleColumns]);

  useEffect(() => {
    if (isSidebarOpen && sidebarWidth && sidebarWidth > 0) {
      lastSidebarWidthRef.current = sidebarWidth;
    }
  }, [isSidebarOpen, sidebarWidth]);

  useEffect(() => {
    if (isDetailsOpen && detailsWidth && detailsWidth > 0) {
      lastDetailsWidthRef.current = detailsWidth;
    }
  }, [isDetailsOpen, detailsWidth]);

  useEffect(() => {
    setPageDraft(String(page));
  }, [page]);

  const gridTemplate = useMemo(() => {
    const indexWidth = rowIndexWidth ?? getCssPx("--col-index");
    const widths = visibleColumns.map((column) => {
      const width = columnWidths[column.name] ?? getDefaultColumnWidthPx(column);
      return `${width}px`;
    });
    return showRowIndex ? [`${indexWidth}px`, ...widths].join(" ") : widths.join(" ");
  }, [visibleColumns, columnWidths, rowIndexWidth, showRowIndex]);
  const pageInputWidthCh = Math.max(2, String(pageCount).length * 2);

  const loadDatabase = async (name: string, rawBytes: unknown) => {
    setStatus("loading");
    setError(null);
    setHasDatabase(false);

    try {
      const SQL = await getSql();
      if (dbRef.current) {
        dbRef.current.close();
      }

      const input = normalizeBytes(rawBytes);
      postLog(`db bytes length=${input.byteLength} header=${formatHeader(input)}`);
      dbRef.current = new SQL.Database(input);

      setDbName(name);
      const tableList = getTables(dbRef.current);
      setTables(tableList);
      postLog(`tables loaded count=${tableList.length}`);
      setSelectedTable(tableList[0] ?? "");
      setTableHistory(tableList[0] ? [tableList[0]] : []);
      setTableHistoryIndex(tableList[0] ? 0 : -1);
      setPage(1);
      setTableFilter("");
      setRowFilter("");
      setColumnFilters({});
      setExpandedTables({});
      setTableColumns({});
      setHiddenColumnsByTable({});
      setPinnedColumnsByTable({});
      setColumnFilterModesByTable({});
      setPinnedRows({});
      setHasDatabase(true);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Database load failed");
      postLog(
        `load failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  };

  const handleTableSelect = (table: string) => {
    if (table === selectedTable) {
      return;
    }
    setSelectedTable(table);
    setPage(1);
    setRowFilter("");
    setColumnFilters({});
    setTableHistoryIndex((currentIndex) => {
      const nextIndex = currentIndex + 1;
      setTableHistory((current) => {
        const next = current.slice(0, nextIndex);
        next.push(table);
        return next;
      });
      return nextIndex;
    });
  };

  const handleTableToggle = (table: string) => {
    setExpandedTables((current) => {
      const nextValue = !current[table];
      if (nextValue && dbRef.current && !tableColumns[table]) {
        const columns = getSidebarColumns(dbRef.current, table);
        setTableColumns((previous) => ({
          ...previous,
          [table]: columns
        }));
      }
      return { ...current, [table]: nextValue };
    });
  };

  const handleToggleAll = () => {
    if (!filteredTables.length) {
      return;
    }
    const shouldExpand = !hasExpanded;
    setExpandedTables((current) => {
      const next = { ...current };
      filteredTables.forEach((table) => {
        next[table] = shouldExpand;
      });
      return next;
    });
    if (shouldExpand && dbRef.current) {
      const updates: Record<string, ColumnMeta[]> = {};
      filteredTables.forEach((table) => {
        if (!tableColumns[table]) {
          updates[table] = getSidebarColumns(dbRef.current as SqlJsDatabase, table);
        }
      });
      if (Object.keys(updates).length) {
        setTableColumns((current) => ({ ...current, ...updates }));
      }
    }
  };

  const handleRowFilterChange = (value: string) => {
    setRowFilter(value);
    setPage(1);
  };

  const handleColumnFilterChange = (column: string, value: string) => {
    setColumnFilters((current) => ({ ...current, [column]: value }));
    setPage(1);
  };

  const toggleColumnPin = (column: string) => {
    if (!selectedTable) {
      return;
    }
    setPinnedColumnsByTable((current) => {
      const tablePins = { ...(current[selectedTable] ?? {}) };
      if (tablePins[column]) {
        delete tablePins[column];
      } else {
        tablePins[column] = true;
      }
      return { ...current, [selectedTable]: tablePins };
    });
  };

  const toggleColumnFilterMode = (column: string, mode: keyof ColumnFilterMode) => {
    if (!selectedTable) {
      return;
    }
    setColumnFilterModesByTable((current) => {
      const tableModes = { ...(current[selectedTable] ?? {}) };
      const columnModes = { ...(tableModes[column] ?? {}) };
      columnModes[mode] = !columnModes[mode];
      tableModes[column] = columnModes;
      return { ...current, [selectedTable]: tableModes };
    });
    setPage(1);
  };

  const handlePrevPage = () => {
    setPage((current) => Math.max(1, current - 1));
  };

  const handleNextPage = () => {
    setPage((current) => Math.min(pageCount, current + 1));
  };

  const handleFirstPage = () => setPage(1);

  const handleLastPage = () => setPage(pageCount);

  const commitPageDraft = () => {
    const parsed = Number.parseInt(pageDraft, 10);
    if (!Number.isFinite(parsed)) {
      setPageDraft(String(page));
      return;
    }
    const clamped = clamp(parsed, 1, pageCount);
    setPage(clamped);
  };

  const handleToggleColumnVisibility = (table: string, column: string) => {
    setHiddenColumnsByTable((current) => {
      const tableHidden = { ...(current[table] ?? {}) };
      if (tableHidden[column]) {
        delete tableHidden[column];
      } else {
        tableHidden[column] = true;
      }
      return { ...current, [table]: tableHidden };
    });
  };

  const handleBodyScroll = () => {
    updateGridScrollbarWidth();
    if (headerRef.current && gridBodyRef.current) {
      headerRef.current.scrollLeft = gridBodyRef.current.scrollLeft;
    }
  };

  const handleBack = () => {
    if (tableHistoryIndex <= 0) {
      return;
    }
    const nextIndex = tableHistoryIndex - 1;
    const nextTable = tableHistory[nextIndex];
    if (!nextTable) {
      return;
    }
    setSelectedTable(nextTable);
    setPage(1);
    setRowFilter("");
    setColumnFilters({});
    setTableHistoryIndex(nextIndex);
    setExpandedTables((current) => ({ ...current, [nextTable]: true }));
    if (dbRef.current && !tableColumns[nextTable]) {
      const columns = getSidebarColumns(dbRef.current, nextTable);
      setTableColumns((currentColumns) => ({
        ...currentColumns,
        [nextTable]: columns
      }));
    }
  };

  const handleForward = () => {
    if (tableHistoryIndex >= tableHistory.length - 1) {
      return;
    }
    const nextIndex = tableHistoryIndex + 1;
    const nextTable = tableHistory[nextIndex];
    if (!nextTable) {
      return;
    }
    setSelectedTable(nextTable);
    setPage(1);
    setRowFilter("");
    setColumnFilters({});
    setTableHistoryIndex(nextIndex);
    setExpandedTables((current) => ({ ...current, [nextTable]: true }));
    if (dbRef.current && !tableColumns[nextTable]) {
      const columns = getSidebarColumns(dbRef.current, nextTable);
      setTableColumns((currentColumns) => ({
        ...currentColumns,
        [nextTable]: columns
      }));
    }
  };

  const handleRefresh = () => {
    vscodeApi?.postMessage({ type: "webview:refresh" });
  };

  const showStatusMessage = (message: string) => {
    setStatusMessage(message);
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, 4000);
  };

  const requestSave = (bytes: Uint8Array) => {
    const saveId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = saveId;
    showStatusMessage("Saving...");
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      showStatusMessage("Save timed out.");
    }, 6000);
    vscodeApi?.postMessage({ type: "db:save", bytes, saveId });
  };

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current);
      }
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const closeSidebarMenu = () => setSidebarMenu(null);
  const closeRowMenu = () => setRowMenu(null);
  const closeAddRowModal = () => {
    setIsAddRowOpen(false);
    setNewRowValues({});
    setNewRowError(null);
  };

  const handleSidebarContextMenu = (event: ReactMouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(".tree-row") ||
      target?.closest(".sidebar-toolbar") ||
      target?.closest(".sidebar-section-header")
    ) {
      return;
    }
    event.preventDefault();
    setSidebarMenu({ x: event.clientX, y: event.clientY });
  };

  const handleTableContextMenu = (event: ReactMouseEvent, table: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSidebarMenu({ x: event.clientX, y: event.clientY, table });
  };

  const handleRowContextMenu = (
    event: ReactMouseEvent,
    row: RowData,
    displayIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    handleRowSelection(row, displayIndex, event);
    setRowMenu({ x: event.clientX, y: event.clientY, row });
  };

  const handleCreateTable = () => {
    closeSidebarMenu();
    setNewTableName("");
    setNewTableError(null);
    setIsAddTableOpen(true);
  };

  const closeAddTableModal = () => {
    setIsAddTableOpen(false);
    setNewTableError(null);
  };

  const handleCreateTableSubmit = () => {
    if (!dbRef.current) {
      setNewTableError("Database not ready.");
      return;
    }
    const trimmed = newTableName.trim();
    if (!trimmed) {
      setNewTableError("Table name is required.");
      return;
    }
    if (tables.some((table) => table.toLowerCase() === trimmed.toLowerCase())) {
      setNewTableError("A table with this name already exists.");
      return;
    }
    try {
      dbRef.current.exec(
        `CREATE TABLE ${quoteIdentifier(trimmed)} (id INTEGER PRIMARY KEY)`
      );
      const tableList = getTables(dbRef.current);
      setTables(tableList);
      setSelectedTable(trimmed);
      setPage(1);
      setRowFilter("");
      setColumnFilters({});
      setExpandedTables((current) => ({ ...current, [trimmed]: true }));
      setTableColumns((current) => ({
        ...current,
        [trimmed]: getSidebarColumns(dbRef.current as SqlJsDatabase, trimmed)
      }));
      setTableHistoryIndex((currentIndex) => {
        const nextIndex = currentIndex + 1;
        setTableHistory((current) => {
          const next = current.slice(0, nextIndex);
          next.push(trimmed);
          return next;
        });
        return nextIndex;
      });
      const bytes = dbRef.current.export();
      requestSave(bytes);
      setRefreshToken((current) => current + 1);
      closeAddTableModal();
      setNewTableName("");
    } catch (err) {
      setNewTableError(
        err instanceof Error ? err.message : "Table could not be created."
      );
    }
  };

  const handleAddColumn = (table: string) => {
    closeSidebarMenu();
    setColumnTargetTable(table);
    setNewColumnName("");
    setNewColumnType("TEXT");
    setNewColumnError(null);
    setIsAddColumnOpen(true);
  };

  const closeAddColumnModal = () => {
    setIsAddColumnOpen(false);
    setNewColumnError(null);
    setColumnTargetTable(null);
  };

  const handleAddColumnSubmit = () => {
    if (!dbRef.current || !columnTargetTable) {
      setNewColumnError("Database not ready.");
      return;
    }
    const trimmed = newColumnName.trim();
    if (!trimmed) {
      setNewColumnError("Column name is required.");
      return;
    }
    const existing = getColumnMeta(dbRef.current, columnTargetTable);
    if (existing.some((column) => column.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewColumnError("A column with this name already exists.");
      return;
    }
    try {
      dbRef.current.exec(
        `ALTER TABLE ${quoteIdentifier(columnTargetTable)} ADD COLUMN ${quoteIdentifier(
          trimmed
        )} ${newColumnType}`
      );
      setTableColumns((current) => ({
        ...current,
        [columnTargetTable]: getSidebarColumns(
          dbRef.current as SqlJsDatabase,
          columnTargetTable
        )
      }));
      setRefreshToken((current) => current + 1);
      const bytes = dbRef.current.export();
      requestSave(bytes);
      closeAddColumnModal();
      setNewColumnName("");
    } catch (err) {
      setNewColumnError(
        err instanceof Error ? err.message : "Column could not be added."
      );
    }
  };

  const handleDeleteTable = (table: string) => {
    closeSidebarMenu();
    setDeleteTargetTable(table);
    setIsDeleteTableOpen(true);
  };

  const closeDeleteTableModal = () => {
    setIsDeleteTableOpen(false);
    setDeleteTargetTable(null);
  };

  const handleDeleteTableConfirm = () => {
    if (!dbRef.current || !deleteTargetTable) {
      setIsDeleteTableOpen(false);
      return;
    }
    try {
      dbRef.current.exec(`DROP TABLE ${quoteIdentifier(deleteTargetTable)}`);
      const tableList = getTables(dbRef.current);
      setTables(tableList);
      setExpandedTables((current) => {
        const next = { ...current };
        delete next[deleteTargetTable];
        return next;
      });
      setTableColumns((current) => {
        const next = { ...current };
        delete next[deleteTargetTable];
        return next;
      });
      setHiddenColumnsByTable((current) => {
        const next = { ...current };
        delete next[deleteTargetTable];
        return next;
      });
      const nextTable = tableList[0] ?? "";
      setSelectedTable(nextTable);
      setTableHistory(nextTable ? [nextTable] : []);
      setTableHistoryIndex(nextTable ? 0 : -1);
      setPage(1);
      setRowFilter("");
      setColumnFilters({});
      setRefreshToken((current) => current + 1);
      const bytes = dbRef.current.export();
      requestSave(bytes);
    } catch (err) {
      showStatusMessage(
        err instanceof Error ? err.message : "Table could not be deleted."
      );
    } finally {
      closeDeleteTableModal();
    }
  };

  const getRowKey = (row: RowData) => {
    if (row.__rowId != null && Number.isFinite(row.__rowId)) {
      return `rowid:${row.__rowId}`;
    }
    return `index:${row.__rowIndex}`;
  };

  const handleRowPin = (row: RowData) => {
    const key = getRowKey(row);
    setPinnedRows((current) => {
      const next = { ...current };
      if (next[key]) {
        delete next[key];
        showStatusMessage("Row unpinned.");
      } else {
        next[key] = true;
        showStatusMessage("Row pinned.");
      }
      return next;
    });
  };

  const openRowEdit = (row: RowData, focusColumn?: string) => {
    if (!dbRef.current || !selectedTable) {
      showStatusMessage("Database not ready.");
      return;
    }
    if (row.__rowId == null) {
      showStatusMessage("Edit not supported (no ROWID).");
      return;
    }
    const key = getRowKey(row);
    setSelectedRow(row);
    setSelectedRowKeys({ [key]: true });
    const anchorIndex = displayIndexByKey.get(key);
    setSelectionAnchorIndex(anchorIndex ?? null);
    setEditFocusColumn(focusColumn ?? null);
    const nextValues: Record<string, string> = {};
    columns.forEach((column) => {
      nextValues[column.name] = formatCell(row[column.name]);
    });
    setEditRowValues(nextValues);
    setEditRowTarget(row);
    setEditRowError(null);
  };

  const closeEditRowModal = () => {
    setEditRowTarget(null);
    setEditFocusColumn(null);
    setEditRowValues({});
    setEditRowError(null);
  };

  const openAddRow = () => {
    if (!dbRef.current || !selectedTable) {
      showStatusMessage("Database not ready.");
      return;
    }
    if (!columns.length) {
      showStatusMessage("No columns to insert.");
      return;
    }
    const nextValues: Record<string, string> = {};
    columns.forEach((column) => {
      nextValues[column.name] = "";
    });
    setNewRowValues(nextValues);
    setNewRowError(null);
    setIsAddRowOpen(true);
  };

  const handleAddRowSubmit = () => {
    if (!dbRef.current || !selectedTable) {
      showStatusMessage("Database not ready.");
      return;
    }
    if (!columns.length) {
      setNewRowError("No columns to insert.");
      return;
    }
    try {
      const hasValues = columns.some(
        (column) => (newRowValues[column.name] ?? "").trim() !== ""
      );
      if (!hasValues) {
        dbRef.current.exec(
          `INSERT INTO ${quoteIdentifier(selectedTable)} DEFAULT VALUES`
        );
      } else {
        const insertColumns = columns.map((column) => quoteIdentifier(column.name));
        const placeholders = columns.map(() => "?");
        const params = columns.map((column) =>
          normalizeInputValue(newRowValues[column.name] ?? "", column.type)
        );
        dbRef.current.exec(
          `INSERT INTO ${quoteIdentifier(selectedTable)} (${insertColumns.join(
            ", "
          )}) VALUES (${placeholders.join(", ")})`,
          params
        );
      }
      setRefreshToken((current) => current + 1);
      requestSave(dbRef.current.export());
      showStatusMessage("Row added.");
      closeAddRowModal();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Row could not be added.";
      setNewRowError(message);
    }
  };

  const normalizeInputValue = (value: string, type: string) => {
    if (value === "") {
      return null;
    }
    const normalizedType = type.toUpperCase();
    if (
      normalizedType.includes("INT") ||
      normalizedType.includes("REAL") ||
      normalizedType.includes("NUM")
    ) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : value;
    }
    return value;
  };

  const handleEditRowSubmit = () => {
    if (!dbRef.current || !selectedTable || !editRowTarget) {
      showStatusMessage("Database not ready.");
      return;
    }
    if (editRowTarget.__rowId == null) {
      showStatusMessage("Edit not supported (no ROWID).");
      return;
    }
    try {
      const assignments = columns.map(
        (column) => `${quoteIdentifier(column.name)} = ?`
      );
      const params = columns.map((column) =>
        normalizeInputValue(editRowValues[column.name] ?? "", column.type)
      );
      params.push(editRowTarget.__rowId);
      dbRef.current.exec(
        `UPDATE ${quoteIdentifier(selectedTable)} SET ${assignments.join(", ")} WHERE rowid = ?`,
        params
      );
      setRefreshToken((current) => current + 1);
      requestSave(dbRef.current.export());
      showStatusMessage("Row updated.");
      closeEditRowModal();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Row could not be updated.";
      setEditRowError(message);
    }
  };

  const handleRowDelete = (row: RowData) => {
    if (!dbRef.current || !selectedTable) {
      showStatusMessage("Database not ready.");
      return;
    }
    if (row.__rowId == null) {
      showStatusMessage("Delete not supported (no ROWID).");
      return;
    }
    try {
      dbRef.current.exec(
        `DELETE FROM ${quoteIdentifier(selectedTable)} WHERE rowid = ?`,
        [row.__rowId]
      );
      setRefreshToken((current) => current + 1);
      requestSave(dbRef.current.export());
    } catch (err) {
      showStatusMessage(
        err instanceof Error ? err.message : "Row could not be deleted."
      );
    }
  };

  const startResize = (
    event: ReactPointerEvent,
    onMove: (deltaX: number) => void
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const body = document.body;
    const previousUserSelect = body.style.userSelect;
    body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      onMove(moveEvent.clientX - startX);
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      body.style.userSelect = previousUserSelect;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const handleSidebarResizeStart = (event: ReactPointerEvent) => {
    if (!isSidebarOpen) {
      setIsSidebarOpen(true);
    }
    const startWidth = sidebarWidth ?? getCssPx("--sidebar-width");
    const minWidth = getCssPx("--sidebar-min");
    const snapWidth = getCssPx("--sidebar-snap");
    const minMain = getCssPx("--main-min");
    startResize(event, (deltaX) => {
      const maxWidth = Math.max(minWidth, window.innerWidth - minMain);
      let nextWidth = clamp(startWidth + deltaX, minWidth, maxWidth);
      if (nextWidth <= snapWidth) {
        nextWidth = minWidth;
      }
      setSidebarWidth(nextWidth);
    });
  };

  const handleDetailsResizeStart = (event: ReactPointerEvent) => {
    if (!isDetailsOpen) {
      setIsDetailsOpen(true);
    }
    const startWidth = detailsWidth ?? getCssPx("--details-width");
    const minWidth = getCssPx("--details-min");
    const minMain = getCssPx("--main-min");
    startResize(event, (deltaX) => {
      const mainWidth = window.innerWidth - (sidebarWidth ?? getCssPx("--sidebar-width"));
      const maxWidth = Math.max(minWidth, mainWidth - minMain);
      const nextWidth = clamp(startWidth - deltaX, minWidth, maxWidth);
      setDetailsWidth(nextWidth);
    });
  };

  const handleColumnResizeStart = (
    event: ReactPointerEvent,
    column: ColumnMeta
  ) => {
    const minWidth = getCssPx("--col-min");
    const startWidth = columnWidths[column.name] ?? getDefaultColumnWidthPx(column);
    startResize(event, (deltaX) => {
      const nextWidth = Math.max(minWidth, startWidth + deltaX);
      setColumnWidths((current) => ({ ...current, [column.name]: nextWidth }));
    });
  };

  const handleIndexResizeStart = (event: ReactPointerEvent) => {
    const minWidth = getCssPx("--col-min");
    const startWidth = rowIndexWidth ?? getCssPx("--col-index");
    startResize(event, (deltaX) => {
      const nextWidth = Math.max(minWidth, startWidth + deltaX);
      setRowIndexWidth(nextWidth);
    });
  };

  const handleToggleSidebar = () => {
    if (isSidebarOpen) {
      const current = sidebarWidth ?? getCssPx("--sidebar-width");
      lastSidebarWidthRef.current = current;
      setSidebarWidth(0);
      setIsSidebarOpen(false);
    } else {
      const minWidth = getCssPx("--sidebar-min");
      const nextWidth = Math.max(
        minWidth,
        lastSidebarWidthRef.current ?? getCssPx("--sidebar-width")
      );
      setSidebarWidth(nextWidth);
      setIsSidebarOpen(true);
    }
  };

  const handleToggleDetails = () => {
    if (isDetailsOpen) {
      const current = detailsWidth ?? getCssPx("--details-width");
      lastDetailsWidthRef.current = current;
      setDetailsWidth(0);
      setIsDetailsOpen(false);
    } else {
      const minWidth = getCssPx("--details-min");
      const nextWidth = Math.max(
        minWidth,
        lastDetailsWidthRef.current ?? getCssPx("--details-width")
      );
      setDetailsWidth(nextWidth);
      setIsDetailsOpen(true);
    }
  };

  const handleSupportOpen = () => setIsSupportOpen(true);
  const closeSupportModal = () => setIsSupportOpen(false);

  const getExportRows = () => {
    const selected = displayRows.filter((row) => selectedRowKeys[getRowKey(row)]);
    if (selected.length) {
      return selected;
    }
    if (selectedRow) {
      return [selectedRow];
    }
    return displayRows;
  };

  const getExportColumns = () => visibleColumns;

  const escapeDelimited = (value: SqlValue, delimiter: string) => {
    const text = formatCell(value);
    const needsQuote =
      text.includes(delimiter) ||
      text.includes("\n") ||
      text.includes("\r") ||
      text.includes('"');
    if (!needsQuote) {
      return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
  };

  const toRowObject = (row: RowData) => {
    const result: Record<string, string> = {};
    getExportColumns().forEach((column) => {
      result[column.name] = formatCell(row[column.name]);
    });
    return result;
  };

  const exportAsDelimited = (delimiter: string) => {
    const columns = getExportColumns();
    const rowsToExport = getExportRows();
    const header = columns.map((col) => escapeDelimited(col.name, delimiter)).join(delimiter);
    const data = rowsToExport.map((row) =>
      columns.map((col) => escapeDelimited(row[col.name], delimiter)).join(delimiter)
    );
    return [header, ...data].join("\n");
  };

  const exportAsSqliteInsert = () => {
    const columns = getExportColumns();
    const rowsToExport = getExportRows();
    const tableName = selectedTable || "table";
    const columnList = columns.map((col) => quoteIdentifier(col.name)).join(", ");
    const valueList = rowsToExport
      .map((row) => {
        const values = columns
          .map((col) => toSqlLiteral(row[col.name]))
          .join(", ");
        return `INSERT INTO ${quoteIdentifier(tableName)} (${columnList}) VALUES (${values});`;
      })
      .join("\n");
    return valueList;
  };

  const exportAsJsonObject = () => {
    const rowsToExport = getExportRows();
    if (rowsToExport.length === 1) {
      return JSON.stringify(toRowObject(rowsToExport[0]), null, 2);
    }
    const entries = rowsToExport.map((row) => {
      const key =
        row.__rowId != null && Number.isFinite(row.__rowId)
          ? `rowid:${row.__rowId}`
          : `row:${row.__rowIndex}`;
      return [key, toRowObject(row)] as const;
    });
    return JSON.stringify(Object.fromEntries(entries), null, 2);
  };

  const exportAsJsonArray = () => {
    const rowsToExport = getExportRows();
    return JSON.stringify(rowsToExport.map(toRowObject), null, 2);
  };

  const exportAsHtml = () => {
    const columns = getExportColumns();
    const rowsToExport = getExportRows();
    const header = columns
      .map((col) => `<th>${escapeHtml(col.name)}</th>`)
      .join("");
    const body = rowsToExport
      .map((row) => {
        const cells = columns
          .map((col) => `<td>${escapeHtml(formatCell(row[col.name]))}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
  };

  const exportAsMarkdown = () => {
    const columns = getExportColumns();
    const rowsToExport = getExportRows();
    const header = `| ${columns.map((col) => escapeMarkdown(col.name)).join(" | ")} |`;
    const divider = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rowsToExport.map((row) => {
      return `| ${columns
        .map((col) => escapeMarkdown(formatCell(row[col.name])))
        .join(" | ")} |`;
    });
    return [header, divider, ...body].join("\n");
  };

  const getExportPayload = (format: CopyFormat) => {
    switch (format) {
      case "Excel": {
        const csv = exportAsDelimited(",");
        return {
          text: `\ufeff${csv}`,
          ext: "csv"
        };
      }
      case "CSV":
        return { text: exportAsDelimited(","), ext: "csv" };
      case "TSV":
        return { text: exportAsDelimited("\t"), ext: "tsv" };
      case "SQLite Insert":
        return { text: exportAsSqliteInsert(), ext: "sql" };
      case "JSON Object":
        return { text: exportAsJsonObject(), ext: "json" };
      case "JSON Array":
        return { text: exportAsJsonArray(), ext: "json" };
      case "HTML":
        return { text: exportAsHtml(), ext: "html" };
      case "Markdown":
        return { text: exportAsMarkdown(), ext: "md" };
      default:
        return { text: exportAsDelimited(","), ext: "txt" };
    }
  };

  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  const handleCopyFormatSelect = (format: CopyFormat) => {
    setCopyFormat(format);
    setIsCopyMenuOpen(false);
    showStatusMessage(`Copy format: ${format}`);
  };

  const handleCopyCurrent = async () => {
    const { text } = getExportPayload(copyFormat);
    if (!text) {
      showStatusMessage("Nothing to copy.");
      return;
    }
    try {
      await copyToClipboard(text);
      showStatusMessage(`Copied as ${copyFormat}`);
    } catch (err) {
      showStatusMessage("Copy failed.");
    }
  };

  const handleSaveAs = () => {
    const { text, ext } = getExportPayload(copyFormat);
    if (!text) {
      showStatusMessage("Nothing to save.");
      return;
    }
    const name = (selectedTable || "export").replace(/[^\w\-]+/g, "_");
    const fileName = `${name}.${ext}`;
    if (vscodeApi) {
      showStatusMessage(`Saving ${fileName}...`);
      vscodeApi.postMessage({
        type: "export:save",
        name: fileName,
        text
      });
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showStatusMessage(`Saved ${fileName}`);
  };

  const hasExpanded = useMemo(
    () => filteredTables.some((table) => expandedTables[table]),
    [filteredTables, expandedTables]
  );

  const versionLabel = appVersion ? `v${appVersion}` : "";
  const sidebarMin = getCssPx("--sidebar-min");
  const sidebarCurrentWidth = isSidebarOpen
    ? sidebarWidth ?? getCssPx("--sidebar-width")
    : 0;
  const isSidebarCompact = isSidebarOpen && sidebarCurrentWidth <= sidebarMin + 1;
  const isSidebarHidden = !isSidebarOpen;
  const isDetailsHidden = !isDetailsOpen;
  const rowsLabel = rowCount ? rowCount.toString() : "-";
  const rowIndexWidthPx = rowIndexWidth ?? getCssPx("--col-index");
  const iconButtonSize = getCssPx("--icon-button-size");
  const rowIndexMode = !showRowIndex
    ? "hidden"
    : rowIndexWidthPx <= iconButtonSize * 1.2
      ? "icon"
      : rowIndexWidthPx <= iconButtonSize * 2.6
        ? "compact"
        : "full";
  const rowHeightPx = getCssPx("--grid-row-height");
  const canAddRow = Boolean(selectedTable) && Boolean(dbRef.current);
  const addRowNumber = Math.max(1, rowCount + 1);
  const statusRightLabel =
    status === "error" ? "Load failed" : statusMessage ?? "";

  const layoutStyle = useMemo(() => {
    const style: Record<string, string> = {};
    if (sidebarWidth !== null) {
      style["--sidebar-width"] = `${sidebarWidth}px`;
    }
    if (detailsWidth !== null) {
      style["--details-width"] = `${detailsWidth}px`;
    }
    return style as CSSProperties;
  }, [sidebarWidth, detailsWidth]);

  const pinnedOrder = useMemo(() => {
    const order = new Map<string, number>();
    let count = 0;
    rows.forEach((row) => {
      const key = getRowKey(row);
      if (pinnedRows[key]) {
        order.set(key, count);
        count += 1;
      }
    });
    return { order, count };
  }, [rows, pinnedRows]);

  const displayRows = useMemo(() => {
    if (!Object.keys(pinnedRows).length) {
      return rows;
    }
    const pinned = rows.filter((row) => pinnedRows[getRowKey(row)]);
    const rest = rows.filter((row) => !pinnedRows[getRowKey(row)]);
    return [...pinned, ...rest];
  }, [rows, pinnedRows]);

  const displayIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    displayRows.forEach((row, index) => {
      map.set(getRowKey(row), index);
    });
    return map;
  }, [displayRows]);

  const handleRowSelection = (
    row: RowData,
    displayIndex: number,
    event: ReactMouseEvent
  ) => {
    const key = getRowKey(row);
    if (event.shiftKey && selectionAnchorIndex !== null) {
      const start = Math.min(selectionAnchorIndex, displayIndex);
      const end = Math.max(selectionAnchorIndex, displayIndex);
      const nextSelection: Record<string, boolean> = {};
      for (let i = start; i <= end; i += 1) {
        const target = displayRows[i];
        if (target) {
          nextSelection[getRowKey(target)] = true;
        }
      }
      setSelectedRowKeys(nextSelection);
      setSelectedRow(row);
      return;
    }
    setSelectedRow(row);
    setSelectedRowKeys({ [key]: true });
    setSelectionAnchorIndex(displayIndex);
  };

  if (!hasDatabase && status === "loading") {
    return (
      <div className="app-root app-loading">
        <div className="loading-card">
          <span className="codicon codicon-loading codicon-modifier-spin"></span>
          <span>Loading database...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-root ${
        rowIndexMode === "compact"
          ? "row-index-compact"
          : rowIndexMode === "icon"
            ? "row-index-icon"
            : ""
      }`}
      ref={appRootRef}
      style={layoutStyle}
    >
      <aside
        className={`sidebar ${isSidebarCompact ? "compact" : ""} ${
          isSidebarHidden ? "is-hidden" : ""
        }`}
        onContextMenu={handleSidebarContextMenu}
      >
        <div className="sidebar-toolbar">
          <div className="sidebar-toolbar-actions">
            <button
              className="icon-button is-refresh"
              aria-label="Refresh"
              title="Refresh"
              onClick={handleRefresh}
            >
              <span className="codicon codicon-refresh" title="Refresh"></span>
            </button>
            <button
              className="icon-button"
              aria-label="Back"
              title="Back"
              onClick={handleBack}
              disabled={tableHistoryIndex <= 0}
            >
              <span className="codicon codicon-arrow-left" title="Back"></span>
            </button>
            <button
              className="icon-button"
              aria-label="Forward"
              title="Forward"
              onClick={handleForward}
              disabled={tableHistoryIndex >= tableHistory.length - 1}
            >
              <span className="codicon codicon-arrow-right" title="Forward"></span>
            </button>
          </div>
          <div className="sidebar-toolbar-filter">
            <input
              className="input sidebar-input"
              placeholder={`Filter ${tables.length} tables...`}
              aria-label="Filter tables"
              title={`Filter ${tables.length} tables`}
              value={tableFilter}
              onChange={(event) => setTableFilter(event.target.value)}
            />
          </div>
        </div>
        <div className="sidebar-section-header">
          <span className="sidebar-title" title="TABLES">
            TABLES
          </span>
          <div className="sidebar-actions">
            <button
              className="icon-button"
              aria-label={hasExpanded ? "Collapse all" : "Expand all"}
              title={hasExpanded ? "Collapse all" : "Expand all"}
              onClick={handleToggleAll}
            >
              <span
                className={`codicon ${
                  hasExpanded ? "codicon-collapse-all" : "codicon-expand-all"
                }`}
              ></span>
            </button>
          </div>
        </div>
        <div className="sidebar-tree">
          {filteredTables.length === 0 ? (
            <div className="sidebar-empty">
              {status === "loading" ? "Loading database..." : "No tables"}
            </div>
          ) : (
            filteredTables.map((table) => {
              const expanded = Boolean(expandedTables[table]);
              const columns = tableColumns[table] ?? [];
              const hiddenColumnsForTable = hiddenColumnsByTable[table] ?? {};
              return (
                <div key={table} className="tree-group">
                  <div
                    className={`tree-row tree-table ${
                      table === selectedTable ? "is-active" : ""
                    }`}
                    onClick={() => handleTableSelect(table)}
                    onContextMenu={(event) => handleTableContextMenu(event, table)}
                    title={`Table: ${table}`}
                  >
                    <button
                      className="tree-toggle"
                      aria-label={expanded ? "Collapse table" : "Expand table"}
                      title={expanded ? "Collapse table" : "Expand table"}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleTableToggle(table);
                      }}
                    >
                      <span
                        className={`codicon ${
                          expanded ? "codicon-chevron-down" : "codicon-chevron-right"
                        }`}
                      ></span>
                    </button>
                    <span className="codicon codicon-database" title="Table"></span>
                    <span className="tree-label" title={table}>
                      {table}
                    </span>
                  </div>
                  {expanded ? (
                    <div className="tree-children">
                      {columns.length === 0 ? (
                        <div className="tree-row tree-column is-empty">No columns</div>
                      ) : (
                        columns.map((column) => {
                          const isHidden = column.isRowId
                            ? Boolean(hiddenColumnsForTable[ROW_INDEX_KEY])
                            : Boolean(hiddenColumnsForTable[column.name]);
                          const typeLabel = column.isRowId ? "ROWID" : column.type || "TEXT";
                          return (
                            <div
                              key={`${table}-${column.name}`}
                              className={`tree-row tree-column ${isHidden ? "is-hidden" : ""}`}
                            >
                              <span className="tree-indent"></span>
                              <span
                                className={`codicon ${getColumnIcon(column)}`}
                                title={typeLabel}
                              ></span>
                              <span
                                className="tree-label"
                                title={column.isRowId ? "ROWID" : column.name}
                              >
                                {column.isRowId ? "" : column.name}
                              </span>
                              <span className="tree-actions">
                                {column.pk ? (
                                  <span
                                    className="codicon codicon-key"
                                    title="Primary Key (1/1)"
                                  ></span>
                                ) : null}
                                <button
                                  className="tree-action-button"
                                  aria-label={isHidden ? "Show Column" : "Hide Column"}
                                  title={isHidden ? "Show Column" : "Hide Column"}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleToggleColumnVisibility(
                                      table,
                                      column.isRowId ? ROW_INDEX_KEY : column.name
                                    );
                                  }}
                                >
                                  <span
                                    className={`codicon ${
                                      isHidden ? "codicon-eye-closed" : "codicon-eye"
                                    }`}
                                    title={isHidden ? "Show Column" : "Hide Column"}
                                  ></span>
                                </button>
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        {!isSidebarHidden ? (
          <div
            className="resizer sidebar-resizer"
            onPointerDown={handleSidebarResizeStart}
          ></div>
        ) : null}
        <div className="sidebar-footer">
          <div className="sidebar-footer-left">
            <span className="icon-slot" title={appName}>
              <span className="codicon codicon-database"></span>
            </span>
            <span className="sidebar-footer-title" title={appName}>
              {appName}
            </span>
          </div>
          <span className="sidebar-footer-version" title={versionLabel}>
            {versionLabel}
          </span>
        </div>
      </aside>
      {rowMenu ? (
        <div
          className="context-menu-backdrop"
          onClick={closeRowMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeRowMenu();
          }}
        >
          <div
            className="context-menu"
            style={{ left: rowMenu.x, top: rowMenu.y }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              className="context-menu-item"
              role="menuitem"
              onClick={() => {
                closeRowMenu();
                openRowEdit(rowMenu.row);
              }}
            >
              <span className="codicon codicon-edit"></span>
              <span>Edit row</span>
            </button>
            <button
              className="context-menu-item"
              role="menuitem"
              onClick={() => {
                closeRowMenu();
                handleRowPin(rowMenu.row);
              }}
            >
              <span
                className={`codicon ${
                  pinnedRows[getRowKey(rowMenu.row)] ? "codicon-pinned" : "codicon-pin"
                }`}
              ></span>
              <span>
                {pinnedRows[getRowKey(rowMenu.row)] ? "Unpin row" : "Pin row"}
              </span>
            </button>
            <button
              className="context-menu-item"
              role="menuitem"
              onClick={() => {
                closeRowMenu();
                handleRowDelete(rowMenu.row);
              }}
            >
              <span className="codicon codicon-trash"></span>
              <span>Delete row</span>
            </button>
          </div>
        </div>
      ) : null}
      {sidebarMenu ? (
        <div
          className="context-menu-backdrop"
          onClick={closeSidebarMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeSidebarMenu();
          }}
        >
          <div
            className="context-menu"
            style={{ left: sidebarMenu.x, top: sidebarMenu.y }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {sidebarMenu.table ? (
              <>
                <button
                  className="context-menu-item"
                  role="menuitem"
                  onClick={() => handleAddColumn(sidebarMenu.table as string)}
                >
                  <span className="codicon codicon-add"></span>
                  <span>Add column</span>
                </button>
                <button
                  className="context-menu-item"
                  role="menuitem"
                  onClick={() => handleDeleteTable(sidebarMenu.table as string)}
                >
                  <span className="codicon codicon-trash"></span>
                  <span>Delete table</span>
                </button>
              </>
            ) : (
              <button
                className="context-menu-item"
                role="menuitem"
                onClick={handleCreateTable}
              >
                <span className="codicon codicon-add"></span>
                <span>Add new</span>
              </button>
            )}
          </div>
        </div>
      ) : null}
      {isAddTableOpen ? (
        <div
          className="modal-backdrop"
          onClick={closeAddTableModal}
        >
          <form
            className="modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateTableSubmit();
            }}
          >
            <div className="modal-title">New table</div>
            <label className="modal-label" htmlFor="new-table-name">
              Table name
            </label>
            <input
              id="new-table-name"
              className="input modal-input"
              placeholder="Table name"
              autoFocus
              value={newTableName}
              onChange={(event) => setNewTableName(event.target.value)}
            />
            {newTableError ? (
              <div className="modal-error">{newTableError}</div>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="icon-button"
                onClick={closeAddTableModal}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {isAddColumnOpen ? (
        <div
          className="modal-backdrop"
          onClick={closeAddColumnModal}
        >
          <form
            className="modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              handleAddColumnSubmit();
            }}
          >
            <div className="modal-title">Add column</div>
            <label className="modal-label" htmlFor="new-column-name">
              Column name
            </label>
            <input
              id="new-column-name"
              className="input modal-input"
              placeholder="Column name"
              autoFocus
              value={newColumnName}
              onChange={(event) => setNewColumnName(event.target.value)}
            />
            <label className="modal-label" htmlFor="new-column-type">
              Column type
            </label>
            <select
              id="new-column-type"
              className="input modal-input"
              value={newColumnType}
              onChange={(event) => setNewColumnType(event.target.value)}
            >
              <option value="TEXT">TEXT</option>
              <option value="INTEGER">INTEGER</option>
              <option value="REAL">REAL</option>
              <option value="BLOB">BLOB</option>
              <option value="NUMERIC">NUMERIC</option>
              <option value="DATETIME">DATETIME</option>
            </select>
            {newColumnError ? (
              <div className="modal-error">{newColumnError}</div>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="icon-button"
                onClick={closeAddColumnModal}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Add
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {isDeleteTableOpen ? (
        <div
          className="modal-backdrop"
          onClick={closeDeleteTableModal}
        >
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-title">Delete table</div>
            <div className="modal-label">
              Are you sure you want to delete
              {deleteTargetTable ? ` "${deleteTargetTable}"` : ""}?
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="icon-button"
                onClick={closeDeleteTableModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleDeleteTableConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isAddRowOpen ? (
        <div className="modal-backdrop" onClick={closeAddRowModal}>
          <form
            className="modal modal-wide"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              handleAddRowSubmit();
            }}
          >
            <div className="modal-title">Add row</div>
            <div className="modal-body">
              {columns.length ? (
                columns.map((column) => (
                  <div key={column.name} className="detail-card">
                    <div className="detail-label" title={column.name}>
                      {column.name}
                    </div>
                    <input
                      className="input modal-input"
                      value={newRowValues[column.name] ?? ""}
                      onChange={(event) =>
                        setNewRowValues((current) => ({
                          ...current,
                          [column.name]: event.target.value
                        }))
                      }
                    />
                    <div className="detail-meta">
                      <span className="muted">NEW</span>
                      <span className="muted" title={column.type || "TEXT"}>
                        {column.type || "TEXT"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="details-empty">No columns</div>
              )}
            </div>
            {newRowError ? <div className="modal-error">{newRowError}</div> : null}
            <div className="modal-actions">
              <button type="button" className="icon-button" onClick={closeAddRowModal}>
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {editRowTarget ? (
        <div className="modal-backdrop" onClick={closeEditRowModal}>
          <form
            className="modal modal-wide"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              handleEditRowSubmit();
            }}
          >
            <div className="modal-title">Edit row</div>
            <div className="modal-meta">
              <span className="muted">Row {editRowTarget.__rowIndex}</span>
              {editRowTarget.__rowId != null ? (
                <span className="muted">ROWID {editRowTarget.__rowId}</span>
              ) : null}
            </div>
            <div className="modal-body">
              {columns.length ? (
                columns.map((column, index) => (
                  <div key={column.name} className="detail-card">
                    <div className="detail-label" title={column.name}>
                      {column.name}
                    </div>
                    <input
                      className="input modal-input"
                      value={editRowValues[column.name] ?? ""}
                      autoFocus={
                        editFocusColumn
                          ? column.name === editFocusColumn
                          : index === 0
                      }
                      onChange={(event) =>
                        setEditRowValues((current) => ({
                          ...current,
                          [column.name]: event.target.value
                        }))
                      }
                    />
                    <div className="detail-meta">
                      <span className="muted">EDITABLE</span>
                      <span className="muted" title={column.type || "TEXT"}>
                        {column.type || "TEXT"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="details-empty">No columns</div>
              )}
            </div>
            {editRowError ? <div className="modal-error">{editRowError}</div> : null}
            <div className="modal-actions">
              <button type="button" className="icon-button" onClick={closeEditRowModal}>
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
        {isSupportOpen ? (
          <div className="modal-backdrop" onClick={closeSupportModal}>
            <div
              className="modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-title">Buy me a coffee</div>
              <div className="support-wallets" role="tablist" aria-label="Wallets">
                {SUPPORT_WALLETS.map((wallet) => (
                  <button
                    key={wallet.key}
                    type="button"
                    className={`support-wallet-button ${
                      wallet.key === selectedWalletKey ? "is-active" : ""
                    }`}
                    aria-pressed={wallet.key === selectedWalletKey}
                    onClick={() => setSelectedWalletKey(wallet.key)}
                  >
                    {wallet.label}
                  </button>
                ))}
              </div>
              <div className="support-card support-card-modal">
                <div className="support-qr">
                  {supportQr ? (
                    <img src={supportQr} alt="Wallet QR Code" />
                  ) : (
                    <div className="support-qr-placeholder">QR</div>
                  )}
                </div>
                <div className="support-meta">
                  <div className="support-label">Wallet</div>
                  <div className="support-value" title={supportWallet}>
                    {supportWallet}
                  </div>
                  <div className="support-label">Network</div>
                  <div className="support-value" title={supportNetwork}>
                    {supportNetwork}
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={closeSupportModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

      <main className="main">
        <div className="toolbar">
          <div className="toolbar-left">
            <span className="muted">Rows:</span>
            <span title={`Rows: ${rowsLabel}`}>{rowsLabel}</span>
          </div>
          <div className="toolbar-center">
            <input
              className="input"
              placeholder={`Filter ${rowsLabel} rows...`}
              aria-label="Filter rows"
              title={`Filter ${rowsLabel} rows`}
              value={rowFilter}
              onChange={(event) => handleRowFilterChange(event.target.value)}
            />
          </div>
          <div className="toolbar-right">
            <button
              className={`icon-button ${isSidebarOpen ? "is-active" : ""}`}
              aria-label={isSidebarOpen ? "Hide left sidebar" : "Show left sidebar"}
              title={isSidebarOpen ? "Hide left sidebar" : "Show left sidebar"}
              aria-pressed={isSidebarOpen}
              onClick={handleToggleSidebar}
            >
              <span
                className={`codicon ${
                  isSidebarOpen
                    ? "codicon-layout-sidebar-left"
                    : "codicon-layout-sidebar-left-off"
                }`}
              ></span>
            </button>
            <button
              className={`icon-button ${isDetailsOpen ? "is-active" : ""}`}
              aria-label={isDetailsOpen ? "Hide right sidebar" : "Show right sidebar"}
              title={isDetailsOpen ? "Hide right sidebar" : "Show right sidebar"}
              aria-pressed={isDetailsOpen}
              onClick={handleToggleDetails}
            >
              <span
                className={`codicon ${
                  isDetailsOpen
                    ? "codicon-layout-sidebar-right"
                    : "codicon-layout-sidebar-right-off"
                }`}
              ></span>
            </button>
          </div>
        </div>

        <div className="content">
          <section className="grid-panel">
            <div className="grid-header-scroll">
              <div className="grid-header-viewport" ref={headerRef}>
                <div className="grid-header" style={{ gridTemplateColumns: gridTemplate }}>
                {showRowIndex ? (
                  <div className="grid-cell header-cell row-index action-column">
                    <div className="row-index-header"></div>
                    <div
                      className="column-resizer"
                      onPointerDown={handleIndexResizeStart}
                    ></div>
                  </div>
                ) : null}
                {visibleColumns.map((column) => (
                  <div
                    key={column.name}
                    className={`grid-cell header-cell ${
                      columnPins[column.name] ? "is-pinned-col" : ""
                    }`}
                  >
                    <div className="header-top">
                      <span className="header-title" title={column.name}>
                        {column.name}
                      </span>
                      <span className="header-icons">
                        {column.pk ? (
                          <span
                            className="codicon codicon-key"
                            title="Primary Key"
                          ></span>
                        ) : null}
                        <span
                          className={`codicon ${getColumnIcon(column)}`}
                          title={column.type || "TEXT"}
                        ></span>
                        <button
                          className={`header-icon-button ${
                            columnPins[column.name] ? "is-active" : ""
                          }`}
                          title={
                            columnPins[column.name] ? "Unpin column" : "Pin column"
                          }
                          aria-label={
                            columnPins[column.name] ? "Unpin column" : "Pin column"
                          }
                          aria-pressed={Boolean(columnPins[column.name])}
                          onClick={() => toggleColumnPin(column.name)}
                        >
                          <span
                            className={`codicon ${
                              columnPins[column.name] ? "codicon-pinned" : "codicon-pin"
                            }`}
                          ></span>
                        </button>
                      </span>
                    </div>
                    <div className="header-filter-row">
                      <div className="header-filter-group">
                        <input
                          className="header-filter-input"
                          placeholder="Filter..."
                          title={`Filter ${column.name}`}
                          value={columnFilters[column.name] ?? ""}
                          onChange={(event) =>
                            handleColumnFilterChange(column.name, event.target.value)
                          }
                        />
                        <div className="header-filter-icons">
                          <button
                            className={`header-icon-button ${
                              columnFilterModes[column.name]?.exact ? "is-active" : ""
                            }`}
                            title="Exact match"
                            aria-label="Exact match"
                            aria-pressed={Boolean(
                              columnFilterModes[column.name]?.exact
                            )}
                            onClick={() =>
                              toggleColumnFilterMode(column.name, "exact")
                            }
                          >
                            <span className="codicon codicon-whole-word"></span>
                          </button>
                          <button
                            className={`header-icon-button ${
                              columnFilterModes[column.name]?.nonEmpty ? "is-active" : ""
                            }`}
                            title="Non-empty"
                            aria-label="Non-empty"
                            aria-pressed={Boolean(
                              columnFilterModes[column.name]?.nonEmpty
                            )}
                            onClick={() =>
                              toggleColumnFilterMode(column.name, "nonEmpty")
                            }
                          >
                            <span className="codicon codicon-check"></span>
                          </button>
                          <button
                            className={`header-icon-button ${
                              columnFilterModes[column.name]?.invert ? "is-active" : ""
                            }`}
                            title="Invert"
                            aria-label="Invert"
                            aria-pressed={Boolean(
                              columnFilterModes[column.name]?.invert
                            )}
                            onClick={() =>
                              toggleColumnFilterMode(column.name, "invert")
                            }
                          >
                            <span className="codicon codicon-circle-slash"></span>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div
                      className="column-resizer"
                      onPointerDown={(event) => handleColumnResizeStart(event, column)}
                    ></div>
                  </div>
                ))}
                </div>
              </div>
            </div>

            <div
              className={`grid-body ${rows.length === 0 ? "is-empty" : ""}`}
              ref={gridBodyRef}
              onScroll={handleBodyScroll}
            >
              {rows.length === 0 && !canAddRow ? (
                <div className="grid-empty">
                  {status === "loading"
                    ? "Loading database..."
                    : status === "error"
                      ? error ?? "Error"
                      : "No data"}
                </div>
              ) : null}
              {displayRows.map((row, displayIndex) => {
                const rowKey = getRowKey(row);
                const pinnedIndex = pinnedOrder.order.get(rowKey);
                const isPinned = pinnedIndex !== undefined;
                const rowNumber = displayIndex + 1;
                const pinnedStyle: CSSProperties | undefined =
                  isPinned && rowHeightPx > 0
                    ? {
                        position: "sticky",
                        top: `${pinnedIndex * rowHeightPx}px`,
                        zIndex: 3 + (pinnedOrder.count - pinnedIndex)
                      }
                    : undefined;
                return (
                  <div
                    key={row.__rowIndex}
                    className={`grid-row ${
                      selectedRowKeys[getRowKey(row)] ? "is-selected" : ""
                    } ${isPinned ? "is-pinned" : ""} ${
                      displayIndex % 2 === 1 ? "is-zebra" : ""
                    }`}
                    onClick={(event) => handleRowSelection(row, displayIndex, event)}
                    onContextMenu={(event) =>
                      handleRowContextMenu(event, row, displayIndex)
                    }
                    style={{
                      gridTemplateColumns: gridTemplate,
                      ...(pinnedStyle ?? {})
                    }}
                  >
                    {showRowIndex ? (
                      <div
                        className="grid-cell row-index action-column"
                        title={`Row ${rowNumber}`}
                      >
                        <div className="row-index-content">
                          <span className="row-actions">
                            <button
                              className="row-action"
                              title="Edit row"
                              aria-label="Edit row"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRowEdit(row);
                              }}
                            >
                              <span className="codicon codicon-open-preview"></span>
                            </button>
                            <button
                              className="row-action"
                              title={isPinned ? "Unpin row" : "Pin row"}
                              aria-label={isPinned ? "Unpin row" : "Pin row"}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRowPin(row);
                              }}
                            >
                              <span
                                className={`codicon ${
                                  isPinned ? "codicon-pinned" : "codicon-pin"
                                }`}
                              ></span>
                            </button>
                            <button
                              className="row-action"
                              title="Delete row"
                              aria-label="Delete row"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRowDelete(row);
                              }}
                            >
                              <span className="codicon codicon-trash"></span>
                            </button>
                          </span>
                          <span className="row-index-value">{rowNumber}</span>
                        </div>
                      </div>
                    ) : null}
                    {visibleColumns.map((column) => (
                      <div
                        key={column.name}
                        className={`grid-cell mono ${
                          columnPins[column.name] ? "is-pinned-col" : ""
                        }`}
                        title={formatCell(row[column.name])}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          openRowEdit(row, column.name);
                        }}
                      >
                        {formatCell(row[column.name])}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {canAddRow && showRowIndex ? (
              <div className="grid-add-row-overlay" aria-hidden="true">
                <div
                  className="grid-add-row-cell"
                  style={{ width: `${rowIndexWidthPx}px` }}
                  title="Add new row"
                >
                  <div className="row-index-content">
                    <span className="row-actions">
                      <button
                        className="row-action"
                        title="Add row"
                        aria-label="Add row"
                        onClick={(event) => {
                          event.stopPropagation();
                          openAddRow();
                        }}
                      >
                        <span className="codicon codicon-add"></span>
                      </button>
                    </span>
                    <span className="row-index-value">{addRowNumber}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <aside className={`details ${isDetailsHidden ? "is-hidden" : ""}`}>
            {!isDetailsHidden ? (
              <div
                className="resizer details-resizer"
                onPointerDown={handleDetailsResizeStart}
              ></div>
            ) : null}
            <div className="details-header">
              <span className="details-title" title="SELECTION">
                SELECTION
              </span>
            </div>
          <div className="details-body">
            {selectedRow ? (
              visibleColumns.map((column) => (
                <div key={column.name} className="detail-card">
                  <div className="detail-label" title={column.name}>
                    {column.name}
                  </div>
                  <div
                    className="detail-input"
                    title={formatCell(selectedRow[column.name])}
                  >
                    {formatCell(selectedRow[column.name])}
                  </div>
                  <div className="detail-meta">
                    <span className="muted" title="READONLY">
                      READONLY
                    </span>
                    <span className="muted" title={column.type || "TEXT"}>
                      {column.type || "TEXT"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="details-empty">No selection</div>
            )}
            </div>
          </aside>
        </div>

        <div className="status-row">
          <div className="status-bar">
            <div className="status-left">
              <div className="status-left-group">
                <div className="status-nav status-nav-left">
                  <button
                    className="status-button"
                    aria-label="First page"
                    title="First page"
                    onClick={handleFirstPage}
                    disabled={page <= 1}
                  >
                    <span className="codicon codicon-triangle-left"></span>
                  </button>
                  <button
                    className="status-button"
                    aria-label="Previous page"
                    title="Previous page"
                    onClick={handlePrevPage}
                    disabled={page <= 1}
                  >
                    <span className="codicon codicon-chevron-left"></span>
                  </button>
                </div>
                <div className="status-input-wrap">
                  <input
                    className="status-input"
                    value={pageDraft}
                    onChange={(event) => setPageDraft(event.target.value)}
                    onBlur={commitPageDraft}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitPageDraft();
                      }
                    }}
                    style={{ width: `${pageInputWidthCh}ch` }}
                    aria-label="Page number"
                  />
                </div>
                <div className="status-nav status-nav-right">
                  <button
                    className="status-button"
                    aria-label="Next page"
                    title="Next page"
                    onClick={handleNextPage}
                    disabled={page >= pageCount}
                  >
                    <span className="codicon codicon-chevron-right"></span>
                  </button>
                  <button
                    className="status-button"
                    aria-label="Last page"
                    title="Last page"
                    onClick={handleLastPage}
                    disabled={page >= pageCount}
                  >
                    <span className="codicon codicon-triangle-right"></span>
                  </button>
                </div>
                <span className="status-page" title={`Page ${page} / ${pageCount}`}>
                  Page {page} / {pageCount}
                </span>
              </div>
            </div>
            <div className="status-center" title={statusRightLabel}>
              {statusRightLabel}
            </div>
          <div className="status-right">
            <span className="status-label" title="Copy as">
              Copy as
            </span>
            <div className="status-menu" ref={copyMenuRef}>
              <button
                className="status-select"
                aria-label={`Copy as ${copyFormat}`}
                title={`Copy as ${copyFormat}`}
                onClick={() => setIsCopyMenuOpen((current) => !current)}
              >
                <span>{copyFormat}</span>
                <span className="codicon codicon-chevron-down"></span>
              </button>
              {isCopyMenuOpen ? (
                <div className="status-menu-list" role="menu">
                  {COPY_FORMATS.map((format) => (
                    <button
                      key={format}
                      type="button"
                      className={`status-menu-item ${
                        format === copyFormat ? "is-active" : ""
                      }`}
                      role="menuitem"
                      onClick={() => handleCopyFormatSelect(format)}
                    >
                      <span className="status-menu-check">
                        {format === copyFormat ? (
                          <span className="codicon codicon-check"></span>
                        ) : null}
                      </span>
                      <span>{format}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              className="icon-button status-action"
              aria-label="Copy"
              title="Copy"
              onClick={() => void handleCopyCurrent()}
            >
              <span className="codicon codicon-copy"></span>
            </button>
            <button
              className="icon-button status-action"
              aria-label="Save as"
              title="Save as"
              onClick={handleSaveAs}
            >
              <span className="codicon codicon-save-as"></span>
            </button>
          </div>
        </div>
          <div className={`details-footer-bar ${isDetailsHidden ? "is-hidden" : ""}`}>
            <button
              type="button"
              className="support-link-button"
              title="Buy me a coffee"
              onClick={handleSupportOpen}
            >
              Buy me a coffee
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = import("sql.js")
      .then((mod) => mod.default)
      .then((init) => init({ locateFile: () => wasmUrl }) as Promise<SqlJsStatic>);
  }
  return sqlPromise;
}

function getDefaultColumnWidthPx(column: ColumnMeta): number {
  if (typeof document === "undefined") {
    return 120;
  }
  const baseWidth = getMinHeaderWidthPx(column);
  return Math.ceil(baseWidth);
}

function getMinHeaderWidthPx(column: ColumnMeta): number {
  const unit = getCssPx("--unit");
  const iconSize = getCssPx("--icon-size");
  const iconButtonSize = getCssPx("--icon-button-size") * 0.8;
  const cellPaddingX = unit * 1.2;
  const titleIconGap = unit;
  const iconGap = unit;
  const extra = 70;

  const titleWidth = measureHeaderText(column.name);
  const iconWidths: number[] = [];
  if (column.pk) {
    iconWidths.push(iconSize);
  }
  iconWidths.push(iconSize);
  iconWidths.push(iconButtonSize);
  const iconsWidth =
    iconWidths.reduce((sum, value) => sum + value, 0) +
    iconGap * Math.max(0, iconWidths.length - 1);

  const headerTopWidth =
    titleWidth + titleIconGap + iconsWidth + cellPaddingX * 2 + extra;

  const filterIconGap = unit * 0.4;
  const filterIconsWidth = iconButtonSize * 3 + filterIconGap * 2;
  const filterRowWidth = filterIconsWidth + unit + cellPaddingX * 2 + extra;

  const minWidth = Math.max(headerTopWidth, filterRowWidth);
  return Math.max(minWidth, getCssPx("--col-min"));
}

let headerMeasureFont: string | null = null;
let headerMeasureCanvas: HTMLCanvasElement | null = null;

function measureHeaderText(text: string): number {
  if (!text) {
    return 0;
  }
  const font = getHeaderFont();
  if (!font) {
    return text.length * getCssPx("--font-size") * 0.6;
  }
  if (!headerMeasureCanvas) {
    headerMeasureCanvas = document.createElement("canvas");
  }
  const ctx = headerMeasureCanvas.getContext("2d");
  if (!ctx) {
    return text.length * getCssPx("--font-size") * 0.6;
  }
  ctx.font = font;
  return ctx.measureText(text).width;
}

function getHeaderFont(): string {
  if (headerMeasureFont) {
    return headerMeasureFont;
  }
  const probe = document.createElement("span");
  probe.className = "header-title";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "nowrap";
  probe.textContent = "Hg";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  document.body.removeChild(probe);
  headerMeasureFont = font;
  return font;
}

function getTables(db: SqlJsDatabase): string[] {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  if (!result[0]) {
    return [];
  }
  return result[0].values.map((row) => String(row[0] ?? ""));
}

function getRowCount(
  db: SqlJsDatabase,
  table: string,
  filter: FilterClause
): number {
  const result = db.exec(
    `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} ${filter.clause}`,
    filter.params
  );
  const value = result[0]?.values?.[0]?.[0];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function getColumnMeta(db: SqlJsDatabase, table: string): ColumnMeta[] {
  const result = db.exec(`PRAGMA table_info(${quoteIdentifier(table)})`);
  const rows = result[0]?.values ?? [];
  return rows.map((row) => ({
    name: String(row[1] ?? ""),
    type: String(row[2] ?? ""),
    pk: Boolean(row[5])
  }));
}

function getRows(
  db: SqlJsDatabase,
  table: string,
  page: number,
  pageSize: number,
  filter: FilterClause
): RowData[] {
  const offset = (page - 1) * pageSize;
  let result: SqlJsResult[] = [];
  let columns: string[] = [];
  let values: SqlValue[][] = [];
  try {
    result = db.exec(
      `SELECT rowid as __rowid__, * FROM ${quoteIdentifier(table)} ${filter.clause} LIMIT ${pageSize} OFFSET ${offset}`,
      filter.params
    );
  } catch {
    result = db.exec(
      `SELECT * FROM ${quoteIdentifier(table)} ${filter.clause} LIMIT ${pageSize} OFFSET ${offset}`,
      filter.params
    );
  }
  columns = result[0]?.columns ?? [];
  values = result[0]?.values ?? [];
  const rowIdIndex = columns.indexOf("__rowid__");
  return values.map((valueRow, index) => {
    const row: RowData = { __rowIndex: offset + index + 1 } as RowData;
    if (rowIdIndex >= 0) {
      const value = valueRow[rowIdIndex];
      row.__rowId = typeof value === "number" ? value : Number(value ?? 0);
    }
    columns.forEach((column, columnIndex) => {
      if (column === "__rowid__") {
        return;
      }
      row[column] = valueRow[columnIndex] ?? null;
    });
    return row;
  });
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatCell(value: SqlValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Uint8Array) {
    return `[blob ${value.byteLength}]`;
  }
  return String(value);
}

function toSqlLiteral(value: SqlValue): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (value instanceof Uint8Array) {
    const hex = Array.from(value)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return `X'${hex}'`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(text: string): string {
  const normalized = text.replace(/\r?\n/g, "<br>");
  return normalized.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function getSidebarColumns(db: SqlJsDatabase, table: string): ColumnMeta[] {
  const columns = getColumnMeta(db, table);
  return [
    {
      name: "ROWID",
      type: "ROWID",
      pk: true,
      isRowId: true
    },
    ...columns
  ];
}

function getColumnIcon(column: ColumnMeta): string {
  if (column.isRowId) {
    return "codicon-list-tree";
  }
  const type = column.type.toLowerCase();
  if (type.includes("int") || type.includes("real") || type.includes("num")) {
    return "codicon-symbol-number";
  }
  if (type.includes("char") || type.includes("text") || type.includes("clob")) {
    return "codicon-symbol-string";
  }
  if (type.includes("bool")) {
    return "codicon-symbol-boolean";
  }
  if (type.includes("date") || type.includes("time")) {
    return "codicon-calendar";
  }
  return "codicon-symbol-misc";
}

type FilterClause = {
  clause: string;
  params: SqlValue[];
};

function buildWhereClause(
  columns: ColumnMeta[],
  rowFilter: string,
  columnFilters: Record<string, string>,
  columnModes: Record<string, ColumnFilterMode>
): FilterClause {
  const params: SqlValue[] = [];
  const conditions: string[] = [];

  const normalizedRowFilter = rowFilter.trim();
  if (normalizedRowFilter) {
    if (!columns.length) {
      return { clause: "WHERE 0", params: [] };
    }
    const likeValue = `%${normalizedRowFilter}%`;
    const orParts = columns.map(
      (column) => `CAST(${quoteIdentifier(column.name)} AS TEXT) LIKE ?`
    );
    conditions.push(`(${orParts.join(" OR ")})`);
    params.push(...orParts.map(() => likeValue));
  }

  const columnKeys = new Set([
    ...Object.keys(columnFilters),
    ...Object.keys(columnModes)
  ]);
  columnKeys.forEach((column) => {
    if (!columns.some((item) => item.name === column)) {
      return;
    }
    const trimmed = (columnFilters[column] ?? "").trim();
    const mode = columnModes[column] ?? {};
    const columnConditions: string[] = [];
    const columnParams: SqlValue[] = [];

    if (trimmed) {
      if (mode.exact) {
        columnConditions.push(`CAST(${quoteIdentifier(column)} AS TEXT) = ?`);
        columnParams.push(trimmed);
      } else {
        columnConditions.push(`CAST(${quoteIdentifier(column)} AS TEXT) LIKE ?`);
        columnParams.push(`%${trimmed}%`);
      }
    }

    if (mode.nonEmpty) {
      columnConditions.push(
        `(${quoteIdentifier(column)} IS NOT NULL AND CAST(${quoteIdentifier(
          column
        )} AS TEXT) <> '')`
      );
    }

    if (!columnConditions.length) {
      return;
    }

    let condition =
      columnConditions.length > 1
        ? `(${columnConditions.join(" AND ")})`
        : columnConditions[0];

    if (mode.invert) {
      condition = `NOT (${condition})`;
    }

    conditions.push(condition);
    params.push(...columnParams);
  });

  if (!conditions.length) {
    return { clause: "", params: [] };
  }
  return { clause: `WHERE ${conditions.join(" AND ")}`, params };
}

function normalizeBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return new Uint8Array(record.data);
    }
    const values = Object.values(record);
    if (values.length && values.every((item) => typeof item === "number")) {
      return new Uint8Array(values as number[]);
    }
  }
  throw new Error("Database bytes format not supported");
}

function formatHeader(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    return "(empty)";
  }
  const slice = bytes.subarray(0, Math.min(16, bytes.byteLength));
  return Array.from(slice)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join(" ");
}

function getCssPx(variable: string): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const value = styles.getPropertyValue(variable).trim();
  const parsed = parseFloat(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.width = `var(${variable})`;
  root.appendChild(probe);
  const resolved = parseFloat(getComputedStyle(probe).width || "");
  root.removeChild(probe);
  if (Number.isFinite(resolved)) {
    return resolved;
  }

  const fontSize = parseFloat(styles.fontSize || "14");
  return Number.isFinite(fontSize) ? fontSize * 10 : 120;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
