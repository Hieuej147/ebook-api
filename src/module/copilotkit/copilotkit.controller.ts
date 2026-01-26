import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import {
  CopilotRuntime,
  copilotRuntimeNestEndpoint,
  ExperimentalEmptyAdapter,
} from '@copilotkit/runtime';
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import { type Request, type Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller()
export class CopilotkitController {
  constructor(private config: ConfigService) {}
  @All('copilotkit')
  copilotkit(@Req() req: Request, @Res() res: Response) {
    const runtime = new CopilotRuntime({
      agents: {
        nestjs_agent: new LangGraphAgent({
          deploymentUrl:
            this.config.get<string>('NESTJS_AGENT_URL') ||
            'http://localhost:8123',
          graphId: 'nestjs_agent',
          langsmithApiKey: '',
        }),
      },
    });
    const handler = copilotRuntimeNestEndpoint({
      runtime,
      serviceAdapter: new ExperimentalEmptyAdapter(),
      endpoint: '/copilotkit',
    });
    return handler(req, res);
  }
}
