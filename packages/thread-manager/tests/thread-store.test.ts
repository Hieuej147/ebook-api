import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { InMemoryThreadStore } from "../src/stores/in-memory-store.js";
import { SqliteThreadStore } from "../src/stores/sqlite-store.js";
import { ThreadNotFoundError } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe.each([
  ["memory", async () => new InMemoryThreadStore()],
  ["sqlite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "thread-manager-"));
    tempDirs.push(directory);
    return new SqliteThreadStore({ path: join(directory, "threads.sqlite") });
  }],
])("%s thread store", (_name, createStore) => {
  it("creates, lists, renames, touches and deletes a stable thread id", async () => {
    const store = await createStore();
    const created = await store.create("agent", "thread-1");
    expect(created.id).toBe("thread-1");
    expect((await store.get("thread-1"))?.agentId).toBe("agent");

    const renamed = await store.rename("thread-1", "Renamed");
    expect(renamed.title).toBe("Renamed");
    const listed = await store.list({ agentId: "agent", limit: 10 });
    expect(listed.threads.map((thread) => thread.id)).toEqual(["thread-1"]);

    await store.delete("thread-1");
    await expect(store.get("thread-1")).resolves.toBeNull();
    await expect(store.delete("thread-1")).rejects.toBeInstanceOf(ThreadNotFoundError);
    await store.close?.();
  });

  it("creates an unknown thread on connect-style pre-run access", async () => {
    const store = await createStore();
    const thread = await store.create("default", "fresh-thread");
    expect(thread.status).toBe("idle");
    await store.close?.();
  });

  it("renames only while the default title is unchanged", async () => {
    const store = await createStore();
    await store.create("default", "title-thread");
    await expect(
      store.renameIfTitle("title-thread", "New conversation", "AI title"),
    ).resolves.toMatchObject({ title: "AI title" });
    await expect(
      store.renameIfTitle("title-thread", "New conversation", "stale title"),
    ).resolves.toBeNull();
    await store.close?.();
  });
});
