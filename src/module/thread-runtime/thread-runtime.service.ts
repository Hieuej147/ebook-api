import { HttpAgent } from '@ag-ui/client';
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  type AgentRunner,
  type CopilotRuntimeFetchHandler,
} from '@copilotkit/runtime/v2';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request as ExpressRequest, Response } from 'express';
import { Readable } from 'node:stream';
import Redis from 'ioredis';
import { InMemoryRunCoordinator, PersistentAgentRunner, RedisRunCoordinator, type RunCoordinator } from '@bookstore/thread-manager';
import { PrismaEventStore } from './prisma-event.store';
import { OpenAiThreadTitleGenerator } from './openai-thread-title.generator';
import { PrismaThreadStore } from './prisma-thread.store';
import { ThreadRequestContextService } from './thread-request-context.service';

@Injectable()
export class ThreadRuntimeService {
  private readonly handler: CopilotRuntimeFetchHandler;
  readonly runner: PersistentAgentRunner;
  private readonly coordinator: RunCoordinator;

  constructor(
    config: ConfigService,
    store: PrismaThreadStore,
    events: PrismaEventStore,
    titleGenerator: OpenAiThreadTitleGenerator,
    requestContext: ThreadRequestContextService,
  ) {
    const agentId = config.get<string>('COPILOT_AGENT_ID', 'dashboard');
    const redisUrl = config.get<string>('REDIS_URL');
    this.coordinator = redisUrl
      ? new RedisRunCoordinator(new Redis(redisUrl))
      : new InMemoryRunCoordinator();
    const agentUrl = config.get<string>(
      'AGENT_URL',
      'http://127.0.0.1:8001/book-agent',
    );
    const agent = new HttpAgent({
      url: agentUrl,
      fetch: (url, init) => {
        const authorization = requestContext.require().authorization;
        const headers = new Headers(init.headers);
        if (authorization) headers.set('authorization', authorization);
        return fetch(url, { ...init, headers });
      },
    });
    this.runner = new PersistentAgentRunner({
      store,
      events,
      coordinator: this.coordinator,
      titleGenerator,
      defaultThreadTitle: 'New conversation',
      titleTimeoutMs: config.get<number>('THREAD_TITLE_TIMEOUT_MS', 3_000),
      defaultAgentId: agentId,
    });
    const runtime = new CopilotRuntime({
      agents: { [agentId]: agent },
      runner: this.runner as unknown as AgentRunner,
    });
    this.handler = createCopilotRuntimeHandler({
      runtime,
      basePath: '/api/copilotkit',
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.coordinator.close?.();
  }

  async handle(request: ExpressRequest, response: Response): Promise<void> {
    const url = new URL(
      request.originalUrl,
      `${request.protocol}://${request.get('host') ?? 'localhost'}`,
    );
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined && name.toLowerCase() !== 'content-length') {
        headers.set(name, Array.isArray(value) ? value.join(',') : value);
      }
    }
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const webRequest = new Request(url, {
      method: request.method,
      headers,
      body: hasBody ? JSON.stringify(request.body ?? {}) : undefined,
    });
    const webResponse = await this.handler(webRequest);
    response.status(webResponse.status);
    webResponse.headers.forEach((value, name) =>
      response.setHeader(name, value),
    );
    if (webResponse.body) {
      Readable.fromWeb(webResponse.body as never).pipe(response);
    } else {
      response.end();
    }
  }
}
