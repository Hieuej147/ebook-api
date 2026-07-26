import { Readable } from "node:stream";
import type { CopilotRuntimeFetchHandler } from "@copilotkit/runtime/v2";

export interface FastifyLikeApp {
  all(path: string, handler: (request: { raw: Request }, reply: {
    code(status: number): unknown;
    header(name: string, value: string): unknown;
    send(payload?: unknown): unknown;
  }) => unknown): unknown;
}

export function mountFastify(app: FastifyLikeApp, path: string, handler: CopilotRuntimeFetchHandler): void {
  app.all(`${path}/*`, async (request, reply) => {
    const response = await handler(request.raw);
    reply.code(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));
    if (!response.body) return reply.send();
    return reply.send(Readable.fromWeb(response.body as never));
  });
}
