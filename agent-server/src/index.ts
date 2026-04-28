import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner,
} from '@copilotkitnext/runtime';
import { LangGraphAgent, LangGraphHttpAgent } from '@ag-ui/langgraph';

// ============================================
// Config từ env
// ============================================
const LANGGRAPH_TS_URL =
  process.env.LANGGRAPH_TS_URL || 'http://localhost:8123';
const PYTHON_AGENT_URL =
  process.env.PYTHON_AGENT_URL || 'http://localhost:8000/book-agent';
const PYTHON_AGENT_V2_URL =
  process.env.PYTHON_AGENT_V2_URL || 'http://localhost:8001/book-agent';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') ?? [
  'http://localhost:4200',
];
const PORT = Number(process.env.PORT ?? 3001);

// ============================================
// Chọn agent python nào dùng (v1 hoặc v2)
// Đổi USE_PYTHON_V2=true trong .env để switch
// ============================================
const USE_PYTHON_V2 = process.env.USE_PYTHON_V2 === 'true';
const activePythonUrl = USE_PYTHON_V2 ? PYTHON_AGENT_V2_URL : PYTHON_AGENT_URL;

console.log(` Agent Server starting...`);
console.log(`LangGraph TS: ${LANGGRAPH_TS_URL}`);
console.log(
  `🐍 Python Agent: ${activePythonUrl} (${USE_PYTHON_V2 ? 'v2' : 'v1'})`,
);

// ============================================
// Hono App
// ============================================
const app = new Hono();

app.use(
  '*',
  cors({
    origin: ALLOWED_ORIGINS,
    allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-copilotcloud-public-api-key',
    ],
    exposeHeaders: ['Content-Type'],
    credentials: true,
    maxAge: 86400,
  }),
);

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    pythonAgent: USE_PYTHON_V2 ? 'v2' : 'v1',
    activePythonUrl,
    langraphTsUrl: LANGGRAPH_TS_URL,
  });
});

// CopilotKit endpoint
app.use('/api/copilotkit/*', async (c) => {
  const authHeader = c.req.header('authorization');

  // tạo runtime riêng cho mỗi request
  const runtime = new CopilotRuntime({
    agents: {
      ebook_agent: new LangGraphAgent({
        deploymentUrl: LANGGRAPH_TS_URL,
        graphId: 'ebook_agent',
        langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
      }) as any,

      dashboard: new LangGraphHttpAgent({
        url: activePythonUrl,
        headers: authHeader ? { authorization: authHeader } : {},
      }) as any,
    },
    runner: new InMemoryAgentRunner(),
  });

  const handler = createCopilotEndpoint({
    runtime,
    basePath: '/api/copilotkit',
  });

  return handler.fetch(c.req.raw);
});

// ============================================
// Start Server
// ============================================
serve({ fetch: app.fetch, port: PORT });

console.log(
  `Agent Server running at http://localhost:${PORT}/api/copilotkit`,
);
