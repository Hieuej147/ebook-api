import {
  All,
  Controller,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/interfaces/req-user.interface';
import { ThreadRequestContextService } from './thread-request-context.service';
import { ThreadRuntimeService } from './thread-runtime.service';

@Controller('api/copilotkit')
@UseGuards(JwtAuthGuard)
export class ThreadRuntimeController {
  constructor(
    private readonly runtime: ThreadRuntimeService,
    private readonly context: ThreadRequestContextService,
  ) {}

  @All()
  base(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.forward(request, response);
  }

  @All('info')
  info(@Req() request: Request, @Res() response: Response): Promise<void> {
    return this.forward(request, response);
  }

  @All('agent/:agentId/run')
  run(
    @Param('agentId') _agentId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward(request, response);
  }

  @All('agent/:agentId/connect')
  connect(
    @Param('agentId') _agentId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward(request, response);
  }

  @All('agent/:agentId/stop/:threadId')
  stop(
    @Param('agentId') _agentId: string,
    @Param('threadId') _threadId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward(request, response);
  }

  private forward(request: Request, response: Response): Promise<void> {
    const authenticated = request as RequestWithUser;
    return this.context.run(
      {
        userId: authenticated.user.id,
        role: authenticated.user.role,
        authorization: request.header('authorization'),
      },
      () => this.runtime.handle(request, response),
    );
  }
}
