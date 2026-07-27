import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/interfaces/req-user.interface';
import { PrismaThreadStore } from './prisma-thread.store';
import { PrismaEventStore } from './prisma-event.store';
import { ThreadRequestContextService } from './thread-request-context.service';

interface RenameThreadBody {
  title: string;
}

@Controller('api/copilotkit/threads')
@UseGuards(JwtAuthGuard)
export class ThreadsController {
  constructor(
    private readonly store: PrismaThreadStore,
    private readonly events: PrismaEventStore,
    private readonly context: ThreadRequestContextService,
  ) {}

  @Post()
  create(
    @Req() request: Request,
    @Body() body: { agentId?: string; threadId?: string; title?: string },
  ) {
    return this.scoped(request, async () => {
      const thread = await this.store.create(
        body.agentId ?? 'dashboard',
        body.threadId,
      );
      return body.title
        ? this.store.rename(thread.id, body.title)
        : thread;
    });
  }

  @Get()
  list(
    @Req() request: Request,
    @Query('agentId') agentId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('archived') archived?: string,
  ) {
    return this.scoped(request, () =>
      this.store.list({
        agentId,
        cursor,
        limit,
        includeArchived: archived === 'true',
      }),
    );
  }

  @Get(':threadId')
  async get(@Req() request: Request, @Param('threadId') threadId: string) {
    return this.scoped(request, async () => {
      const thread = await this.store.get(threadId);
      if (!thread) throw new NotFoundException('Thread not found');
      return thread;
    });
  }

  @Get(':threadId/events')
  eventsHistory(@Req() request: Request, @Param('threadId') threadId: string) {
    return this.scoped(request, () => this.events.history(threadId));
  }

  @Patch(':threadId')
  rename(
    @Req() request: Request,
    @Param('threadId') threadId: string,
    @Body() body: RenameThreadBody,
  ) {
    return this.scoped(request, () => this.store.rename(threadId, body.title));
  }

  @Delete(':threadId')
  archive(@Req() request: Request, @Param('threadId') threadId: string) {
    return this.scoped(request, () => this.store.archive(threadId));
  }

  @Post(':threadId/archive')
  archiveExplicit(
    @Req() request: Request,
    @Param('threadId') threadId: string,
  ) {
    return this.scoped(request, () => this.store.archive(threadId));
  }

  @Post(':threadId/unarchive')
  unarchive(@Req() request: Request, @Param('threadId') threadId: string) {
    return this.scoped(request, () => this.store.unarchive(threadId));
  }

  private scoped<T>(request: Request, callback: () => T): T {
    const authenticated = request as RequestWithUser;
    return this.context.run(
      {
        userId: authenticated.user.id,
        role: authenticated.user.role,
        authorization: request.header('authorization'),
      },
      callback,
    );
  }
}
