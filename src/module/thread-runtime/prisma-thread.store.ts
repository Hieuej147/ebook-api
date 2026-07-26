import {
  ConversationThreadStatus,
  Prisma,
  type ConversationThread,
} from '@prisma/client';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ThreadListOptions,
  ThreadListResult,
  ThreadMeta,
  ThreadStatus,
  ThreadStore,
} from '@bookstore/thread-manager';
import { PrismaService } from '../prisma/prisma.service';
import { ThreadRequestContextService } from './thread-request-context.service';

function toPrismaStatus(status: ThreadStatus): ConversationThreadStatus {
  return {
    idle: ConversationThreadStatus.IDLE,
    running: ConversationThreadStatus.RUNNING,
    deleting: ConversationThreadStatus.DELETING,
  }[status];
}

function toThreadMeta(row: ConversationThread): ThreadMeta {
  return {
    id: row.id,
    agentId: row.agentId,
    title: row.title,
    status: row.status.toLowerCase() as ThreadStatus,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaThreadStore implements ThreadStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ThreadRequestContextService,
  ) {}

  async create(
    agentId: string,
    threadId: string = randomUUID(),
  ): Promise<ThreadMeta> {
    const { userId } = this.context.require();
    const existing = await this.prisma.conversationThread.findUnique({
      where: { id: threadId },
    });
    if (existing) {
      if (existing.userId !== userId) throw new NotFoundException('Thread not found');
      return toThreadMeta(existing);
    }
    return toThreadMeta(
      await this.prisma.conversationThread.create({
        data: { id: threadId, userId, agentId },
      }),
    );
  }

  async get(threadId: string): Promise<ThreadMeta | null> {
    const { userId } = this.context.require();
    const row = await this.prisma.conversationThread.findFirst({
      where: { id: threadId, userId },
    });
    return row ? toThreadMeta(row) : null;
  }

  async list(options: ThreadListOptions): Promise<ThreadListResult> {
    const { userId } = this.context.require();
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
    const where: Prisma.ConversationThreadWhereInput = {
      userId,
      agentId: options.agentId,
      archivedAt: options.includeArchived ? { not: null } : null,
    };
    if (options.cursor) {
      const cursor = await this.prisma.conversationThread.findFirst({
        where: { id: options.cursor, userId },
        select: { id: true, updatedAt: true },
      });
      if (cursor) {
        where.OR = [
          { updatedAt: { lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
        ];
      }
    }
    const rows = await this.prisma.conversationThread.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      threads: page.map(toThreadMeta),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  async rename(threadId: string, title: string): Promise<ThreadMeta> {
    const row = await this.requireOwned(threadId);
    return toThreadMeta(
      await this.prisma.conversationThread.update({
        where: { id: row.id },
        data: { title: title.trim() || 'New conversation' },
      }),
    );
  }

  async renameIfTitle(
    threadId: string,
    expectedTitle: string,
    title: string,
  ): Promise<ThreadMeta | null> {
    const row = await this.requireOwned(threadId);
    const result = await this.prisma.conversationThread.updateMany({
      where: { id: row.id, userId: row.userId, title: expectedTitle },
      data: { title: title.trim() || 'New conversation' },
    });
    if (result.count === 0) return null;
    return this.get(threadId);
  }

  async touch(threadId: string): Promise<ThreadMeta> {
    const row = await this.requireOwned(threadId);
    return toThreadMeta(
      await this.prisma.conversationThread.update({
        where: { id: row.id },
        data: { updatedAt: new Date() },
      }),
    );
  }

  async setStatus(threadId: string, status: ThreadStatus): Promise<ThreadMeta> {
    const row = await this.requireOwned(threadId);
    return toThreadMeta(
      await this.prisma.conversationThread.update({
        where: { id: row.id },
        data: { status: toPrismaStatus(status) },
      }),
    );
  }

  async delete(threadId: string): Promise<void> {
    const row = await this.requireOwned(threadId);
    await this.prisma.conversationThread.delete({ where: { id: row.id } });
  }

  async archive(threadId: string): Promise<ThreadMeta> {
    const row = await this.requireOwned(threadId);
    return toThreadMeta(
      await this.prisma.conversationThread.update({
        where: { id: row.id },
        data: { archivedAt: new Date(), status: ConversationThreadStatus.IDLE },
      }),
    );
  }

  async unarchive(threadId: string): Promise<ThreadMeta> {
    const row = await this.requireOwned(threadId);
    return toThreadMeta(
      await this.prisma.conversationThread.update({
        where: { id: row.id },
        data: { archivedAt: null },
      }),
    );
  }

  async listAll(options: ThreadListOptions): Promise<ThreadListResult> {
    const context = this.context.require();
    if (context.role !== 'ADMIN') throw new NotFoundException();
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const rows = await this.prisma.conversationThread.findMany({
      where: {
        agentId: options.agentId,
        archivedAt: options.includeArchived ? { not: null } : undefined,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return {
      threads: page.map(toThreadMeta),
      nextCursor: rows.length > limit ? page.at(-1)?.id ?? null : null,
    };
  }

  async getAdmin(threadId: string): Promise<ThreadMeta | null> {
    if (this.context.require().role !== 'ADMIN') throw new NotFoundException();
    const row = await this.prisma.conversationThread.findUnique({
      where: { id: threadId },
    });
    return row ? toThreadMeta(row) : null;
  }

  async permanentDeleteAdmin(threadId: string): Promise<void> {
    if (this.context.require().role !== 'ADMIN') throw new NotFoundException();
    await this.prisma.conversationThread.delete({ where: { id: threadId } });
  }

  private async requireOwned(threadId: string): Promise<ConversationThread> {
    const { userId } = this.context.require();
    const row = await this.prisma.conversationThread.findFirst({
      where: { id: threadId, userId },
    });
    if (!row) throw new NotFoundException('Thread not found');
    return row;
  }
}
