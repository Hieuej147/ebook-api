import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import type { MemorySaver } from "@langchain/langgraph";
import type { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { resolve } from "node:path";
import type { StoreDriver } from "../types.js";

export type ThreadCheckpointer = MemorySaver | SqliteSaver | PostgresSaver;

export interface CheckpointerOptions {
  driver?: StoreDriver;
  sqlitePath?: string;
  databaseUrl?: string;
  postgresSchema?: string;
}

export async function createCheckpointer(
  options: CheckpointerOptions = {},
): Promise<ThreadCheckpointer> {
  const driver = options.driver ?? (process.env.STORE_DRIVER as StoreDriver | undefined) ?? "sqlite";
  if (driver === "memory") {
    const { MemorySaver } = await import("@langchain/langgraph");
    return new MemorySaver();
  }
  if (driver === "sqlite") {
    const path = options.sqlitePath ?? process.env.SQLITE_PATH ??
      resolve(process.cwd(), ".data/conversation-threads.sqlite");
    const { SqliteSaver } = await import("@langchain/langgraph-checkpoint-sqlite");
    return SqliteSaver.fromConnString(path);
  }
  const url = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required when STORE_DRIVER=postgres");
  const { PostgresSaver } = await import("@langchain/langgraph-checkpoint-postgres");
  const checkpointer = PostgresSaver.fromConnString(url, {
    schema: options.postgresSchema ?? process.env.POSTGRES_SCHEMA,
  });
  await checkpointer.setup();
  return checkpointer;
}

export function asBaseCheckpointSaver(checkpointer: ThreadCheckpointer): BaseCheckpointSaver {
  return checkpointer;
}
