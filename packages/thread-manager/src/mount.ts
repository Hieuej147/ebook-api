import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  type AgentsConfig,
  type CopilotRuntimeFetchHandler,
} from '@copilotkit/runtime/v2';
import { PersistentAgentRunner } from './runner/persistent-agent-runner.js';
import { createEventStore } from './runner/event-store.js';
import { createThreadsRouter } from './http/threads-router.js';
import { createThreadStore } from './stores/index.js';
import { mountExpress, type ExpressLikeApp } from './http/adapters/express.js';
import { mountHono, type HonoLikeApp } from './http/adapters/hono.js';
import { mountFastify, type FastifyLikeApp } from './http/adapters/fastify.js';
import type { StoreDriver, ThreadStore } from './types.js';

export type ThreadFramework = 'fetch' | 'express' | 'hono' | 'fastify';

export interface MountThreadModuleOptions {
  framework: ThreadFramework;
  basePath?: string;
  storeDriver?: StoreDriver;
  agents: AgentsConfig;
  app?: ExpressLikeApp | HonoLikeApp | FastifyLikeApp;
  cors?: Parameters<typeof createCopilotRuntimeHandler>[0]['cors'];
}

export interface ThreadModule {
  handler: CopilotRuntimeFetchHandler;
  runtime: CopilotRuntime;
  runner: PersistentAgentRunner;
  store: ThreadStore;
  close(): Promise<void>;
}

export function mountThreadModule(
  options: MountThreadModuleOptions,
): Promise<ThreadModule>;
export function mountThreadModule(
  app: ExpressLikeApp | HonoLikeApp | FastifyLikeApp,
  options: Omit<MountThreadModuleOptions, 'app'>,
): Promise<ThreadModule>;
export async function mountThreadModule(
  first:
    | MountThreadModuleOptions
    | ExpressLikeApp
    | HonoLikeApp
    | FastifyLikeApp,
  second?: Omit<MountThreadModuleOptions, 'app'>,
): Promise<ThreadModule> {
  const options: MountThreadModuleOptions = second
    ? { ...second, app: first as ExpressLikeApp | HonoLikeApp | FastifyLikeApp }
    : (first as MountThreadModuleOptions);
  const basePath = options.basePath ?? '/api/copilotkit';
  const driver =
    options.storeDriver ??
    (process.env.STORE_DRIVER as StoreDriver | undefined) ??
    'sqlite';
  const store = await createThreadStore(driver);
  const events = await createEventStore(driver);
  const runner = new PersistentAgentRunner({
    store,
    events,
    defaultAgentId: 'default',
  });
  const runtime = new CopilotRuntime({ agents: options.agents, runner });
  const copilotHandler = createCopilotRuntimeHandler({
    runtime,
    basePath,
    cors: options.cors,
  });
  const threads = createThreadsRouter({
    store,
    events,
    deleteThread: (threadId) => runner.deleteThread(threadId),
  });
  const handler: CopilotRuntimeFetchHandler = async (request) => {
    const threadResponse = await threads(request, basePath);
    return threadResponse ?? copilotHandler(request);
  };

  if (options.framework === 'express') {
    if (!options.app)
      throw new Error('app is required for the Express framework');
    mountExpress(options.app as ExpressLikeApp, basePath, handler);
  } else if (options.framework === 'hono') {
    if (!options.app) throw new Error('app is required for the Hono framework');
    mountHono(options.app as HonoLikeApp, basePath, handler);
  } else if (options.framework === 'fastify') {
    if (!options.app)
      throw new Error('app is required for the Fastify framework');
    mountFastify(options.app as FastifyLikeApp, basePath, handler);
  }

  return {
    handler,
    runtime,
    runner,
    store,
    async close() {
      await events.close?.();
      await store.close?.();
    },
  };
}
