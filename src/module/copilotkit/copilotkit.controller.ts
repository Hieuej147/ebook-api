import { All, Controller, Req, Res } from '@nestjs/common';
import {
  CopilotRuntime,
  copilotRuntimeNestEndpoint,
  EmptyAdapter,
} from '@copilotkit/runtime';
import {
  LangGraphAgent,
  LangGraphHttpAgent,
} from '@copilotkit/runtime/langgraph';
import { type Request, type Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller()
export class CopilotkitController {
  constructor(private config: ConfigService) {}
  @All(['copilotkit', 'copilotkit/*path'])
  copilotkit(@Req() req: Request, @Res() res: Response) {
    const authHeader = req.headers['authorization'];
    const runtime = new CopilotRuntime({
      agents: {
        ebook_agent: new LangGraphAgent({
          deploymentUrl:
            this.config.get('PYTHON_AGENT_URL') || 'http://localhost:8123',
          graphId: 'ebook_agent',
        }),
        dashboard: new LangGraphHttpAgent({
          url:
            this.config.get('TYPESCRIPT_AGENT_URL') ||
            'http://localhost:8000/book-agent',
          headers: authHeader ? { authorization: authHeader } : {},
        }),
      },
    });
    const handler = copilotRuntimeNestEndpoint({
      runtime,
      serviceAdapter: new EmptyAdapter(),
      endpoint: '/copilotkit',
    });
    return handler(req, res);
  }
}
