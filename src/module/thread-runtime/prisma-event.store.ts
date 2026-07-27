import {
  AgentRunKind,
  AgentRunStatus,
  Prisma,
} from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { BaseEvent, RunAgentInput } from '@ag-ui/client';
import type {
  EventStore,
  RunStartMetadata,
  StoredRunEvent,
} from '@bookstore/thread-manager';
import { ThreadLockedError } from '@bookstore/thread-manager';
import { PrismaService } from '../prisma/prisma.service';
import { ThreadRequestContextService } from './thread-request-context.service';

@Injectable()
export class PrismaEventStore implements EventStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ThreadRequestContextService,
  ) {}

  async startRun(
    threadId: string,
    runId: string,
    input: RunAgentInput,
    agentId: string,
    metadata: RunStartMetadata = {},
  ): Promise<void> {
    await this.requireOwned(threadId);
    const parent = metadata.parentRunId
      ? await this.prisma.agentRun.findFirst({
          where: { id: metadata.parentRunId, threadId },
          select: { rootRunId: true, depth: true },
        })
      : null;
    if (metadata.parentRunId && !parent) {
      throw new NotFoundException('Parent run not found');
    }
    try {
      await this.prisma.agentRun.create({
        data: {
          id: runId,
          threadId,
          agentId,
          parentRunId: metadata.parentRunId,
          rootRunId: metadata.rootRunId ?? parent?.rootRunId ?? runId,
          depth: metadata.depth ?? (parent ? parent.depth + 1 : 0),
          kind: metadata.kind === 'subagent' ? AgentRunKind.SUBAGENT : AgentRunKind.ROOT,
          input: input as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ThreadLockedError(threadId);
      }
      throw error;
    }
  }

  async append(item: StoredRunEvent): Promise<void> {
    await this.requireOwned(item.threadId);
    await this.prisma.agentEvent.upsert({
      where: {
        runId_sequence: { runId: item.runId, sequence: item.sequence },
      },
      create: {
        runId: item.runId,
        threadId: item.threadId,
        sequence: item.sequence,
        event: item.event as unknown as Prisma.InputJsonValue,
      },
      update: {
        event: item.event as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async appendBatch(items: StoredRunEvent[]): Promise<void> {
    if (items.length === 0) return;
    await this.requireOwned(items[0]!.threadId);
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.agentEvent.upsert({
          where: {
            runId_sequence: { runId: item.runId, sequence: item.sequence },
          },
          create: {
            runId: item.runId,
            threadId: item.threadId,
            sequence: item.sequence,
            event: item.event as unknown as Prisma.InputJsonValue,
          },
          update: {
            event: item.event as unknown as Prisma.InputJsonValue,
          },
        }),
      ),
    );
  }

  async replaceRunEvents(
    threadId: string,
    runId: string,
    items: StoredRunEvent[],
  ): Promise<void> {
    await this.requireOwned(threadId);
    await this.prisma.$transaction(async (tx) => {
      await tx.agentEvent.deleteMany({ where: { threadId, runId } });
      if (items.length > 0) {
        await tx.agentEvent.createMany({
          data: items.map((item) => ({
            runId: item.runId,
            threadId: item.threadId,
            sequence: item.sequence,
            event: item.event as unknown as Prisma.InputJsonValue,
          })),
        });
      }
    });
  }

  async finishRun(
    threadId: string,
    runId: string,
    status: 'completed' | 'error' | 'stopped',
  ): Promise<void> {
    await this.requireOwned(threadId);
    const mapped = {
      completed: AgentRunStatus.COMPLETED,
      error: AgentRunStatus.ERROR,
      stopped: AgentRunStatus.STOPPED,
    }[status];
    await this.prisma.agentRun.updateMany({
      where: { id: runId, threadId },
      data: { status: mapped, finishedAt: new Date() },
    });
  }

  async history(threadId: string): Promise<StoredRunEvent[]> {
    await this.requireOwned(threadId);
    const rows = await this.prisma.agentEvent.findMany({
      where: { threadId },
      orderBy: [{ run: { startedAt: 'asc' } }, { sequence: 'asc' }],
    });
    return rows.map((row) => ({
      threadId: row.threadId,
      runId: row.runId,
      sequence: row.sequence,
      event: row.event as unknown as BaseEvent,
    }));
  }

  async active(
    threadId: string,
  ): Promise<{ runId: string; status: 'running' } | null> {
    await this.requireOwned(threadId);
    const run = await this.prisma.agentRun.findFirst({
      where: { threadId, status: AgentRunStatus.RUNNING },
      select: { id: true },
    });
    return run ? { runId: run.id, status: 'running' } : null;
  }

  async removeThread(threadId: string): Promise<void> {
    await this.requireOwned(threadId);
    await this.prisma.agentRun.deleteMany({ where: { threadId } });
  }

  private async requireOwned(threadId: string): Promise<void> {
    const { userId } = this.context.require();
    const count = await this.prisma.conversationThread.count({
      where: { id: threadId, userId },
    });
    if (!count) throw new NotFoundException('Thread not found');
  }
}
