declare module "sql.js/dist/sql-wasm.wasm?url" {
  const url: string;
  export default url;
}

declare module "sql.js" {
  export type SqlJsValue = string | number | null | Uint8Array;

  export interface QueryResult {
    columns: string[];
    values: SqlJsValue[][];
  }

  export interface Database {
    exec: (sql: string, params?: SqlJsValue[]) => QueryResult[];
    export: () => Uint8Array;
    close: () => void;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  const initSqlJs: (config?: SqlJsConfig) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
