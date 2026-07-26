import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CopilotRuntimeFetchHandler } from "@copilotkit/runtime/v2";

export interface ExpressLikeApp {
  all(path: string | RegExp, handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>): unknown;
}

export function mountExpress(app: ExpressLikeApp, path: string, handler: CopilotRuntimeFetchHandler): void {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  app.all(new RegExp(`^${escapedPath}(?:/.*)?$`), async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const webRequest = new Request(url, {
      method: request.method,
      headers: request.headers as HeadersInit,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request as unknown as BodyInit,
      duplex: "half",
    } as RequestInit);
    const webResponse = await handler(webRequest);
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => response.setHeader(key, value));
    if (webResponse.body) Readable.fromWeb(webResponse.body as never).pipe(response);
    else response.end();
  });
}
