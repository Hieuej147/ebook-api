import type {
  EventStore,
  MessageProjector,
  ThreadListOptions,
  ThreadMeta,
  ThreadStore,
} from "../types.js";
import { ThreadNotFoundError } from "../types.js";

export interface ThreadRouterDeps {
  store: ThreadStore;
  events?: EventStore;
  projector?: MessageProjector;
  deleteThread?: (threadId: string) => Promise<void>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function validTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 120;
}

function parseLimit(value: string | null): number | undefined {
  if (value === null) return undefined;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer between 1 and 100");
  return limit;
}

export function createThreadsRouter(deps: ThreadRouterDeps) {
  return async function threadsRouter(request: Request, basePath: string): Promise<Response | undefined> {
    const url = new URL(request.url);
    const base = basePath.replace(/\/$/, "");
    const relative = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname;
    const segments = relative.split("/").filter(Boolean);
    if (segments[0] !== "threads" || segments.length > 3) return undefined;

    try {
      if (segments.length === 1 && request.method === "GET") {
        const options: ThreadListOptions = {
          agentId: url.searchParams.get("agentId") ?? undefined,
          cursor: url.searchParams.get("cursor") ?? undefined,
          limit: parseLimit(url.searchParams.get("limit")),
        };
        return json(await deps.store.list(options));
      }
      if (segments.length === 1 && request.method === "POST") {
        const body = await request.json() as { agentId?: unknown; threadId?: unknown; title?: unknown };
        if (typeof body.agentId !== "string" || body.agentId.trim() === "") return json({ error: "agentId is required" }, 400);
        const thread = await deps.store.create(body.agentId.trim(), typeof body.threadId === "string" ? body.threadId : undefined);
        if (validTitle(body.title)) return json(await deps.store.rename(thread.id, body.title.trim()), 201);
        return json(thread, 201);
      }
      if (segments.length === 3 && segments[2] === "messages" && request.method === "GET") {
        if (!deps.projector) return json({ error: "Message projection is unavailable" }, 404);
        const threadId = decodeURIComponent(segments[1]!);
        return json(await deps.projector.listMessages(threadId));
      }
      if (segments.length === 2) {
        const threadId = decodeURIComponent(segments[1]!);
        if (request.method === "GET") {
          const thread = await deps.store.get(threadId);
          return thread ? json(thread) : json({ error: "Thread not found" }, 404);
        }
        if (request.method === "PATCH") {
          const body = await request.json() as { title?: unknown };
          if (!validTitle(body.title)) return json({ error: "title must be a non-empty string of at most 120 characters" }, 400);
          return json(await deps.store.rename(threadId, body.title.trim()));
        }
        if (request.method === "DELETE") {
          if (deps.deleteThread) await deps.deleteThread(threadId);
          else {
            await deps.events?.removeThread(threadId);
            await deps.store.delete(threadId);
          }
          return new Response(null, { status: 204 });
        }
      }
      return json({ error: "Method not allowed" }, 405);
    } catch (error) {
      if (error instanceof ThreadNotFoundError) return json({ error: error.message }, 404);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON body" }, 400);
      return json({ error: error instanceof Error ? error.message : "Thread request failed" }, 500);
    }
  };
}

export type ThreadRouteHandler = ReturnType<typeof createThreadsRouter>;
