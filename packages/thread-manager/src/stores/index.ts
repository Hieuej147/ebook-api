import { resolve } from "node:path";
import { InMemoryThreadStore } from "./in-memory-store.js";
import { PostgresThreadStore } from "./postgres-store.js";
import { SqliteThreadStore } from "./sqlite-store.js";
import type { StoreDriver, ThreadStore } from "../types.js";

export interface ThreadStoreFactoryOptions {
  sqlitePath?: string;
  databaseUrl?: string;
  postgresSchema?: string;
}

export async function createThreadStore(
  driver: StoreDriver = (process.env.STORE_DRIVER as StoreDriver | undefined) ?? "sqlite",
  options: ThreadStoreFactoryOptions = {},
): Promise<ThreadStore> {
  if (driver === "memory") return new InMemoryThreadStore();
  if (driver === "sqlite") {
    const path = options.sqlitePath ?? process.env.SQLITE_PATH ?? resolve(process.cwd(), ".data/conversation-threads.sqlite");
    return new SqliteThreadStore({ path });
  }
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required when STORE_DRIVER=postgres");
  const store = new PostgresThreadStore({ connectionString: databaseUrl, schema: options.postgresSchema ?? process.env.POSTGRES_SCHEMA });
  await store.initialize();
  return store;
}

export { InMemoryThreadStore } from "./in-memory-store.js";
export { SqliteThreadStore } from "./sqlite-store.js";
export { PostgresThreadStore } from "./postgres-store.js";
