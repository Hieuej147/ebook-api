import { rmSync } from "node:fs";
import { basename, resolve } from "node:path";

const environment = process.env.NODE_ENV ?? process.env.APP_ENV;
if (environment !== "test" && environment !== "local") {
  throw new Error("Refusing to reset: NODE_ENV=test or APP_ENV=local is required");
}

const target = resolve(
  process.env.SQLITE_PATH ?? ".data/conversation-threads.test.sqlite",
);
if (!basename(target).toLowerCase().includes("test")) {
  throw new Error(`Refusing to reset a non-test SQLite file: ${target}`);
}

for (const path of [target, `${target}-wal`, `${target}-shm`]) {
  rmSync(path, { force: true });
}

process.stdout.write(`Reset SQLite test database: ${target}\n`);
