import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorator/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { RequestWithUser } from '../../common/interfaces/req-user.interface';
import { PrismaThreadStore } from './prisma-thread.store';
import { ThreadRequestContextService } from './thread-request-context.service';

@Controller('api/admin/copilotkit/threads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminThreadsController {
  constructor(
    private readonly store: PrismaThreadStore,
    private readonly context: ThreadRequestContextService,
  ) {}

  @Get()
  list(
    @Req() request: Request,
    @Query('agentId') agentId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('archived') archived?: string,
  ) {
    return this.scoped(request, () =>
      this.store.listAll({
        agentId,
        cursor,
        limit,
        includeArchived: archived === 'true' ? true : undefined,
      }),
    );
  }

  @Get(':threadId')
  get(@Req() request: Request, @Param('threadId') threadId: string) {
    return this.scoped(request, async () => {
      const thread = await this.store.getAdmin(threadId);
      if (!thread) throw new NotFoundException('Thread not found');
      return thread;
    });
  }

  @Delete(':threadId')
  remove(@Req() request: Request, @Param('threadId') threadId: string) {
    return this.scoped(request, () =>
      this.store.permanentDeleteAdmin(threadId),
    );
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
