// import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
// import {
//   CopilotRuntime,
//   copilotRuntimeNestEndpoint,
//   OpenAIAdapter,
// } from '@copilotkit/runtime';
// import {
//   LangGraphAgent,
//   LangGraphHttpAgent,
// } from '@copilotkit/runtime/langgraph';
// import { type Request, type Response } from 'express';
// import { ConfigService } from '@nestjs/config';

// @Controller()
// export class CopilotkitController {
//   constructor(private config: ConfigService) {}
//   @All('copilotkit')
//   copilotkit(@Req() req: Request, @Res() res: Response) {
//     const runtime = new CopilotRuntime({
//       agents: {
//         default: new LangGraphAgent({
//           deploymentUrl:
//             this.config.get('PYTHON_AGENT_URL') || 'http://localhost:8123',
//           graphId: 'default',
//         }) as any,
//       },
//     });
//     const handler = copilotRuntimeNestEndpoint({
//       runtime,
//       serviceAdapter: new OpenAIAdapter(),
//       endpoint: '/copilotkit',
//     });
//     return handler(req, res);
//   }
// }
