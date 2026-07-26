import { describe, expect, it } from "vitest";
import { InMemoryThreadStore } from "../src/stores/in-memory-store.js";
import { createThreadsRouter } from "../src/http/threads-router.js";

describe("thread router", () => {
  it("supports CRUD over Fetch Request/Response", async () => {
    const store = new InMemoryThreadStore();
    const router = createThreadsRouter({ store });
    const base = "http://localhost/api/copilotkit";

    const createdResponse = await router(new Request(`${base}/threads`, {
      method: "POST",
      body: JSON.stringify({ agentId: "default" }),
      headers: { "content-type": "application/json" },
    }), "/api/copilotkit");
    expect(createdResponse?.status).toBe(201);
    const created = await createdResponse?.json() as { id: string };

    const renamed = await router(new Request(`${base}/threads/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "A thread" }),
      headers: { "content-type": "application/json" },
    }), "/api/copilotkit");
    expect((await renamed?.json()).title).toBe("A thread");

    const listed = await router(new Request(`${base}/threads?agentId=default`), "/api/copilotkit");
    expect((await listed?.json()).threads).toHaveLength(1);

    const deleted = await router(new Request(`${base}/threads/${created.id}`, { method: "DELETE" }), "/api/copilotkit");
    expect(deleted?.status).toBe(204);
  });
});
