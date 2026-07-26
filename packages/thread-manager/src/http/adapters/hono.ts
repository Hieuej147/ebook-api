import type { CopilotRuntimeFetchHandler } from "@copilotkit/runtime/v2";

export interface HonoLikeApp {
  all(path: string, handler: (context: { req: { raw: Request } }) => Response | Promise<Response>): unknown;
}

export function mountHono(app: HonoLikeApp, path: string, handler: CopilotRuntimeFetchHandler): void {
  app.all(`${path}/*`, (context) => handler(context.req.raw));
}
