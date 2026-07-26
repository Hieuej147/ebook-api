import {
  ConversationMessageStatus,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import type { BaseEvent } from '@ag-ui/client';
import type {
  ConversationMessage,
  MessageProjector,
} from '@bookstore/thread-manager';
import { PrismaService } from '../prisma/prisma.service';
import { ThreadRequestContextService } from './thread-request-context.service';

type EventFields = BaseEvent & {
  messageId?: string;
  role?: string;
  delta?: unknown;
  messages?: Array<{ id?: string; role?: string; content?: string }>;
};

@Injectable()
export class PrismaMessageProjector implements MessageProjector {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ThreadRequestContextService,
  ) {}

  async apply(threadId: string, runId: string, event: BaseEvent): Promise<void> {
    const value = event as EventFields;
    const type = String(value.type);
    if (type === 'MESSAGES_SNAPSHOT' && value.messages) {
      for (const message of value.messages) {
        if (!message.id || typeof message.content !== 'string') continue;
        await this.requireOwned(threadId);
        const now = new Date();
        await this.prisma.conversationMessage.upsert({
          where: { id: message.id },
          create: {
            id: message.id,
            threadId,
            runId,
            role: message.role ?? 'assistant',
            content: message.content,
            status: ConversationMessageStatus.COMPLETED,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            content: message.content,
            status: ConversationMessageStatus.COMPLETED,
            updatedAt: now,
          },
        });
      }
      return;
    }
    if (
      !value.messageId ||
      !['TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END'].includes(type)
    ) {
      return;
    }
    await this.requireOwned(threadId);
    const now = new Date();
    const existing = await this.prisma.conversationMessage.findUnique({
      where: { id: value.messageId },
    });
    await this.prisma.conversationMessage.upsert({
      where: { id: value.messageId },
      create: {
        id: value.messageId,
        threadId,
        runId,
        role: value.role ?? 'assistant',
        content: type === 'TEXT_MESSAGE_CONTENT' && typeof value.delta === 'string'
          ? value.delta
          : '',
        status: type === 'TEXT_MESSAGE_END'
          ? ConversationMessageStatus.COMPLETED
          : ConversationMessageStatus.STREAMING,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        ...(type === 'TEXT_MESSAGE_CONTENT'
          ? { content: `${existing?.content ?? ''}${typeof value.delta === 'string' ? value.delta : ''}` }
          : {}),
        ...(type === 'TEXT_MESSAGE_END'
          ? { status: ConversationMessageStatus.COMPLETED }
          : {}),
        updatedAt: now,
      },
    });
  }

  async listMessages(threadId: string): Promise<ConversationMessage[]> {
    await this.requireOwned(threadId);
    const rows = await this.prisma.conversationMessage.findMany({
      where: { threadId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      runId: row.runId,
      role: row.role,
      content: row.content,
      status: row.status.toLowerCase() as ConversationMessage['status'],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async removeThread(threadId: string): Promise<void> {
    await this.requireOwned(threadId);
    await this.prisma.conversationMessage.deleteMany({ where: { threadId } });
  }

  private async requireOwned(threadId: string): Promise<void> {
    const { userId } = this.context.require();
    const count = await this.prisma.conversationThread.count({
      where: { id: threadId, userId },
    });
    if (!count) throw new Error('Thread not found');
  }
}
